//! Download-related commands

use crate::error::{ClipyError, Result};
use crate::models::download::{DownloadOptions, DownloadStatus, DownloadTask};
use crate::models::video::VideoInfo;
use crate::services::{queue, ytdlp};
use tauri::AppHandle;
use tracing::{debug, info};

/// Fetch video information from URL
#[tauri::command]
pub async fn fetch_video_info(app: AppHandle, url: String) -> Result<VideoInfo> {
    info!("Fetching video info for: {}", url);
    ytdlp::fetch_video_info(&app, &url).await
}

/// Get available qualities for a video
#[tauri::command]
pub fn get_available_qualities(video_info: VideoInfo) -> Vec<String> {
    ytdlp::get_available_qualities(&video_info)
}

/// Start a download
#[tauri::command]
pub async fn start_download(
    _app: AppHandle,
    url: String,
    video_info: VideoInfo,
    options: DownloadOptions,
) -> Result<String> {
    info!("Starting download: {}", video_info.title);
    debug!("Download URL: {}", url);
    debug!("Download options: quality={}, format={}, output={}", options.quality, options.format, options.output_path);

    let download_id = uuid::Uuid::new_v4().to_string();
    debug!("Generated download ID: {}", download_id);
    let now = chrono::Utc::now().to_rfc3339();

    let task = DownloadTask {
        id: download_id.clone(),
        video_id: video_info.id.clone(),
        title: video_info.title.clone(),
        thumbnail: video_info.thumbnail.clone(),
        url: url.clone(),
        status: DownloadStatus::Pending,
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: 0,
        eta: 0,
        quality: options.quality.clone(),
        format: options.format.clone(),
        output_path: options.output_path.clone(),
        error: None,
        created_at: now,
        completed_at: None,
        duration: video_info.duration,
        channel: video_info.channel.clone(),
        options: options.clone(),
    };

    let download_queue = queue::get_queue()?;
    download_queue.add_download(task).await?;

    Ok(download_id)
}

/// Pause a download
#[tauri::command]
pub async fn pause_download(id: String) -> Result<()> {
    info!("Pausing download: {}", id);
    let download_queue = queue::get_queue()?;
    download_queue.pause_download(&id).await
}

/// Resume a download
#[tauri::command]
pub async fn resume_download(id: String) -> Result<()> {
    info!("Resuming download: {}", id);
    let download_queue = queue::get_queue()?;
    download_queue.resume_download(&id).await
}

/// Cancel a download
#[tauri::command]
pub async fn cancel_download(id: String) -> Result<()> {
    info!("Cancelling download: {}", id);
    let download_queue = queue::get_queue()?;
    download_queue.cancel_download(&id).await
}

/// Get all downloads
#[tauri::command]
pub async fn get_downloads() -> Result<Vec<DownloadTask>> {
    let download_queue = queue::get_queue()?;
    Ok(download_queue.get_all_downloads().await)
}

/// Get active downloads
#[tauri::command]
pub async fn get_active_downloads() -> Result<Vec<DownloadTask>> {
    let download_queue = queue::get_queue()?;
    Ok(download_queue.get_active_downloads().await)
}

/// Clear completed downloads
#[tauri::command]
pub async fn clear_completed_downloads() -> Result<()> {
    let download_queue = queue::get_queue()?;
    download_queue.clear_completed().await;
    Ok(())
}

/// Retry a failed download
#[tauri::command]
pub async fn retry_download(id: String) -> Result<()> {
    info!("Retrying download: {}", id);

    let download_queue = queue::get_queue()?;
    let downloads = download_queue.get_all_downloads().await;

    let task = downloads
        .iter()
        .find(|t| t.id == id)
        .ok_or_else(|| ClipyError::Download("Download not found".into()))?;

    if task.status != DownloadStatus::Failed {
        return Err(ClipyError::Download("Download is not in failed state".into()));
    }

    // Create new task with same info
    let new_task = DownloadTask {
        id: uuid::Uuid::new_v4().to_string(),
        video_id: task.video_id.clone(),
        title: task.title.clone(),
        thumbnail: task.thumbnail.clone(),
        url: task.url.clone(),
        status: DownloadStatus::Pending,
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: 0,
        eta: 0,
        quality: task.quality.clone(),
        format: task.format.clone(),
        output_path: task.output_path.clone(),
        error: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
        duration: task.duration,
        channel: task.channel.clone(),
        options: task.options.clone(),
    };

    // Remove old task
    download_queue.cancel_download(&id).await?;

    // Add new task
    download_queue.add_download(new_task).await?;

    Ok(())
}

/// Set maximum concurrent downloads
#[tauri::command]
pub async fn set_max_concurrent_downloads(max: u32) -> Result<()> {
    let download_queue = queue::get_queue()?;
    download_queue.set_max_concurrent(max).await;
    Ok(())
}

/// Validate a URL (check if it's a valid URL)
/// Note: yt-dlp supports 1000+ sites, so we just validate URL format
#[tauri::command]
pub fn validate_url(url: String) -> bool {
    // Basic URL validation - yt-dlp supports 1000+ sites
    // We just check if it's a valid URL with http/https
    if let Ok(parsed) = url::Url::parse(&url) {
        let scheme = parsed.scheme();
        return scheme == "http" || scheme == "https";
    }
    false
}

/// Extract video ID from URL
#[tauri::command]
pub fn extract_video_id(url: String) -> Option<String> {
    if let Ok(parsed) = url::Url::parse(&url) {
        let host = parsed.host_str()?;

        // YouTube
        if host.contains("youtube.com") || host.contains("youtu.be") {
            if host.contains("youtu.be") {
                return parsed.path().strip_prefix('/').map(|s| s.to_string());
            }

            for (key, value) in parsed.query_pairs() {
                if key == "v" {
                    return Some(value.to_string());
                }
            }
        }

        // Vimeo
        if host.contains("vimeo.com") {
            let path = parsed.path();
            if let Some(id) = path.strip_prefix('/') {
                if id.chars().all(|c| c.is_ascii_digit()) {
                    return Some(id.to_string());
                }
            }
        }
    }

    None
}
