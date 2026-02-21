//! Path utilities for Clipy
//!
//! Handles all application path management including:
//! - App data directory
//! - Config files
//! - Cache directories
//! - Download directories
//! - Binary locations

use crate::error::{ClipyError, Result};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use tracing::{debug, info};

/// Application directory names
const APP_NAME: &str = "Clipy";
const CONFIG_FILE: &str = "config.json";
const DATABASE_FILE: &str = "library.db";
const CACHE_DIR: &str = "cache";
const TEMP_DIR: &str = "temp";
const LOGS_DIR: &str = "logs";
const BINARIES_DIR: &str = "binaries";
const THUMBNAILS_DIR: &str = "thumbnails";
const PROJECTS_DIR: &str = "projects";
const DOWNLOAD_ARCHIVE_FILE: &str = "download_archive.txt";

/// Get the application data directory
pub fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| ClipyError::InvalidPath(e.to_string()))
}

/// Get the config file path
pub fn get_config_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(CONFIG_FILE))
}

/// Get the database file path
pub fn get_database_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(DATABASE_FILE))
}

/// Get the cache directory path
pub fn get_cache_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(CACHE_DIR))
}

/// Get the temp directory path
pub fn get_temp_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(TEMP_DIR))
}

/// Get the logs directory path
pub fn get_logs_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(LOGS_DIR))
}

/// Get the binaries directory path
pub fn get_binaries_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(BINARIES_DIR))
}

/// Get the thumbnails cache directory path
pub fn get_thumbnails_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_cache_dir(app)?.join(THUMBNAILS_DIR))
}

/// Get the projects directory path
pub fn get_projects_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(PROJECTS_DIR))
}

/// Get the download archive file path (for tracking downloaded videos)
pub fn get_download_archive_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(DOWNLOAD_ARCHIVE_FILE))
}

/// Get the FFmpeg binary path
pub fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    let binaries_dir = get_binaries_dir(app)?;

    #[cfg(target_os = "windows")]
    let ffmpeg_name = "ffmpeg.exe";

    #[cfg(not(target_os = "windows"))]
    let ffmpeg_name = "ffmpeg";

    Ok(binaries_dir.join(ffmpeg_name))
}

/// Get the yt-dlp binary path
pub fn get_ytdlp_path(app: &AppHandle) -> Result<PathBuf> {
    let binaries_dir = get_binaries_dir(app)?;

    #[cfg(target_os = "windows")]
    let ytdlp_name = "yt-dlp.exe";

    #[cfg(not(target_os = "windows"))]
    let ytdlp_name = "yt-dlp";

    Ok(binaries_dir.join(ytdlp_name))
}

/// Get the default downloads directory
pub fn get_default_downloads_dir() -> PathBuf {
    dirs::video_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_NAME)
}

/// Ensure all application directories exist
pub fn ensure_app_dirs(app: &AppHandle) -> Result<()> {
    let dirs = [
        get_app_data_dir(app)?,
        get_cache_dir(app)?,
        get_temp_dir(app)?,
        get_logs_dir(app)?,
        get_binaries_dir(app)?,
        get_thumbnails_dir(app)?,
        get_projects_dir(app)?,
    ];

    for dir in dirs {
        if !dir.exists() {
            debug!("Creating directory: {:?}", dir);
            fs::create_dir_all(&dir)?;
        }
    }

    // Also ensure default downloads directory exists
    let downloads_dir = get_default_downloads_dir();
    if !downloads_dir.exists() {
        debug!("Creating downloads directory: {:?}", downloads_dir);
        fs::create_dir_all(&downloads_dir)?;
    }

    info!("Application directories initialized");
    Ok(())
}

/// Clean up temporary files
pub fn cleanup_temp_dir(app: &AppHandle) -> Result<()> {
    let temp_dir = get_temp_dir(app)?;

    if temp_dir.exists() {
        for entry in fs::read_dir(&temp_dir)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                let _ = fs::remove_file(&path);
            } else if path.is_dir() {
                let _ = fs::remove_dir_all(&path);
            }
        }
    }

    info!("Temporary files cleaned up");
    Ok(())
}

/// Get the cache size in bytes
pub fn get_cache_size(app: &AppHandle) -> Result<u64> {
    let cache_dir = get_cache_dir(app)?;
    calculate_dir_size(&cache_dir)
}

/// Calculate directory size recursively
fn calculate_dir_size(path: &PathBuf) -> Result<u64> {
    let mut size = 0;

    if path.is_dir() {
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() {
                size += entry.metadata()?.len();
            } else if path.is_dir() {
                size += calculate_dir_size(&path)?;
            }
        }
    }

    Ok(size)
}

/// Clear the cache directory
pub fn clear_cache(app: &AppHandle) -> Result<()> {
    let cache_dir = get_cache_dir(app)?;

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir)?;
        fs::create_dir_all(&cache_dir)?;
    }

    info!("Cache cleared");
    Ok(())
}

/// Sanitize a filename to remove invalid characters
pub fn sanitize_filename(name: &str) -> String {
    let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

    let sanitized: String = name
        .chars()
        .map(|c| {
            if invalid_chars.contains(&c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Trim and limit length
    sanitized.trim().chars().take(200).collect()
}
