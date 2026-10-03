//! Library-related commands

use crate::error::{ClipyError, Result};
use crate::models::library::LibraryVideo;
use crate::services::database;
use crate::utils::path_policy;
use std::path::Path;
use tracing::{debug, info};

/// Get all videos in the library
#[tauri::command]
pub fn get_library_videos() -> Result<Vec<LibraryVideo>> {
    debug!("Getting all library videos");
    let result = database::get_library_videos();
    if let Ok(ref videos) = result {
        debug!("Found {} videos in library", videos.len());
    }
    result
}

/// Add a video to the library
#[tauri::command]
pub fn add_library_video(video: LibraryVideo) -> Result<()> {
    info!("Adding video to library: {}", video.title);
    debug!(
        "Video details: id={}, channel={}, path={}, size={} bytes",
        video.id, video.channel, video.file_path, video.file_size
    );
    // SECURITY: the stored path is later played, revealed and possibly deleted,
    // so only accept an existing local audio/video file.
    let canon = path_policy::ensure_media_file(&video.file_path)?;
    crate::media_protocol::grant(&canon);
    database::add_library_video(&video)
}

/// Delete the on-disk file behind a library entry.
///
/// A file that is already gone is not an error (the entry is still removed),
/// but anything that is not a regular audio/video file is refused.
fn delete_video_file(file_path: &str) -> Result<()> {
    let raw = path_policy::validate_raw_path(file_path)?;
    if std::fs::symlink_metadata(&raw).is_err() {
        debug!("File does not exist, skipping deletion: {:?}", raw);
        return Ok(());
    }
    let path = path_policy::ensure_deletable_media_file(file_path)?;
    std::fs::remove_file(&path)
        .map_err(|e| ClipyError::Other(format!("Failed to delete file: {}", e)))?;
    info!("Deleted file: {}", path.display());
    Ok(())
}

/// Delete a video from the library
#[tauri::command]
pub fn delete_library_video(id: String, delete_file: bool) -> Result<()> {
    info!(
        "Deleting video from library: {} (delete_file: {})",
        id, delete_file
    );

    // Get video info first if we need to delete the file
    if delete_file {
        debug!("Looking up video to delete file: {}", id);
        let videos = database::get_library_videos()?;
        if let Some(video) = videos.iter().find(|v| v.id == id) {
            delete_video_file(&video.file_path)?;
        } else {
            debug!("Video not found in library: {}", id);
        }
    }

    debug!("Removing library entry for: {}", id);
    database::delete_library_video(&id)
}

/// Search videos in the library
#[tauri::command]
pub fn search_library(query: String) -> Result<Vec<LibraryVideo>> {
    debug!("Searching library with query: '{}'", query);
    if query.trim().is_empty() {
        debug!("Empty query, returning all videos");
        return database::get_library_videos();
    }
    let result = database::search_library_videos(&query);
    if let Ok(ref videos) = result {
        debug!("Search found {} videos matching '{}'", videos.len(), query);
    }
    result
}

/// Import existing video file to library
#[tauri::command]
pub async fn import_video(
    file_path: String,
    title: Option<String>,
    channel: Option<String>,
) -> Result<LibraryVideo> {
    info!("Importing video: {}", file_path);
    debug!("Import options: title={:?}, channel={:?}", title, channel);
    let video = prepare_import(&file_path, title, channel)?;
    database::add_library_video(&video)?;
    crate::media_protocol::grant(Path::new(&video.file_path));
    info!("Video imported successfully: {}", video.title);
    Ok(video)
}

/// Validate an import source and build its library entry.
fn prepare_import(
    file_path: &str,
    title: Option<String>,
    channel: Option<String>,
) -> Result<LibraryVideo> {
    let path = path_policy::ensure_media_file(file_path)?;
    let path = path.as_path();

    let metadata = std::fs::metadata(path)
        .map_err(|e| ClipyError::Other(format!("Failed to read file metadata: {}", e)))?;

    debug!("File size: {} bytes", metadata.len());

    // Extract filename for title if not provided
    let file_name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    debug!("Extracted filename: {}", file_name);

    let extension = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("mp4")
        .to_string();

    // Create library entry
    let video = LibraryVideo::new(
        uuid::Uuid::new_v4().to_string(), // Use UUID as video_id for imports
        title.unwrap_or(file_name),
        String::new(), // No thumbnail for imports
        0,             // Duration will be 0 until we implement FFprobe
        channel.unwrap_or_else(|| "Local Import".to_string()),
        path.to_string_lossy().into_owned(),
        metadata.len(),
        extension,
        "unknown".to_string(), // Resolution unknown without FFprobe
        String::new(),         // No source URL for imports
    );

    debug!(
        "Created library entry: id={}, title={}",
        video.id, video.title
    );
    Ok(video)
}

