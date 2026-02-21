//! Cache management service for thumbnails and temporary files

use crate::error::{ClipyError, Result};
use crate::utils::paths;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};
use tauri::AppHandle;
use tokio::fs;
use tracing::{debug, info};

/// Cache statistics
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_size: u64,
    pub thumbnail_count: u64,
    pub thumbnail_size: u64,
    pub temp_file_count: u64,
    pub temp_file_size: u64,
}

/// Get cache statistics
pub async fn get_cache_stats(app: &AppHandle) -> Result<CacheStats> {
    debug!("Getting cache statistics");

    let cache_path = paths::get_cache_dir(app)?;
    let temp_path = paths::get_temp_dir(app)?;

    debug!("Cache path: {:?}", cache_path);
    debug!("Temp path: {:?}", temp_path);

    let (thumbnail_count, thumbnail_size) = calculate_dir_stats(&cache_path).await;
    let (temp_count, temp_size) = calculate_dir_stats(&temp_path).await;

    let stats = CacheStats {
        total_size: thumbnail_size + temp_size,
        thumbnail_count,
        thumbnail_size,
        temp_file_count: temp_count,
        temp_file_size: temp_size,
    };

    debug!(
        "Cache stats: {} thumbnails ({} bytes), {} temp files ({} bytes), total: {} bytes",
        stats.thumbnail_count,
        stats.thumbnail_size,
        stats.temp_file_count,
        stats.temp_file_size,
        stats.total_size
    );

    Ok(stats)
}

/// Calculate directory statistics
async fn calculate_dir_stats(path: &PathBuf) -> (u64, u64) {
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
pub async fn clear_cache(app: &AppHandle) -> Result<()> {
    info!("Clearing all cache");

    let cache_path = paths::get_cache_dir(app)?;
    debug!("Clearing cache directory: {:?}", cache_path);

    clear_directory(&cache_path).await?;

    info!("Cache cleared successfully");
    Ok(())
}

/// Clear temporary files
pub async fn clear_temp(app: &AppHandle) -> Result<()> {
    info!("Clearing temporary files");

    let temp_path = paths::get_temp_dir(app)?;
    debug!("Clearing temp directory: {:?}", temp_path);

    clear_directory(&temp_path).await?;

    info!("Temporary files cleared successfully");
    Ok(())
}

/// Clear a directory contents (but keep the directory)
async fn clear_directory(path: &PathBuf) -> Result<()> {
    if !path.exists() {
        debug!("Directory does not exist, nothing to clear: {:?}", path);
        return Ok(());
    }

    debug!("Reading directory contents: {:?}", path);
    let mut entries = fs::read_dir(path)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read directory: {}", e)))?;

    let mut removed_count = 0u32;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let entry_path = entry.path();

        if entry_path.is_dir() {
            debug!("Removing directory: {:?}", entry_path);
            fs::remove_dir_all(&entry_path)
                .await
                .map_err(|e| ClipyError::Other(format!("Failed to remove directory: {}", e)))?;
            removed_count += 1;
        } else {
            debug!("Removing file: {:?}", entry_path);
            fs::remove_file(&entry_path)
                .await
                .map_err(|e| ClipyError::Other(format!("Failed to remove file: {}", e)))?;
            removed_count += 1;
        }
    }

    debug!("Removed {} items from {:?}", removed_count, path);
    Ok(())
}

/// Clean up old cache files (older than max_age_days)
pub async fn cleanup_old_cache(app: &AppHandle, max_age_days: u32) -> Result<u64> {
    info!("Cleaning up cache files older than {} days", max_age_days);

    let cache_path = paths::get_cache_dir(app)?;
    let max_age = Duration::from_secs(max_age_days as u64 * 24 * 60 * 60);

    let deleted = cleanup_old_files(&cache_path, max_age).await?;

    info!("Deleted {} old cache files", deleted);
    Ok(deleted)
}

