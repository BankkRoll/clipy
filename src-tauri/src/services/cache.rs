//! Cache management service for thumbnails and temporary files
//!
//! Each public `AppHandle` entry point resolves its directory and delegates to
//! a directory-based function, which is what the tests exercise.

use crate::error::{ClipyError, Result};
use crate::utils::paths;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Runtime};
use tokio::fs;
use tracing::{debug, info};

/// Cache statistics
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    /// `thumbnail_size + temp_file_size`, in bytes.
    pub total_size: u64,
    /// Number of files under the cache directory.
    pub thumbnail_count: u64,
    /// Bytes under the cache directory.
    pub thumbnail_size: u64,
    /// Number of files under the temp directory.
    pub temp_file_count: u64,
    /// Bytes under the temp directory.
    pub temp_file_size: u64,
}

/// Get cache statistics
pub async fn get_cache_stats<R: Runtime>(app: &AppHandle<R>) -> Result<CacheStats> {
    let stats = cache_stats_in(&paths::get_cache_dir(app)?, &paths::get_temp_dir(app)?).await;
    debug!("Cache stats: {:?}", stats);
    Ok(stats)
}

/// Statistics for an explicit cache/temp directory pair. Missing directories
/// count as empty.
pub async fn cache_stats_in(cache_dir: &Path, temp_dir: &Path) -> CacheStats {
    let (thumbnail_count, thumbnail_size) = calculate_dir_stats(cache_dir).await;
    let (temp_file_count, temp_file_size) = calculate_dir_stats(temp_dir).await;
    CacheStats {
        total_size: thumbnail_size + temp_file_size,
        thumbnail_count,
        thumbnail_size,
        temp_file_count,
        temp_file_size,
    }
}

/// Recursive `(file count, total bytes)` for `path`.
async fn calculate_dir_stats(path: &Path) -> (u64, u64) {
    let mut count = 0u64;
    let mut size = 0u64;

    if let Ok(mut entries) = fs::read_dir(path).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if let Ok(metadata) = entry.metadata().await {
                if metadata.is_file() {
                    count += 1;
                    size += metadata.len();
                } else if metadata.is_dir() {
                    let (sub_count, sub_size) = Box::pin(calculate_dir_stats(&entry.path())).await;
                    count += sub_count;
                    size += sub_size;
                }
            }
        }
    }

    (count, size)
}

/// Clear all cache
pub async fn clear_cache<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    info!("Clearing all cache");
    clear_directory(&paths::get_cache_dir(app)?).await
}

/// Clear temporary files
pub async fn clear_temp<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    info!("Clearing temporary files");
    clear_directory(&paths::get_temp_dir(app)?).await
}

/// Remove everything inside `path` but keep `path` itself. A missing
/// directory is treated as already clear.
pub async fn clear_directory(path: &Path) -> Result<()> {
    if !path.exists() {
        debug!("Directory does not exist, nothing to clear: {:?}", path);
        return Ok(());
    }

    let mut entries = fs::read_dir(path)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read directory: {}", e)))?;

    let mut removed_count = 0u32;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            fs::remove_dir_all(&entry_path)
                .await
                .map_err(|e| ClipyError::Other(format!("Failed to remove directory: {}", e)))?;
        } else {
            fs::remove_file(&entry_path)
                .await
                .map_err(|e| ClipyError::Other(format!("Failed to remove file: {}", e)))?;
        }
        removed_count += 1;
    }

    debug!("Removed {} items from {:?}", removed_count, path);
    Ok(())
}

/// Clean up old cache files (older than max_age_days)
pub async fn cleanup_old_cache<R: Runtime>(app: &AppHandle<R>, max_age_days: u32) -> Result<u64> {
    let max_age = Duration::from_secs(max_age_days as u64 * 24 * 60 * 60);
    let deleted = cleanup_old_files(&paths::get_cache_dir(app)?, max_age).await?;
    info!("Deleted {} old cache files", deleted);
    Ok(deleted)
}

/// Recursively delete files under `path` whose mtime is older than `max_age`,
/// returning how many were deleted. Directories are kept.
pub async fn cleanup_old_files(path: &Path, max_age: Duration) -> Result<u64> {
    let mut deleted = 0u64;

    if !path.exists() {
        return Ok(0);
    }

    let mut entries = fs::read_dir(path)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read directory: {}", e)))?;

    let now = SystemTime::now();

    while let Ok(Some(entry)) = entries.next_entry().await {
        let entry_path = entry.path();

        if let Ok(metadata) = entry.metadata().await {
            if metadata.is_file() {
                let age = metadata
                    .modified()
                    .ok()
                    .and_then(|m| now.duration_since(m).ok());
                if age.is_some_and(|age| age > max_age)
                    && fs::remove_file(&entry_path).await.is_ok()
                {
                    deleted += 1;
                    debug!("Deleted old cache file: {:?}", entry_path);
                }
            } else if metadata.is_dir() {
                deleted += Box::pin(cleanup_old_files(&entry_path, max_age)).await?;
            }
        }
    }

    Ok(deleted)
}

