//! Application settings models

use serde::{Deserialize, Serialize};

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub download: DownloadSettings,
    pub editor: EditorSettings,
    pub appearance: AppearanceSettings,
    pub advanced: AdvancedSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings::default(),
            download: DownloadSettings::default(),
            editor: EditorSettings::default(),
            appearance: AppearanceSettings::default(),
            advanced: AdvancedSettings::default(),
        }
    }
}

/// General settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub language: String,
    pub launch_on_startup: bool,
    pub minimize_to_tray: bool,
    pub close_to_tray: bool,
    pub check_for_updates: bool,
    pub auto_update_binaries: bool,
}

impl Default for GeneralSettings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            launch_on_startup: false,
            minimize_to_tray: true,
            close_to_tray: true,
            check_for_updates: true,
            auto_update_binaries: true,
        }
    }
}

/// Download settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadSettings {
    pub download_path: String,
    pub default_quality: String,
    pub default_format: String,
    pub max_concurrent_downloads: u32,
    pub create_channel_subfolder: bool,
    pub include_date_in_filename: bool,
    pub embed_thumbnail: bool,
    pub embed_metadata: bool,
    pub auto_retry: bool,
    pub retry_attempts: u32,

    // Filename template
    #[serde(default = "default_filename_template")]
    pub filename_template: String,

    // Audio settings
    #[serde(default = "default_audio_format")]
    pub audio_format: String,
    #[serde(default = "default_audio_bitrate")]
    pub audio_bitrate: String,
    #[serde(default = "default_codec")]
    pub audio_codec: String,

    // Video settings
    #[serde(default = "default_codec")]
    pub video_codec: String,
    #[serde(default = "default_crf")]
    pub crf_quality: u32,
    #[serde(default = "default_encoding_preset")]
    pub encoding_preset: String,

    // Subtitle settings
    #[serde(default)]
    pub download_subtitles: bool,
    #[serde(default)]
    pub auto_subtitles: bool,
    #[serde(default)]
    pub embed_subtitles: bool,
    #[serde(default = "default_subtitle_format")]
    pub subtitle_format: String,
    #[serde(default = "default_subtitle_language")]
    pub subtitle_language: String,

    // SponsorBlock settings
    #[serde(default)]
    pub sponsor_block: bool,
    #[serde(default = "default_sponsor_categories")]
    pub sponsor_block_categories: Vec<String>,

    // Chapter settings
    #[serde(default)]
    pub download_chapters: bool,
    #[serde(default)]
    pub split_by_chapters: bool,

    // Playlist settings
    #[serde(default)]
    pub playlist_start: u32,
    #[serde(default)]
    pub playlist_end: u32,
    #[serde(default)]
    pub playlist_items: String,

    // Network/Performance settings
    #[serde(default)]
    pub rate_limit: String,
    #[serde(default = "default_concurrent_fragments")]
    pub concurrent_fragments: u32,
    #[serde(default)]
    pub cookies_from_browser: String,

    // File handling settings
    #[serde(default)]
    pub restrict_filenames: bool,
    #[serde(default)]
    pub use_download_archive: bool,

    // Write metadata files
    #[serde(default)]
    pub write_info_json: bool,
    #[serde(default)]
    pub write_description: bool,
    #[serde(default)]
    pub write_thumbnail: bool,

    // Geo-bypass settings
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

fn default_subtitle_language() -> String {
    "en".to_string()
}

fn default_sponsor_categories() -> Vec<String> {
    vec!["sponsor".to_string()]
}

fn default_concurrent_fragments() -> u32 {
    1
}

fn default_filename_template() -> String {
    "%(title)s.%(ext)s".to_string()
}

fn default_crf() -> u32 {
    23
}

fn default_encoding_preset() -> String {
    "medium".to_string()
}

