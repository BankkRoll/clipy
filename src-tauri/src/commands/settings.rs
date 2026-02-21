//! Settings-related commands

use crate::error::Result;
use crate::models::settings::AppSettings;
use crate::services::config;
use tauri::AppHandle;
use tracing::{debug, info};

/// Get application settings
#[tauri::command]
pub fn get_settings() -> Result<AppSettings> {
    debug!("Getting application settings");
    let result = config::get_settings();
    if result.is_ok() {
        debug!("Settings loaded successfully");
    }
    result
}

/// Update application settings
#[tauri::command]
pub fn update_settings(app: AppHandle, settings: AppSettings) -> Result<()> {
    info!("Updating application settings");
    debug!("Settings: debugMode={}, downloadPath={}", settings.advanced.debug_mode, settings.download.download_path);
    config::update_settings(&app, settings)
}

/// Reset settings to defaults
#[tauri::command]
pub fn reset_settings(app: AppHandle) -> Result<AppSettings> {
    info!("Resetting settings to defaults");
    let result = config::reset_settings(&app);
    if result.is_ok() {
        debug!("Settings reset successfully");
    }
    result
}

/// Update a specific setting
#[tauri::command]
pub fn update_setting(app: AppHandle, key: String, value: serde_json::Value) -> Result<()> {
    info!("Updating setting: {} = {:?}", key, value);
    debug!("Setting key parts: {:?}", key.split('.').collect::<Vec<_>>());

    let mut settings = config::get_settings()?;

    // Parse the key path and update the value
    let parts: Vec<&str> = key.split('.').collect();

    match parts.as_slice() {
        // General settings
        ["general", "language"] => {
            settings.general.language = value.as_str().unwrap_or("en").to_string();
        }
        ["general", "launchOnStartup"] => {
            settings.general.launch_on_startup = value.as_bool().unwrap_or(false);
        }
        ["general", "minimizeToTray"] => {
            settings.general.minimize_to_tray = value.as_bool().unwrap_or(true);
        }
        ["general", "closeToTray"] => {
            settings.general.close_to_tray = value.as_bool().unwrap_or(true);
        }
        ["general", "checkForUpdates"] => {
            settings.general.check_for_updates = value.as_bool().unwrap_or(true);
        }
        ["general", "autoUpdateBinaries"] => {
            settings.general.auto_update_binaries = value.as_bool().unwrap_or(true);
        }

        // Download settings
        ["download", "downloadPath"] => {
            settings.download.download_path = value.as_str().unwrap_or("").to_string();
        }
        ["download", "defaultQuality"] => {
            settings.download.default_quality = value.as_str().unwrap_or("1080").to_string();
        }
        ["download", "defaultFormat"] => {
            settings.download.default_format = value.as_str().unwrap_or("mp4").to_string();
        }
        ["download", "maxConcurrentDownloads"] => {
            settings.download.max_concurrent_downloads = value.as_u64().unwrap_or(3) as u32;
        }
        ["download", "createChannelSubfolder"] => {
            settings.download.create_channel_subfolder = value.as_bool().unwrap_or(false);
        }
        ["download", "includeDateInFilename"] => {
            settings.download.include_date_in_filename = value.as_bool().unwrap_or(false);
        }
        ["download", "embedThumbnail"] => {
            settings.download.embed_thumbnail = value.as_bool().unwrap_or(true);
        }
        ["download", "embedMetadata"] => {
            settings.download.embed_metadata = value.as_bool().unwrap_or(true);
        }
        ["download", "autoRetry"] => {
            settings.download.auto_retry = value.as_bool().unwrap_or(true);
        }
        ["download", "retryAttempts"] => {
            settings.download.retry_attempts = value.as_u64().unwrap_or(3) as u32;
        }

        // Audio settings
        ["download", "audioFormat"] => {
            settings.download.audio_format = value.as_str().unwrap_or("m4a").to_string();
        }
        ["download", "audioBitrate"] => {
            settings.download.audio_bitrate = value.as_str().unwrap_or("192").to_string();
        }
        ["download", "audioCodec"] => {
            settings.download.audio_codec = value.as_str().unwrap_or("auto").to_string();
        }

        // Video codec
        ["download", "videoCodec"] => {
            settings.download.video_codec = value.as_str().unwrap_or("auto").to_string();
        }

        // Subtitle settings
        ["download", "downloadSubtitles"] => {
            settings.download.download_subtitles = value.as_bool().unwrap_or(false);
        }
        ["download", "autoSubtitles"] => {
            settings.download.auto_subtitles = value.as_bool().unwrap_or(false);
        }
        ["download", "embedSubtitles"] => {
            settings.download.embed_subtitles = value.as_bool().unwrap_or(false);
        }
        ["download", "subtitleFormat"] => {
            settings.download.subtitle_format = value.as_str().unwrap_or("srt").to_string();
        }
        ["download", "subtitleLanguage"] => {
            settings.download.subtitle_language = value.as_str().unwrap_or("en").to_string();
        }

        // SponsorBlock settings
        ["download", "sponsorBlock"] => {
            settings.download.sponsor_block = value.as_bool().unwrap_or(false);
        }
        ["download", "sponsorBlockCategories"] => {
            if let Some(arr) = value.as_array() {
                settings.download.sponsor_block_categories = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
            }
        }

        // Chapter settings
        ["download", "downloadChapters"] => {
            settings.download.download_chapters = value.as_bool().unwrap_or(false);
        }
        ["download", "splitByChapters"] => {
            settings.download.split_by_chapters = value.as_bool().unwrap_or(false);
        }

        // Network/Performance settings
        ["download", "rateLimit"] => {
            settings.download.rate_limit = value.as_str().unwrap_or("").to_string();
        }
        ["download", "concurrentFragments"] => {
            settings.download.concurrent_fragments = value.as_u64().unwrap_or(1) as u32;
        }
        ["download", "cookiesFromBrowser"] => {
            settings.download.cookies_from_browser = value.as_str().unwrap_or("").to_string();
        }

        // File handling settings
        ["download", "restrictFilenames"] => {
            settings.download.restrict_filenames = value.as_bool().unwrap_or(false);
        }
        ["download", "useDownloadArchive"] => {
            settings.download.use_download_archive = value.as_bool().unwrap_or(false);
        }

        // Geo-bypass settings
        ["download", "geoBypass"] => {
            settings.download.geo_bypass = value.as_bool().unwrap_or(false);
        }

        // Filename template
        ["download", "filenameTemplate"] => {
            settings.download.filename_template = value.as_str().unwrap_or("%(title)s.%(ext)s").to_string();
        }

        // CRF Quality and encoding preset
        ["download", "crfQuality"] => {
            settings.download.crf_quality = value.as_u64().unwrap_or(23) as u32;
        }
        ["download", "encodingPreset"] => {
            settings.download.encoding_preset = value.as_str().unwrap_or("medium").to_string();
        }

        // Playlist settings
        ["download", "playlistStart"] => {
            settings.download.playlist_start = value.as_u64().unwrap_or(0) as u32;
        }
        ["download", "playlistEnd"] => {
            settings.download.playlist_end = value.as_u64().unwrap_or(0) as u32;
        }
        ["download", "playlistItems"] => {
            settings.download.playlist_items = value.as_str().unwrap_or("").to_string();
        }

        // Write metadata files
        ["download", "writeInfoJson"] => {
            settings.download.write_info_json = value.as_bool().unwrap_or(false);
        }
        ["download", "writeDescription"] => {
            settings.download.write_description = value.as_bool().unwrap_or(false);
        }
        ["download", "writeThumbnail"] => {
            settings.download.write_thumbnail = value.as_bool().unwrap_or(false);
        }

        // Editor settings
        ["editor", "defaultProjectWidth"] => {
            settings.editor.default_project_width = value.as_u64().unwrap_or(1920) as u32;
        }
        ["editor", "defaultProjectHeight"] => {
            settings.editor.default_project_height = value.as_u64().unwrap_or(1080) as u32;
        }
        ["editor", "defaultProjectFps"] => {
            settings.editor.default_project_fps = value.as_u64().unwrap_or(30) as u32;
        }
        ["editor", "autoSave"] => {
            settings.editor.auto_save = value.as_bool().unwrap_or(true);
        }
        ["editor", "autoSaveInterval"] => {
            settings.editor.auto_save_interval = value.as_u64().unwrap_or(60) as u32;
        }
        ["editor", "showWaveforms"] => {
            settings.editor.show_waveforms = value.as_bool().unwrap_or(true);
        }
        ["editor", "snapToClips"] => {
            settings.editor.snap_to_clips = value.as_bool().unwrap_or(true);
        }
        ["editor", "snapToPlayhead"] => {
            settings.editor.snap_to_playhead = value.as_bool().unwrap_or(true);
        }
        ["editor", "defaultTransitionDuration"] => {
            settings.editor.default_transition_duration = value.as_f64().unwrap_or(0.5);
        }

        // Appearance settings
        ["appearance", "theme"] => {
            settings.appearance.theme = value.as_str().unwrap_or("system").to_string();
        }
        ["appearance", "accentColor"] => {
            settings.appearance.accent_color = value.as_str().unwrap_or("#3b82f6").to_string();
        }
        ["appearance", "fontSize"] => {
            settings.appearance.font_size = value.as_str().unwrap_or("medium").to_string();
        }
        ["appearance", "reducedMotion"] => {
            settings.appearance.reduced_motion = value.as_bool().unwrap_or(false);
        }

        // Advanced settings
        ["advanced", "ffmpegPath"] => {
            settings.advanced.ffmpeg_path = value.as_str().unwrap_or("").to_string();
        }
        ["advanced", "ytdlpPath"] => {
            settings.advanced.ytdlp_path = value.as_str().unwrap_or("").to_string();
        }
        ["advanced", "tempPath"] => {
            settings.advanced.temp_path = value.as_str().unwrap_or("").to_string();
        }
        ["advanced", "cachePath"] => {
            settings.advanced.cache_path = value.as_str().unwrap_or("").to_string();
        }
        ["advanced", "maxCacheSize"] => {
            settings.advanced.max_cache_size = value.as_u64().unwrap_or(500);
        }
        ["advanced", "hardwareAcceleration"] => {
            settings.advanced.hardware_acceleration = value.as_bool().unwrap_or(true);
        }
        ["advanced", "hardwareAccelerationType"] => {
            settings.advanced.hardware_acceleration_type = value.as_str().unwrap_or("auto").to_string();
        }
        ["advanced", "debugMode"] => {
            settings.advanced.debug_mode = value.as_bool().unwrap_or(false);
        }
        ["advanced", "proxyUrl"] => {
            settings.advanced.proxy_url = value.as_str().unwrap_or("").to_string();
        }

        _ => {
            debug!("Unknown setting key: {}", key);
            return Err(crate::error::ClipyError::Config(format!("Unknown setting: {}", key)));
        }
    }

    debug!("Setting updated, saving config");
    config::update_settings(&app, settings)
}

