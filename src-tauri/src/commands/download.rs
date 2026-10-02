//! Download-related commands
//!
//! Thin IPC wrappers over the global [`queue`](crate::services::queue) plus
//! pure URL helpers. URLs are only ever logged through
//! [`redact_url`] because query strings can carry tokens.

use crate::error::Result;
use crate::models::download::{DownloadOptions, DownloadStatus, DownloadTask};
use crate::models::video::VideoInfo;
use crate::services::{queue, ytdlp};
use crate::utils::logger::redact_url;
use tauri::AppHandle;
use tracing::{debug, info};

/// Fetch video information from URL
#[tauri::command]
pub async fn fetch_video_info(app: AppHandle, url: String) -> Result<VideoInfo> {
    info!("Fetching video info for: {}", redact_url(&url));
    ytdlp::fetch_video_info(&app, &url).await
}

/// Get available qualities for a video
#[tauri::command]
pub fn get_available_qualities(video_info: VideoInfo) -> Vec<String> {
    ytdlp::get_available_qualities(&video_info)
}

/// Build a fresh pending [`DownloadTask`] for `url` under `id`.
pub fn build_task(
    id: String,
    url: String,
    video_info: &VideoInfo,
    options: DownloadOptions,
) -> DownloadTask {
    DownloadTask {
        id,
        video_id: video_info.id.clone(),
        title: video_info.title.clone(),
        thumbnail: video_info.thumbnail.clone(),
        url,
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
        created_at: chrono::Utc::now().to_rfc3339(),
        completed_at: None,
        duration: video_info.duration,
        channel: video_info.channel.clone(),
        options,
    }
}

/// Queue a download and return its id.
#[tauri::command]
pub async fn start_download(
    url: String,
    video_info: VideoInfo,
    options: DownloadOptions,
) -> Result<String> {
    info!("Starting download: {}", video_info.title);
    debug!(
        "Download {} options: quality={}, format={}",
        redact_url(&url),
        options.quality,
        options.format
    );

    let download_id = uuid::Uuid::new_v4().to_string();
    let task = build_task(download_id.clone(), url, &video_info, options);
    queue::get_queue()?.add_download(task).await?;
    Ok(download_id)
}

/// Pause a download
#[tauri::command]
pub async fn pause_download(id: String) -> Result<()> {
    queue::get_queue()?.pause_download(&id).await
}

/// Resume a download
#[tauri::command]
pub async fn resume_download(id: String) -> Result<()> {
    queue::get_queue()?.resume_download(&id).await
}

/// Cancel a download
#[tauri::command]
pub async fn cancel_download(id: String) -> Result<()> {
    queue::get_queue()?.cancel_download(&id).await
}

/// Get all downloads
#[tauri::command]
pub async fn get_downloads() -> Result<Vec<DownloadTask>> {
    Ok(queue::get_queue()?.get_all_downloads().await)
}

/// Get active downloads
#[tauri::command]
pub async fn get_active_downloads() -> Result<Vec<DownloadTask>> {
    Ok(queue::get_queue()?.get_active_downloads().await)
}

/// Clear completed downloads
#[tauri::command]
pub async fn clear_completed_downloads() -> Result<()> {
    queue::get_queue()?.clear_completed().await;
    Ok(())
}

/// Retry a failed or cancelled download under the same id.
#[tauri::command]
pub async fn retry_download(id: String) -> Result<()> {
    queue::get_queue()?.retry_download(&id).await
}

/// Set maximum concurrent downloads (clamped to the supported range).
#[tauri::command]
pub async fn set_max_concurrent_downloads(max: u32) -> Result<()> {
    let applied = queue::get_queue()?.set_max_concurrent(max).await;
    debug!(
        "Max concurrent downloads set to {} (requested {})",
        applied, max
    );
    Ok(())
}

/// Whether `url` is an absolute http(s) URL with a host.
///
/// yt-dlp supports 1000+ sites, so only the shape is checked here.
#[tauri::command]
pub fn validate_url(url: String) -> bool {
    url::Url::parse(&url).is_ok_and(|parsed| {
        matches!(parsed.scheme(), "http" | "https")
            && parsed.host_str().is_some_and(|h| !h.is_empty())
    })
}