/// Enforce cache size limit
pub async fn enforce_cache_limit<R: Runtime>(app: &AppHandle<R>, max_size_mb: u64) -> Result<u64> {
    enforce_size_limit(&paths::get_cache_dir(app)?, max_size_mb * 1024 * 1024).await
}

/// When `path` holds more than `max_size_bytes`, delete oldest-first until it
/// is at or below 80% of the limit (headroom so the next write doesn't
/// immediately trigger another sweep). Returns bytes freed.
pub async fn enforce_size_limit(path: &Path, max_size_bytes: u64) -> Result<u64> {
    let (_, current_size) = calculate_dir_stats(path).await;
    if current_size <= max_size_bytes {
        return Ok(0);
    }

    info!(
        "Cache size {} bytes exceeds limit {} bytes, cleaning up",
        current_size, max_size_bytes
    );

    let mut files = collect_files_with_metadata(path).await?;
    files.sort_by_key(|a| a.1);

    let mut freed = 0u64;
    let target_size = max_size_bytes * 80 / 100;

    for (file, _, size) in files {
        if current_size - freed <= target_size {
            break;
        }
        if fs::remove_file(&file).await.is_ok() {
            freed += size;
            debug!("Deleted cache file to free space: {:?}", file);
        }
    }

    info!("Freed {} bytes of cache space", freed);
    Ok(freed)
}

async fn collect_files_with_metadata(path: &Path) -> Result<Vec<(PathBuf, SystemTime, u64)>> {
    let mut files = Vec::new();

    let mut entries = fs::read_dir(path)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read directory: {}", e)))?;

    while let Ok(Some(entry)) = entries.next_entry().await {
        let entry_path = entry.path();

        if let Ok(metadata) = entry.metadata().await {
            if metadata.is_file() {
                if let Ok(modified) = metadata.modified() {
                    files.push((entry_path, modified, metadata.len()));
                }
            } else if metadata.is_dir() {
                files.extend(Box::pin(collect_files_with_metadata(&entry_path)).await?);
            }
        }
    }

    Ok(files)
}

/// Get or create a thumbnail cache path
pub fn get_thumbnail_cache_path<R: Runtime>(app: &AppHandle<R>, video_id: &str) -> Result<PathBuf> {
    thumbnail_path_in(&paths::get_cache_dir(app)?, video_id)
}

/// `<cache_dir>/thumbnails/<video_id>.jpg`, creating the thumbnails directory.
///
/// SECURITY: `video_id` comes from remote metadata, so it is sanitized to a
/// plain file name and cannot traverse out of the thumbnails directory.
pub fn thumbnail_path_in(cache_dir: &Path, video_id: &str) -> Result<PathBuf> {
    let thumb_dir = cache_dir.join("thumbnails");
    if !thumb_dir.exists() {
        std::fs::create_dir_all(&thumb_dir)
            .map_err(|e| ClipyError::Other(format!("Failed to create thumbnail dir: {}", e)))?;
    }
    let name = paths::sanitize_filename(video_id).replace("..", "_");
    Ok(thumb_dir.join(format!("{}.jpg", name)))
}

/// Check if a thumbnail is cached
pub fn is_thumbnail_cached<R: Runtime>(app: &AppHandle<R>, video_id: &str) -> bool {
    get_thumbnail_cache_path(app, video_id).is_ok_and(|p| p.exists())
}

/// Get temp file path
pub fn get_temp_file_path<R: Runtime>(app: &AppHandle<R>, filename: &str) -> Result<PathBuf> {
    Ok(paths::get_temp_dir(app)?.join(filename))
}

/// Create a unique temp file path
pub fn get_unique_temp_path<R: Runtime>(app: &AppHandle<R>, extension: &str) -> Result<PathBuf> {
    Ok(unique_temp_path_in(&paths::get_temp_dir(app)?, extension))
}