/// Check if a video file exists
#[tauri::command]
pub fn check_video_exists(file_path: String) -> bool {
    let exists = path_policy::ensure_media_file(&file_path).is_ok();
    debug!("Video file exists check: {} = {}", file_path, exists);
    exists
}

/// Get video file size
#[tauri::command]
pub fn get_video_file_size(file_path: String) -> Result<u64> {
    debug!("Getting file size for: {}", file_path);
    let path = path_policy::ensure_media_file(&file_path)?;
    let metadata = std::fs::metadata(path)
        .map_err(|e| ClipyError::Other(format!("Failed to read file metadata: {}", e)))?;
    let size = metadata.len();
    debug!("File size: {} bytes ({} MB)", size, size / (1024 * 1024));
    Ok(size)
}

/// Rename a video in the library
#[tauri::command]
pub fn rename_library_video(id: String, new_title: String) -> Result<()> {
    info!("Renaming library video {} to {}", id, new_title);
    debug!("Looking up video: {}", id);

    let videos = database::get_library_videos()?;
    let video = videos
        .iter()
        .find(|v| v.id == id)
        .ok_or_else(|| ClipyError::Library("Video not found".into()))?;

    // Create updated video
    let updated_video = LibraryVideo {
        id: video.id.clone(),
        video_id: video.video_id.clone(),
        title: new_title,
        thumbnail: video.thumbnail.clone(),
        duration: video.duration,
        channel: video.channel.clone(),
        file_path: video.file_path.clone(),
        file_size: video.file_size,
        format: video.format.clone(),
        resolution: video.resolution.clone(),
        downloaded_at: video.downloaded_at.clone(),
        source_url: video.source_url.clone(),
    };

    debug!("Updating video with new title");
    database::add_library_video(&updated_video)
}

/// Get library statistics
#[tauri::command]
pub fn get_library_stats() -> Result<LibraryStats> {
    debug!("Getting library statistics");
    let videos = database::get_library_videos()?;

    let total_videos = videos.len() as u64;
    let total_size: u64 = videos.iter().map(|v| v.file_size).sum();
    let total_duration: u64 = videos.iter().map(|v| v.duration).sum();

    let unique_channels: std::collections::HashSet<_> = videos
        .iter()
        .filter(|v| !v.channel.is_empty())
        .map(|v| &v.channel)
        .collect();

    let stats = LibraryStats {
        total_videos,
        total_size,
        total_duration,
        unique_channels: unique_channels.len() as u64,
    };

    debug!(
        "Library stats: {} videos, {} bytes ({} MB), {} seconds, {} channels",
        stats.total_videos,
        stats.total_size,
        stats.total_size / (1024 * 1024),
        stats.total_duration,
        stats.unique_channels
    );

    Ok(stats)
}

/// Library statistics
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryStats {
    pub total_videos: u64,
    pub total_size: u64,
    pub total_duration: u64,
    pub unique_channels: u64,
}

/// Bulk delete videos from library
#[tauri::command]
pub fn bulk_delete_library_videos(ids: Vec<String>, delete_files: bool) -> Result<u32> {
    info!("Bulk deleting {} videos from library", ids.len());
    debug!("Delete files: {}, video IDs: {:?}", delete_files, ids);

    let mut deleted = 0u32;

    for id in ids {
        debug!("Deleting video: {}", id);
        match delete_library_video(id.clone(), delete_files) {
            Ok(_) => {
                deleted += 1;
                debug!("Successfully deleted: {}", id);
            }
            Err(e) => {
                tracing::warn!("Failed to delete video {}: {}", id, e);
            }
        }
    }

    info!("Bulk delete complete: {} videos deleted", deleted);
    Ok(deleted)
}

/// Export library to JSON
#[tauri::command]
pub fn export_library_json() -> Result<String> {
    debug!("Exporting library to JSON");
    let videos = database::get_library_videos()?;
    debug!("Exporting {} videos", videos.len());
    let json = serde_json::to_string_pretty(&videos)
        .map_err(|e| ClipyError::Library(format!("Failed to serialize library: {}", e)))?;
    debug!("Exported JSON: {} bytes", json.len());
    Ok(json)
}