/// Whether `host` is `domain` itself or one of its subdomains.
///
/// # Example
/// ```
/// use clipy_lib::commands::download::host_matches;
/// assert!(host_matches("m.youtube.com", "youtube.com"));
/// assert!(!host_matches("notyoutube.com", "youtube.com"));
/// ```
pub fn host_matches(host: &str, domain: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == domain
        || host
            .strip_suffix(domain)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

/// Extract the site-specific video id from a YouTube or Vimeo URL.
#[tauri::command]
pub fn extract_video_id(url: String) -> Option<String> {
    let parsed = url::Url::parse(&url).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return None;
    }
    let host = parsed.host_str()?;
    let first_segment = || {
        parsed
            .path_segments()?
            .next()
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };

    if host_matches(host, "youtu.be") {
        return first_segment();
    }
    if host_matches(host, "youtube.com") {
        return parsed
            .query_pairs()
            .find(|(key, _)| key == "v")
            .map(|(_, value)| value.into_owned())
            .filter(|v| !v.is_empty());
    }
    if host_matches(host, "vimeo.com") {
        return first_segment().filter(|id| id.chars().all(|c| c.is_ascii_digit()));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::queue::testing::{eventually, harness};

    #[test]
    fn validate_url_requires_http_scheme_and_host() {
        assert!(validate_url("https://youtube.com/watch?v=abc".into()));
        assert!(validate_url("http://example.com".into()));
        assert!(!validate_url("ftp://example.com".into()));
        assert!(!validate_url("file:///etc/passwd".into()));
        assert!(!validate_url("javascript:alert(1)".into()));
        assert!(!validate_url("not a url".into()));
        assert!(!validate_url("".into()));
    }

    #[test]
    fn host_matching_is_exact_or_subdomain() {
        assert!(host_matches("youtube.com", "youtube.com"));
        assert!(host_matches("www.youtube.com", "youtube.com"));
        assert!(host_matches("WWW.YouTube.com.", "youtube.com"));
        assert!(!host_matches("evilyoutube.com", "youtube.com"));
        assert!(!host_matches("youtube.com.evil.net", "youtube.com"));
        assert!(!host_matches("com", "youtube.com"));
    }

    #[test]
    fn extracts_ids_only_from_genuine_hosts() {
        let id = |u: &str| extract_video_id(u.into());
        assert_eq!(
            id("https://www.youtube.com/watch?v=abc"),
            Some("abc".into())
        );
        assert_eq!(
            id("https://m.youtube.com/watch?x=1&v=abc"),
            Some("abc".into())
        );
        assert_eq!(id("https://youtu.be/abc?t=5"), Some("abc".into()));
        assert_eq!(id("https://vimeo.com/123"), Some("123".into()));
        assert_eq!(id("https://player.vimeo.com/123"), Some("123".into()));

        assert_eq!(id("https://notyoutube.com/watch?v=abc"), None);
        assert_eq!(id("https://youtube.com.evil.net/watch?v=abc"), None);
        assert_eq!(id("https://evilyoutu.be/abc"), None);
        assert_eq!(id("https://fakevimeo.com/123"), None);
        assert_eq!(id("https://youtube.com/watch?v="), None);
        assert_eq!(id("https://youtube.com/watch"), None);
        assert_eq!(id("https://youtu.be/"), None);
        assert_eq!(id("https://vimeo.com/channels/abc"), None);
        assert_eq!(id("ftp://youtube.com/watch?v=abc"), None);
        assert_eq!(id("garbage"), None);
    }

    #[test]
    fn build_task_copies_metadata_and_options() {
        let info = VideoInfo {
            id: "vid".into(),
            title: "T".into(),
            thumbnail: "th".into(),
            duration: 9,
            channel: "C".into(),
            ..Default::default()
        };
        let options = DownloadOptions {
            quality: "720".into(),
            format: "webm".into(),
            output_path: "/dl".into(),
            ..Default::default()
        };
        let t = build_task("id1".into(), "https://u".into(), &info, options);
        assert_eq!(t.id, "id1");
        assert_eq!(t.video_id, "vid");
        assert_eq!((t.quality.as_str(), t.format.as_str()), ("720", "webm"));
        assert_eq!(t.output_path, "/dl");
        assert_eq!(t.status, DownloadStatus::Pending);
        assert_eq!((t.duration, t.channel.as_str()), (9, "C"));
        assert!(chrono::DateTime::parse_from_rfc3339(&t.created_at).is_ok());
    }

    #[tokio::test]
    async fn commands_drive_the_global_queue() {
        let _g = crate::test_support::lock_globals_async().await;
        let h = harness(1);
        crate::services::queue::install_queue(h.queue.clone());

        let info = VideoInfo {
            id: "v".into(),
            title: "Video".into(),
            ..Default::default()
        };
        let id = start_download(
            "https://youtu.be/v?si=secret".into(),
            info.clone(),
            DownloadOptions::default(),
        )
        .await
        .unwrap();
        h.wait_running(&id).await;
        let second = start_download(
            "https://youtu.be/w".into(),
            info,
            DownloadOptions::default(),
        )
        .await
        .unwrap();

        assert_eq!(get_downloads().await.unwrap().len(), 2);
        assert_eq!(get_active_downloads().await.unwrap().len(), 1);

        pause_download(id.clone()).await.unwrap();
        h.wait_running(&second).await;
        resume_download(id.clone()).await.unwrap();
        cancel_download(second.clone()).await.unwrap();
        h.wait_running(&id).await;
        h.dl.fail(&id, "nope");
        h.wait_status(&id, DownloadStatus::Failed).await;
        retry_download(id.clone()).await.unwrap();
        h.wait_running(&id).await;
        h.dl.succeed(&id);
        h.wait_status(&id, DownloadStatus::Completed).await;

        set_max_concurrent_downloads(0).await.unwrap();
        assert_eq!(h.queue.max_concurrent().await, 1);

        clear_completed_downloads().await.unwrap();
        eventually("cleared", || async {
            get_downloads().await.unwrap().is_empty()
        })
        .await;
        assert!(pause_download("missing".into()).await.is_err());
    }
}