impl Default for DownloadSettings {
    fn default() -> Self {
        Self {
            download_path: String::new(),
            default_quality: "1080".to_string(),
            default_format: "mp4".to_string(),
            max_concurrent_downloads: 3,
            create_channel_subfolder: false,
            include_date_in_filename: false,
            embed_thumbnail: true,
            embed_metadata: true,
            auto_retry: true,
            retry_attempts: 3,
            // Filename template
            filename_template: default_filename_template(),
            // Audio defaults
            audio_format: default_audio_format(),
            audio_bitrate: default_audio_bitrate(),
            audio_codec: default_codec(),
            // Video defaults
            video_codec: default_codec(),
            crf_quality: default_crf(),
            encoding_preset: default_encoding_preset(),
            // Subtitle defaults
            download_subtitles: false,
            auto_subtitles: false,
            embed_subtitles: false,
            subtitle_format: default_subtitle_format(),
            subtitle_language: default_subtitle_language(),
            // SponsorBlock defaults
            sponsor_block: false,
            sponsor_block_categories: default_sponsor_categories(),
            // Chapter defaults
            download_chapters: false,
            split_by_chapters: false,
            // Playlist defaults
            playlist_start: 0,
            playlist_end: 0,
            playlist_items: String::new(),
            // Network/Performance defaults
            rate_limit: String::new(),
            concurrent_fragments: default_concurrent_fragments(),
            cookies_from_browser: String::new(),
            // File handling defaults
            restrict_filenames: false,
            use_download_archive: false,
            // Write metadata files
            write_info_json: false,
            write_description: false,
            write_thumbnail: false,
            // Geo-bypass defaults
            geo_bypass: false,
        }
    }
}

/// Editor settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSettings {
    pub default_project_width: u32,
    pub default_project_height: u32,
    pub default_project_fps: u32,
    pub auto_save: bool,
    pub auto_save_interval: u32,
    pub show_waveforms: bool,
    pub snap_to_clips: bool,
    pub snap_to_playhead: bool,
    pub default_transition_duration: f64,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            default_project_width: 1920,
            default_project_height: 1080,
            default_project_fps: 30,
            auto_save: true,
            auto_save_interval: 60,
            show_waveforms: true,
            snap_to_clips: true,
            snap_to_playhead: true,
            default_transition_duration: 0.5,
        }
    }
}

/// Appearance settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme: String,
    pub accent_color: String,
    pub font_size: String,
    pub reduced_motion: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            accent_color: "#3b82f6".to_string(),
            font_size: "medium".to_string(),
            reduced_motion: false,
        }
    }
}

/// Advanced settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvancedSettings {
    pub ffmpeg_path: String,
    pub ytdlp_path: String,
    pub temp_path: String,
    pub cache_path: String,
    pub max_cache_size: u64,
    pub hardware_acceleration: bool,
    #[serde(default = "default_hw_accel_type")]
    pub hardware_acceleration_type: String,
    pub debug_mode: bool,
    pub proxy_url: String,
}

fn default_hw_accel_type() -> String {
    "auto".to_string()
}

impl Default for AdvancedSettings {
    fn default() -> Self {
        Self {
            ffmpeg_path: String::new(),
            ytdlp_path: String::new(),
            temp_path: String::new(),
            cache_path: String::new(),
            max_cache_size: 500,
            hardware_acceleration: true,
            hardware_acceleration_type: default_hw_accel_type(),
            debug_mode: false,
            proxy_url: String::new(),
        }
    }
}

/// Binary status information
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BinaryStatus {
    pub ffmpeg_installed: bool,
    pub ffmpeg_version: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ytdlp_installed: bool,
    pub ytdlp_version: Option<String>,
    pub ytdlp_path: Option<String>,
}

impl Default for BinaryStatus {
    fn default() -> Self {
        Self {
            ffmpeg_installed: false,
            ffmpeg_version: None,
            ffmpeg_path: None,
            ytdlp_installed: false,
            ytdlp_version: None,
            ytdlp_path: None,
        }
    }
}