/// `<temp_dir>/<millis>_<uuid>.<extension>`; unique across calls.
pub fn unique_temp_path_in(temp_dir: &Path, extension: &str) -> PathBuf {
    temp_dir.join(format!(
        "{}_{}.{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4(),
        extension
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use filetime::{set_file_mtime, FileTime};

    fn write(path: &Path, len: usize) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![0u8; len]).unwrap();
    }

    fn age(path: &Path, days: u64) {
        let t = SystemTime::now() - Duration::from_secs(days * 86_400);
        set_file_mtime(path, FileTime::from_system_time(t)).unwrap();
    }

    #[tokio::test]
    async fn stats_count_files_recursively_in_both_dirs() {
        let tmp = tempfile::tempdir().unwrap();
        let cache = tmp.path().join("cache");
        let temp = tmp.path().join("temp");
        write(&cache.join("a.jpg"), 10);
        write(&cache.join("thumbnails").join("b.jpg"), 20);
        write(&temp.join("c.tmp"), 5);

        let stats = cache_stats_in(&cache, &temp).await;
        assert_eq!(
            stats,
            CacheStats {
                total_size: 35,
                thumbnail_count: 2,
                thumbnail_size: 30,
                temp_file_count: 1,
                temp_file_size: 5,
            }
        );
        let json = serde_json::to_value(&stats).unwrap();
        assert_eq!(json["totalSize"], 35);

        let empty = cache_stats_in(&tmp.path().join("x"), &tmp.path().join("y")).await;
        assert_eq!(empty.total_size, 0);
    }

    #[tokio::test]
    async fn clear_directory_empties_but_keeps_root() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("cache");
        write(&root.join("a"), 1);
        write(&root.join("sub").join("b"), 1);

        clear_directory(&root).await.unwrap();
        assert!(root.is_dir());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);

        clear_directory(&tmp.path().join("missing")).await.unwrap();
    }

    #[tokio::test]
    async fn clear_directory_errors_when_path_is_a_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("f");
        write(&file, 1);
        assert!(clear_directory(&file).await.is_err());
    }

    #[tokio::test]
    async fn cleanup_removes_only_files_older_than_max_age() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("cache");
        let old = root.join("old.jpg");
        let old_nested = root.join("sub").join("old.jpg");
        let fresh = root.join("fresh.jpg");
        write(&old, 1);
        write(&old_nested, 1);
        write(&fresh, 1);
        age(&old, 10);
        age(&old_nested, 10);
        age(&fresh, 1);

        let deleted = cleanup_old_files(&root, Duration::from_secs(7 * 86_400))
            .await
            .unwrap();
        assert_eq!(deleted, 2);
        assert!(!old.exists() && !old_nested.exists());
        assert!(fresh.exists());
        assert!(root.join("sub").is_dir());

        assert_eq!(
            cleanup_old_files(&tmp.path().join("missing"), Duration::ZERO)
                .await
                .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn cleanup_errors_when_path_is_a_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("f");
        write(&file, 1);
        assert!(cleanup_old_files(&file, Duration::ZERO).await.is_err());
    }

    #[tokio::test]
    async fn size_limit_evicts_oldest_until_eighty_percent() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("cache");
        let files: Vec<PathBuf> = (0..5)
            .map(|i| root.join("sub").join(format!("{i}.bin")))
            .collect();
        for (i, f) in files.iter().enumerate() {
            write(f, 100);
            age(f, 10 - i as u64);
        }

        assert_eq!(enforce_size_limit(&root, 1000).await.unwrap(), 0);

        // 500 bytes against a 400 limit: target is 320, so the two oldest go.
        let freed = enforce_size_limit(&root, 400).await.unwrap();
        assert_eq!(freed, 200);
        assert!(!files[0].exists() && !files[1].exists());
        assert!(files[2..].iter().all(|f| f.exists()));
    }

    #[test]
    fn thumbnail_path_is_created_and_cannot_escape() {
        let tmp = tempfile::tempdir().unwrap();
        let path = thumbnail_path_in(tmp.path(), "abc123").unwrap();
        assert_eq!(path, tmp.path().join("thumbnails").join("abc123.jpg"));
        assert!(tmp.path().join("thumbnails").is_dir());

        let evil = thumbnail_path_in(tmp.path(), "../../etc/passwd").unwrap();
        assert_eq!(evil.parent().unwrap(), tmp.path().join("thumbnails"));
    }

    #[test]
    fn thumbnail_dir_creation_failure_is_reported() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("file");
        write(&file, 1);
        assert!(thumbnail_path_in(&file, "x").is_err());
    }

    #[test]
    fn unique_temp_paths_differ() {
        let dir = Path::new("tmp");
        let a = unique_temp_path_in(dir, "mp4");
        let b = unique_temp_path_in(dir, "mp4");
        assert_ne!(a, b);
        assert_eq!(a.parent().unwrap(), dir);
        assert_eq!(a.extension().unwrap(), "mp4");
    }

    #[tokio::test]
    async fn app_handle_wrappers_resolve_app_dirs() {
        let app = crate::test_support::mock_app_in_tempdir();
        let handle = app.handle();
        let cache = paths::get_cache_dir(handle).unwrap();
        let temp = paths::get_temp_dir(handle).unwrap();
        write(&cache.join("t.jpg"), 4);
        write(&temp.join("x.tmp"), 6);

        assert_eq!(get_cache_stats(handle).await.unwrap().total_size, 10);
        assert_eq!(cleanup_old_cache(handle, 30).await.unwrap(), 0);
        assert_eq!(enforce_cache_limit(handle, 1).await.unwrap(), 0);

        let thumb = get_thumbnail_cache_path(handle, "vid").unwrap();
        assert!(!is_thumbnail_cached(handle, "vid"));
        write(&thumb, 1);
        assert!(is_thumbnail_cached(handle, "vid"));

        assert_eq!(
            get_temp_file_path(handle, "a.txt").unwrap(),
            temp.join("a.txt")
        );
        assert_eq!(
            get_unique_temp_path(handle, "wav")
                .unwrap()
                .parent()
                .unwrap(),
            temp
        );

        clear_temp(handle).await.unwrap();
        clear_cache(handle).await.unwrap();
        assert_eq!(get_cache_stats(handle).await.unwrap().total_size, 0);
    }
}