/// Clean up old files in a directory
async fn cleanup_old_files(path: &PathBuf, max_age: Duration) -> Result<u64> {
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
                if let Ok(modified) = metadata.modified() {
                    if let Ok(age) = now.duration_since(modified) {
                        if age > max_age {
                            if fs::remove_file(&entry_path).await.is_ok() {
                                deleted += 1;
                                debug!("Deleted old cache file: {:?}", entry_path);
                            }
                        }
                    }
                }
            } else if metadata.is_dir() {
                deleted += Box::pin(cleanup_old_files(&entry_path, max_age)).await?;
            }
        }
    }

    Ok(deleted)
}

/// Enforce cache size limit
pub async fn enforce_cache_limit(app: &AppHandle, max_size_mb: u64) -> Result<u64> {
    debug!("Enforcing cache limit: {} MB", max_size_mb);

    let max_size_bytes = max_size_mb * 1024 * 1024;
    let cache_path = paths::get_cache_dir(app)?;

    let (file_count, current_size) = calculate_dir_stats(&cache_path).await;
    debug!("Current cache: {} files, {} bytes ({} MB)", file_count, current_size, current_size / (1024 * 1024));

    if current_size <= max_size_bytes {
        debug!("Cache size within limit, no cleanup needed");
        return Ok(0);
    }

    info!(
        "Cache size {} MB exceeds limit {} MB, cleaning up",
        current_size / (1024 * 1024),
        max_size_mb
    );

    // Get all files with their metadata
    let mut files = collect_files_with_metadata(&cache_path).await?;

    // Sort by modification time (oldest first)
    files.sort_by(|a, b| a.1.cmp(&b.1));

    let mut freed = 0u64;
    let target_size = max_size_bytes * 80 / 100; // Target 80% of limit

    for (path, _, size) in files {
        if current_size - freed <= target_size {
            break;
        }

        if fs::remove_file(&path).await.is_ok() {
            freed += size;
            debug!("Deleted cache file to free space: {:?}", path);
        }
    }

    info!("Freed {} MB of cache space", freed / (1024 * 1024));
    Ok(freed)
}

/// Collect all files with their metadata
async fn collect_files_with_metadata(path: &PathBuf) -> Result<Vec<(PathBuf, SystemTime, u64)>> {
    let mut files = Vec::new();

    if !path.exists() {
        return Ok(files);
    }

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
                let sub_files = Box::pin(collect_files_with_metadata(&entry_path)).await?;
                files.extend(sub_files);
            }
        }
    }

    Ok(files)
}

/// Get or create a thumbnail cache path
pub fn get_thumbnail_cache_path(app: &AppHandle, video_id: &str) -> Result<PathBuf> {
    let cache_path = paths::get_cache_dir(app)?;
    let thumb_dir = cache_path.join("thumbnails");

    if !thumb_dir.exists() {
        debug!("Creating thumbnail directory: {:?}", thumb_dir);
        std::fs::create_dir_all(&thumb_dir)
            .map_err(|e| ClipyError::Other(format!("Failed to create thumbnail dir: {}", e)))?;
    }

    let thumb_path = thumb_dir.join(format!("{}.jpg", video_id));
    debug!("Thumbnail cache path for {}: {:?}", video_id, thumb_path);
    Ok(thumb_path)
}

/// Check if a thumbnail is cached
pub fn is_thumbnail_cached(app: &AppHandle, video_id: &str) -> bool {
    if let Ok(path) = get_thumbnail_cache_path(app, video_id) {
        let cached = path.exists();
        debug!("Thumbnail cache check for {}: {} (path: {:?})", video_id, if cached { "HIT" } else { "MISS" }, path);
        cached
    } else {
        debug!("Thumbnail cache check for {}: MISS (path error)", video_id);
        false
    }
}

/// Get temp file path
pub fn get_temp_file_path(app: &AppHandle, filename: &str) -> Result<PathBuf> {
    let temp_path = paths::get_temp_dir(app)?;
    let file_path = temp_path.join(filename);
    debug!("Temp file path for {}: {:?}", filename, file_path);
    Ok(file_path)
}

/// Create a unique temp file path
pub fn get_unique_temp_path(app: &AppHandle, extension: &str) -> Result<PathBuf> {
    let temp_path = paths::get_temp_dir(app)?;
    let filename = format!("{}_{}.{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4(),
        extension
    );
    let file_path = temp_path.join(&filename);
    debug!("Generated unique temp path: {:?}", file_path);
    Ok(file_path)
}