/// Export library to a JSON file at the given path
#[tauri::command]
pub fn export_library_to_file(path: String) -> Result<()> {
    info!("Exporting library to file: {}", path);
    let target = path_policy::ensure_output_path(&path, path_policy::JSON_EXTENSIONS)?;
    let json = export_library_json()?;
    write_library_export(&target, &json)?;
    info!("Library exported to {}", target.display());
    Ok(())
}

fn write_library_export(target: &Path, json: &str) -> Result<()> {
    std::fs::write(target, json)
        .map_err(|e| ClipyError::Library(format!("Failed to write library file: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    fn entry(file_path: &str) -> LibraryVideo {
        LibraryVideo::new(
            "vid".into(),
            "t".into(),
            String::new(),
            0,
            "c".into(),
            file_path.into(),
            0,
            "mp4".into(),
            "1080p".into(),
            String::new(),
        )
    }

    #[test]
    fn prepare_import_builds_entry_from_media_file() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("My Clip.MKV");
        fs::write(&f, b"12345").unwrap();
        let v = prepare_import(&s(&f), None, None).unwrap();
        assert_eq!(v.title, "My Clip");
        assert_eq!(v.channel, "Local Import");
        assert_eq!(v.file_size, 5);
        assert_eq!(v.format, "MKV");
        assert_eq!(
            Path::new(&v.file_path),
            path_policy::canonicalize(&f).unwrap()
        );
        let v = prepare_import(&s(&f), Some("T".into()), Some("C".into())).unwrap();
        assert_eq!((v.title.as_str(), v.channel.as_str()), ("T", "C"));
    }

    #[test]
    fn prepare_import_rejects_non_media_and_missing() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("x.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(prepare_import(&s(&exe), None, None).is_err());
        assert!(prepare_import(&s(&dir.path().join("none.mp4")), None, None).is_err());
        assert!(prepare_import("https://x/y.mp4", None, None).is_err());
    }

    #[test]
    fn delete_video_file_rules() {
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path().join("v.mp4");
        fs::write(&v, b"x").unwrap();
        delete_video_file(&s(&v)).unwrap();
        assert!(!v.exists());
        // Already gone: not an error.
        delete_video_file(&s(&v)).unwrap();

        let doc = dir.path().join("important.docx");
        fs::write(&doc, b"x").unwrap();
        assert!(delete_video_file(&s(&doc)).is_err());
        assert!(doc.exists());

        let sub = dir.path().join("folder.mp4");
        fs::create_dir(&sub).unwrap();
        assert!(delete_video_file(&s(&sub)).is_err());
        assert!(sub.exists());

        assert!(delete_video_file("relative.mp4").is_err());
    }

    #[test]
    fn exists_and_size_only_for_media() {
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path().join("v.webm");
        fs::write(&v, b"abc").unwrap();
        let secret = dir.path().join("secret.key");
        fs::write(&secret, b"abc").unwrap();
        assert!(check_video_exists(s(&v)));
        assert!(!check_video_exists(s(&secret)));
        assert!(!check_video_exists(s(&dir.path().join("no.mp4"))));
        assert_eq!(get_video_file_size(s(&v)).unwrap(), 3);
        assert!(get_video_file_size(s(&secret)).is_err());
    }

    #[test]
    fn add_and_export_reject_bad_paths_before_touching_db() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("x.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(matches!(
            add_library_video(entry(&s(&exe))),
            Err(ClipyError::InvalidPath(_))
        ));
        assert!(matches!(
            add_library_video(entry("relative.mp4")),
            Err(ClipyError::InvalidPath(_))
        ));
        for bad in ["evil.bat", "evil.exe", "lib.txt"] {
            assert!(matches!(
                export_library_to_file(s(&dir.path().join(bad))),
                Err(ClipyError::InvalidPath(_))
            ));
        }
    }

    #[tokio::test]
    async fn import_video_rejects_before_touching_db() {
        assert!(matches!(
            import_video("ftp://x/y.mp4".into(), None, None).await,
            Err(ClipyError::InvalidPath(_))
        ));
    }

    /// Serialize on the global lock and install a fresh in-memory library.
    fn fresh_library() -> tokio::sync::MutexGuard<'static, ()> {
        let guard = crate::test_support::lock_globals();
        database::install(std::sync::Arc::new(
            database::Database::open_in_memory().unwrap(),
        ));
        guard
    }

    fn media(dir: &Path, name: &str, bytes: &[u8]) -> String {
        let p = dir.join(name);
        fs::write(&p, bytes).unwrap();
        s(&p)
    }

    fn titles(videos: &[LibraryVideo]) -> Vec<String> {
        let mut t: Vec<String> = videos.iter().map(|v| v.title.clone()).collect();
        t.sort();
        t
    }

    #[test]
    fn library_commands_round_trip_through_the_database() {
        let _guard = fresh_library();
        let dir = tempfile::tempdir().unwrap();
        let mut a = entry(&media(dir.path(), "a.mp4", b"aaaa"));
        a.title = "Rust talk".into();
        a.duration = 60;
        a.file_size = 4;
        add_library_video(a.clone()).unwrap();
        let mut b = entry(&media(dir.path(), "b.webm", b"bb"));
        b.id = "b-id".into();
        b.video_id = "other".into();
        b.title = "Cooking".into();
        b.channel = String::new();
        b.duration = 30;
        b.file_size = 2;
        add_library_video(b.clone()).unwrap();

        assert_eq!(
            titles(&get_library_videos().unwrap()),
            ["Cooking", "Rust talk"]
        );
        assert_eq!(titles(&search_library("  ".into()).unwrap()).len(), 2);
        assert_eq!(
            titles(&search_library("rust".into()).unwrap()),
            ["Rust talk"]
        );

        rename_library_video(a.id.clone(), "Renamed".into()).unwrap();
        assert!(rename_library_video("missing".into(), "x".into()).is_err());
        let stats = get_library_stats().unwrap();
        assert_eq!(
            (stats.total_videos, stats.total_size, stats.total_duration),
            (2, 6, 90)
        );
        // Videos without a channel do not count as a channel.
        assert_eq!(stats.unique_channels, 1);

        let json = export_library_json().unwrap();
        let parsed: Vec<LibraryVideo> = serde_json::from_str(&json).unwrap();
        assert_eq!(titles(&parsed), ["Cooking", "Renamed"]);
        let out = dir.path().join("library.json");
        export_library_to_file(s(&out)).unwrap();
        assert_eq!(fs::read_to_string(&out).unwrap(), json);

        delete_library_video(a.id.clone(), true).unwrap();
        assert!(!dir.path().join("a.mp4").exists());
        delete_library_video("never-existed".into(), true).unwrap();
        assert_eq!(titles(&get_library_videos().unwrap()), ["Cooking"]);
        delete_library_video(b.id.clone(), false).unwrap();
        assert!(dir.path().join("b.webm").exists());
        assert!(get_library_videos().unwrap().is_empty());
    }

    #[test]
    fn bulk_delete_counts_only_successes() {
        let _guard = fresh_library();
        let dir = tempfile::tempdir().unwrap();
        let ok = entry(&media(dir.path(), "ok.mp4", b"1"));
        add_library_video(ok.clone()).unwrap();
        // A row whose file was swapped for a non-media file must not be
        // deleted from disk, so that entry fails and is kept.
        let mut odd = entry(&media(dir.path(), "odd.mp4", b"1"));
        odd.id = "odd".into();
        odd.video_id = "odd".into();
        add_library_video(odd.clone()).unwrap();
        fs::remove_file(dir.path().join("odd.mp4")).unwrap();
        fs::create_dir(dir.path().join("odd.mp4")).unwrap();

        let deleted =
            bulk_delete_library_videos(vec![ok.id.clone(), odd.id.clone(), "gone".into()], true)
                .unwrap();
        assert_eq!(deleted, 2);
        assert_eq!(titles(&get_library_videos().unwrap()).len(), 1);
        assert!(dir.path().join("odd.mp4").is_dir());
    }

    #[tokio::test]
    async fn import_video_adds_and_grants_the_file() {
        let _guard = crate::test_support::lock_globals_async().await;
        database::install(std::sync::Arc::new(
            database::Database::open_in_memory().unwrap(),
        ));
        let dir = tempfile::tempdir().unwrap();
        let path = media(dir.path(), "Holiday.mov", b"12345678");
        let video = import_video(path, None, Some("Me".into())).await.unwrap();
        assert_eq!((video.title.as_str(), video.file_size), ("Holiday", 8));
        assert!(crate::media_protocol::is_granted(Path::new(
            &video.file_path
        )));
        let stored = get_library_videos().unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].channel, "Me");
    }

    #[test]
    fn write_library_export_writes_json() {
        let dir = tempfile::tempdir().unwrap();
        let out = dir.path().join("lib.json");
        write_library_export(&out, "[]").unwrap();
        assert_eq!(fs::read_to_string(&out).unwrap(), "[]");
        assert!(write_library_export(&dir.path().join("no/such/dir.json"), "[]").is_err());
    }
}
