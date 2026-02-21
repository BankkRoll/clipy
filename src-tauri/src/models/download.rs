//! Download-related data models

use serde::{Deserialize, Serialize};

/// Download status enum
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DownloadStatus {
    Pending,
    Fetching,
    Downloading,
    Processing,
    Completed,
    Failed,
    Cancelled,
    Paused,
}

impl Default for DownloadStatus {
    fn default() -> Self {
        Self::Pending
    }
}

/// Download task information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadTask {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub thumbnail: String,
    pub url: String,
    pub status: DownloadStatus,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: u64,
    pub eta: u64,
    pub quality: String,
    pub format: String,
    pub output_path: String,
    pub error: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    /// Duration in seconds (for library)
    pub duration: u64,
    /// Channel name (for library)
    pub channel: String,
    /// Full download options for proper download execution
    #[serde(default)]
    pub options: DownloadOptions,
}

/// Download options/preferences
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadOptions {
    // Basic options
    pub quality: String,
    pub format: String,
    pub audio_only: bool,
    pub output_path: String,
    pub filename: String,

    // Metadata options
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,

    // Audio options
    #[serde(default = "default_audio_format")]
    pub audio_format: String,
    #[serde(default = "default_audio_bitrate")]
    pub audio_bitrate: String,

    // Video options
    #[serde(default = "default_codec")]
    pub video_codec: String,
    #[serde(default = "default_codec")]
    pub audio_codec: String,

    // Subtitle options
    #[serde(default)]
    pub download_subtitles: bool,
    #[serde(default)]
    pub subtitle_languages: Vec<String>,
    #[serde(default = "default_subtitle_format")]
    pub subtitle_format: String,
    #[serde(default)]
    pub embed_subtitles: bool,
    #[serde(default)]
    pub auto_subtitles: bool,

    // Advanced options
    #[serde(default)]
    pub sponsor_block: bool,
    #[serde(default)]
    pub sponsor_block_categories: Vec<String>,
    #[serde(default)]
    pub download_chapters: bool,
    #[serde(default)]
    pub split_by_chapters: bool,
    #[serde(default)]
    pub write_description: bool,
    #[serde(default)]
    pub write_comments: bool,
    #[serde(default)]
    pub write_thumbnail: bool,
    #[serde(default)]
    pub keep_original: bool,

    // Limits
    #[serde(default)]
    pub max_filesize: String,
    #[serde(default)]
    pub rate_limit: String,

    // Playlist options
    #[serde(default)]
    pub playlist_items: String,
    #[serde(default = "default_true")]
    pub no_playlist: bool,

    // Post-processing
    #[serde(default)]
    pub extract_audio: bool,
    #[serde(default)]
    pub remux_video: String,
    #[serde(default)]
    pub convert_thumbnails: String,

    // Cookies
    #[serde(default)]
    pub cookies_from_browser: String,

    // Network/Performance
    #[serde(default = "default_concurrent_fragments")]
    pub concurrent_fragments: u32,
    #[serde(default)]
    pub proxy_url: String,

    // File handling
    #[serde(default)]
    pub restrict_filenames: bool,
    #[serde(default)]
    pub use_download_archive: bool,

    // Geo-bypass
    #[serde(default)]
    pub geo_bypass: bool,
}

fn default_audio_format() -> String {
    "m4a".to_string()
}

fn default_audio_bitrate() -> String {
    "192".to_string()
}

fn default_codec() -> String {
    "auto".to_string()
}

fn default_subtitle_format() -> String {
    "srt".to_string()
}

fn default_true() -> bool {
    true
}

fn default_concurrent_fragments() -> u32 {
    1
}

impl Default for DownloadOptions {
    fn default() -> Self {
        Self {
            quality: "1080".to_string(),
            format: "mp4".to_string(),
            audio_only: false,
            output_path: String::new(),
            filename: String::new(),
            embed_thumbnail: true,
            embed_metadata: true,
            audio_format: "m4a".to_string(),
            audio_bitrate: "192".to_string(),
            video_codec: "auto".to_string(),
            audio_codec: "auto".to_string(),
            download_subtitles: false,
            subtitle_languages: vec!["en".to_string()],
            subtitle_format: "srt".to_string(),
            embed_subtitles: false,
            auto_subtitles: false,
            sponsor_block: false,
            sponsor_block_categories: vec!["sponsor".to_string()],
            download_chapters: false,
            split_by_chapters: false,
            write_description: false,
            write_comments: false,
            write_thumbnail: false,
            keep_original: false,
            max_filesize: String::new(),
            rate_limit: String::new(),
            playlist_items: String::new(),
            no_playlist: true,
            extract_audio: false,
            remux_video: String::new(),
            convert_thumbnails: String::new(),
            cookies_from_browser: String::new(),
            concurrent_fragments: 1,
            proxy_url: String::new(),
            restrict_filenames: false,
            use_download_archive: false,
            geo_bypass: false,
        }
    }
}

/// Download progress update
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub download_id: String,
    pub status: DownloadStatus,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed: u64,
    pub eta: u64,
    /// The actual file path when download is completed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}