/// Get a specific setting value
#[tauri::command]
pub fn get_setting(key: String) -> Result<serde_json::Value> {
    debug!("Getting setting: {}", key);
    let settings = config::get_settings()?;
    let parts: Vec<&str> = key.split('.').collect();

    let value = match parts.as_slice() {
        // General settings
        ["general", "language"] => serde_json::json!(settings.general.language),
        ["general", "launchOnStartup"] => serde_json::json!(settings.general.launch_on_startup),
        ["general", "minimizeToTray"] => serde_json::json!(settings.general.minimize_to_tray),
        ["general", "closeToTray"] => serde_json::json!(settings.general.close_to_tray),
        ["general", "checkForUpdates"] => serde_json::json!(settings.general.check_for_updates),
        ["general", "autoUpdateBinaries"] => serde_json::json!(settings.general.auto_update_binaries),

        // Download settings
        ["download", "downloadPath"] => serde_json::json!(settings.download.download_path),
        ["download", "defaultQuality"] => serde_json::json!(settings.download.default_quality),
        ["download", "defaultFormat"] => serde_json::json!(settings.download.default_format),
        ["download", "maxConcurrentDownloads"] => serde_json::json!(settings.download.max_concurrent_downloads),
        ["download", "createChannelSubfolder"] => serde_json::json!(settings.download.create_channel_subfolder),
        ["download", "includeDateInFilename"] => serde_json::json!(settings.download.include_date_in_filename),
        ["download", "embedThumbnail"] => serde_json::json!(settings.download.embed_thumbnail),
        ["download", "embedMetadata"] => serde_json::json!(settings.download.embed_metadata),
        ["download", "autoRetry"] => serde_json::json!(settings.download.auto_retry),
        ["download", "retryAttempts"] => serde_json::json!(settings.download.retry_attempts),

        // Audio settings
        ["download", "audioFormat"] => serde_json::json!(settings.download.audio_format),
        ["download", "audioBitrate"] => serde_json::json!(settings.download.audio_bitrate),
        ["download", "audioCodec"] => serde_json::json!(settings.download.audio_codec),

        // Video codec
        ["download", "videoCodec"] => serde_json::json!(settings.download.video_codec),

        // Subtitle settings
        ["download", "downloadSubtitles"] => serde_json::json!(settings.download.download_subtitles),
        ["download", "autoSubtitles"] => serde_json::json!(settings.download.auto_subtitles),
        ["download", "embedSubtitles"] => serde_json::json!(settings.download.embed_subtitles),
        ["download", "subtitleFormat"] => serde_json::json!(settings.download.subtitle_format),
        ["download", "subtitleLanguage"] => serde_json::json!(settings.download.subtitle_language),

        // SponsorBlock settings
        ["download", "sponsorBlock"] => serde_json::json!(settings.download.sponsor_block),
        ["download", "sponsorBlockCategories"] => serde_json::json!(settings.download.sponsor_block_categories),

        // Chapter settings
        ["download", "downloadChapters"] => serde_json::json!(settings.download.download_chapters),
        ["download", "splitByChapters"] => serde_json::json!(settings.download.split_by_chapters),

        // Network/Performance settings
        ["download", "rateLimit"] => serde_json::json!(settings.download.rate_limit),
        ["download", "concurrentFragments"] => serde_json::json!(settings.download.concurrent_fragments),
        ["download", "cookiesFromBrowser"] => serde_json::json!(settings.download.cookies_from_browser),

        // File handling settings
        ["download", "restrictFilenames"] => serde_json::json!(settings.download.restrict_filenames),
        ["download", "useDownloadArchive"] => serde_json::json!(settings.download.use_download_archive),

        // Geo-bypass settings
        ["download", "geoBypass"] => serde_json::json!(settings.download.geo_bypass),

        // Filename template
        ["download", "filenameTemplate"] => serde_json::json!(settings.download.filename_template),

        // CRF Quality and encoding preset
        ["download", "crfQuality"] => serde_json::json!(settings.download.crf_quality),
        ["download", "encodingPreset"] => serde_json::json!(settings.download.encoding_preset),

        // Playlist settings
        ["download", "playlistStart"] => serde_json::json!(settings.download.playlist_start),
        ["download", "playlistEnd"] => serde_json::json!(settings.download.playlist_end),
        ["download", "playlistItems"] => serde_json::json!(settings.download.playlist_items),

        // Write metadata files
        ["download", "writeInfoJson"] => serde_json::json!(settings.download.write_info_json),
        ["download", "writeDescription"] => serde_json::json!(settings.download.write_description),
        ["download", "writeThumbnail"] => serde_json::json!(settings.download.write_thumbnail),

        // Editor settings
        ["editor", "defaultProjectWidth"] => serde_json::json!(settings.editor.default_project_width),
        ["editor", "defaultProjectHeight"] => serde_json::json!(settings.editor.default_project_height),
        ["editor", "defaultProjectFps"] => serde_json::json!(settings.editor.default_project_fps),
        ["editor", "autoSave"] => serde_json::json!(settings.editor.auto_save),
        ["editor", "autoSaveInterval"] => serde_json::json!(settings.editor.auto_save_interval),
        ["editor", "showWaveforms"] => serde_json::json!(settings.editor.show_waveforms),
        ["editor", "snapToClips"] => serde_json::json!(settings.editor.snap_to_clips),
        ["editor", "snapToPlayhead"] => serde_json::json!(settings.editor.snap_to_playhead),
        ["editor", "defaultTransitionDuration"] => serde_json::json!(settings.editor.default_transition_duration),

        // Appearance settings
        ["appearance", "theme"] => serde_json::json!(settings.appearance.theme),
        ["appearance", "accentColor"] => serde_json::json!(settings.appearance.accent_color),
        ["appearance", "fontSize"] => serde_json::json!(settings.appearance.font_size),
        ["appearance", "reducedMotion"] => serde_json::json!(settings.appearance.reduced_motion),

        // Advanced settings
        ["advanced", "ffmpegPath"] => serde_json::json!(settings.advanced.ffmpeg_path),
        ["advanced", "ytdlpPath"] => serde_json::json!(settings.advanced.ytdlp_path),
        ["advanced", "tempPath"] => serde_json::json!(settings.advanced.temp_path),
        ["advanced", "cachePath"] => serde_json::json!(settings.advanced.cache_path),
        ["advanced", "maxCacheSize"] => serde_json::json!(settings.advanced.max_cache_size),
        ["advanced", "hardwareAcceleration"] => serde_json::json!(settings.advanced.hardware_acceleration),
        ["advanced", "hardwareAccelerationType"] => serde_json::json!(settings.advanced.hardware_acceleration_type),
        ["advanced", "debugMode"] => serde_json::json!(settings.advanced.debug_mode),
        ["advanced", "proxyUrl"] => serde_json::json!(settings.advanced.proxy_url),

        _ => {
            debug!("Unknown setting key: {}", key);
            return Err(crate::error::ClipyError::Config(format!("Unknown setting: {}", key)));
        }
    };

    debug!("Setting value: {:?}", value);
    Ok(value)
}

/// Export settings to JSON
#[tauri::command]
pub fn export_settings() -> Result<String> {
    debug!("Exporting settings to JSON");
    let settings = config::get_settings()?;
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| crate::error::ClipyError::Config(format!("Failed to serialize settings: {}", e)))?;
    debug!("Exported settings: {} bytes", json.len());
    Ok(json)
}

/// Import settings from JSON
#[tauri::command]
pub fn import_settings(app: AppHandle, json: String) -> Result<()> {
    info!("Importing settings from JSON");
    debug!("JSON input: {} bytes", json.len());

    let settings: AppSettings = serde_json::from_str(&json)
        .map_err(|e| crate::error::ClipyError::Config(format!("Failed to parse settings: {}", e)))?;

    debug!("Parsed settings successfully, saving");
    config::update_settings(&app, settings)
}
