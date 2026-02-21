//! Library-related commands

use crate::error::{ClipyError, Result};
use crate::models::library::LibraryVideo;
use crate::services::database;
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
    debug!("Video details: id={}, channel={}, path={}, size={} bytes",
        video.id, video.channel, video.file_path, video.file_size);
    database::add_library_video(&video)
}

/// Delete a video from the library
#[tauri::command]
pub fn delete_library_video(id: String, delete_file: bool) -> Result<()> {
    info!("Deleting video from library: {} (delete_file: {})", id, delete_file);

    // Get video info first if we need to delete the file
    if delete_file {
        debug!("Looking up video to delete file: {}", id);
        let videos = database::get_library_videos()?;
        if let Some(video) = videos.iter().find(|v| v.id == id) {
            let path = Path::new(&video.file_path);
            debug!("Video file path: {:?}", path);
            if path.exists() {
                debug!("File exists, deleting: {:?}", path);
                std::fs::remove_file(path)
                    .map_err(|e| ClipyError::Other(format!("Failed to delete file: {}", e)))?;
                info!("Deleted file: {}", video.file_path);
            } else {
                debug!("File does not exist, skipping deletion: {:?}", path);
            }
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

    let path = Path::new(&file_path);
    if !path.exists() {
        debug!("File does not exist: {}", file_path);
        return Err(ClipyError::Other("File does not exist".into()));
    }

    // Get file metadata
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
        0, // Duration will be 0 until we implement FFprobe
        channel.unwrap_or_else(|| "Local Import".to_string()),
        file_path,
        metadata.len(),
        extension,
        "unknown".to_string(), // Resolution unknown without FFprobe
        String::new(), // No source URL for imports
    );

    debug!("Created library entry: id={}, title={}", video.id, video.title);
    database::add_library_video(&video)?;

    info!("Video imported successfully: {}", video.title);
    Ok(video)
}

/// Check if a video file exists
#[tauri::command]
pub fn check_video_exists(file_path: String) -> bool {
    let exists = Path::new(&file_path).exists();
    debug!("Video file exists check: {} = {}", file_path, exists);
    exists
}

/// Get video file size
#[tauri::command]
pub fn get_video_file_size(file_path: String) -> Result<u64> {
    debug!("Getting file size for: {}", file_path);
    let metadata = std::fs::metadata(&file_path)
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
