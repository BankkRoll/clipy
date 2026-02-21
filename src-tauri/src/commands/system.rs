//! System-related commands

use crate::error::Result;
use crate::models::settings::BinaryStatus;
use crate::services::{binary, cache};
use crate::utils::paths;
use serde::Serialize;
use tauri::AppHandle;
use tracing::info;

/// System information
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub app_version: String,
    pub app_data_path: String,
    pub cache_path: String,
    pub binaries_path: String,
    pub temp_path: String,
    pub os: String,
    pub arch: String,
}

/// Get system information
#[tauri::command]
pub async fn get_system_info(app: AppHandle) -> Result<SystemInfo> {
    let app_data = paths::get_app_data_dir(&app)?;
    let cache = paths::get_cache_dir(&app)?;
    let binaries = paths::get_binaries_dir(&app)?;
    let temp = paths::get_temp_dir(&app)?;

    Ok(SystemInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        app_data_path: app_data.to_string_lossy().to_string(),
        cache_path: cache.to_string_lossy().to_string(),
        binaries_path: binaries.to_string_lossy().to_string(),
        temp_path: temp.to_string_lossy().to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    })
}

/// Check binary status
#[tauri::command]
pub async fn check_binaries(app: AppHandle) -> Result<BinaryStatus> {
    binary::check_binaries(&app)
}

/// Install FFmpeg
#[tauri::command]
pub async fn install_ffmpeg(app: AppHandle) -> Result<String> {
    info!("Installing FFmpeg via command");
    let path = binary::install_ffmpeg(&app).await?;
    Ok(path.to_string_lossy().to_string())
}

/// Install yt-dlp
#[tauri::command]
pub async fn install_ytdlp(app: AppHandle) -> Result<String> {
    info!("Installing yt-dlp via command");
    let path = binary::install_ytdlp(&app).await?;
    Ok(path.to_string_lossy().to_string())
}

/// Update yt-dlp
#[tauri::command]
pub async fn update_ytdlp(app: AppHandle) -> Result<String> {
    info!("Updating yt-dlp via command");
    binary::update_ytdlp(&app).await
}

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats(app: AppHandle) -> Result<cache::CacheStats> {
    cache::get_cache_stats(&app).await
}

/// Clear cache
#[tauri::command]
pub async fn clear_cache(app: AppHandle) -> Result<()> {
    cache::clear_cache(&app).await
}

/// Clear temporary files
#[tauri::command]
pub async fn clear_temp(app: AppHandle) -> Result<()> {
    cache::clear_temp(&app).await
}

/// Open folder in file explorer
#[tauri::command]
pub async fn open_folder(path: String) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| crate::error::ClipyError::Other(format!("Failed to open folder: {}", e)))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| crate::error::ClipyError::Other(format!("Failed to open folder: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| crate::error::ClipyError::Other(format!("Failed to open folder: {}", e)))?;
    }

    Ok(())
}

/// Open file with default application
#[tauri::command]
pub async fn open_file(path: String) -> Result<()> {
    opener::open(&path)
        .map_err(|e| crate::error::ClipyError::Other(format!("Failed to open file: {}", e)))?;
    Ok(())
}

/// Show file in file explorer
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| crate::error::ClipyError::Other(format!("Failed to show in folder: {}", e)))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| crate::error::ClipyError::Other(format!("Failed to show in folder: {}", e)))?;
    }

    #[cfg(target_os = "linux")]
    {
        // Linux doesn't have a standard way to select file, just open the folder
        if let Some(parent) = std::path::Path::new(&path).parent() {
            std::process::Command::new("xdg-open")
                .arg(parent)
                .spawn()
                .map_err(|e| crate::error::ClipyError::Other(format!("Failed to show in folder: {}", e)))?;
        }
    }

    Ok(())
}

/// Get default download path
#[tauri::command]
pub fn get_default_download_path() -> String {
    if let Some(dir) = dirs::download_dir() {
        dir.join("Clipy").to_string_lossy().to_string()
    } else if let Some(dir) = dirs::home_dir() {
        dir.join("Downloads").join("Clipy").to_string_lossy().to_string()
    } else {
        "Downloads/Clipy".to_string()
    }
}

/// Check if app is running as administrator (Windows)
#[tauri::command]
pub fn is_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
        // Simple check - try to access a protected location
        std::fs::metadata("C:\\Windows\\System32\\config").is_ok()
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, check if running as root
        unsafe { libc::geteuid() == 0 }
    }
}
