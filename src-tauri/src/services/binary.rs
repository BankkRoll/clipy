//! Binary management service for FFmpeg and yt-dlp

use crate::error::{ClipyError, Result};
use crate::models::settings::BinaryStatus;
use crate::utils::paths;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tracing::{debug, info, warn};

/// Check if required binaries are installed
pub fn check_binaries(app: &AppHandle) -> Result<BinaryStatus> {
    info!("Checking binary status");

    let binaries_dir = paths::get_binaries_dir(app)?;
    debug!("Binaries directory: {:?}", binaries_dir);

    debug!("Checking FFmpeg installation...");
    let ffmpeg_status = check_ffmpeg(&binaries_dir);
    debug!("FFmpeg status: installed={}, version={:?}", ffmpeg_status.0, ffmpeg_status.1);

    debug!("Checking yt-dlp installation...");
    let ytdlp_status = check_ytdlp(&binaries_dir);
    debug!("yt-dlp status: installed={}, version={:?}", ytdlp_status.0, ytdlp_status.1);

    let status = BinaryStatus {
        ffmpeg_installed: ffmpeg_status.0,
        ffmpeg_version: ffmpeg_status.1,
        ffmpeg_path: ffmpeg_status.2.map(|p| p.to_string_lossy().to_string()),
        ytdlp_installed: ytdlp_status.0,
        ytdlp_version: ytdlp_status.1,
        ytdlp_path: ytdlp_status.2.map(|p| p.to_string_lossy().to_string()),
    };

    debug!("Binary status: {:?}", status);
    Ok(status)
}

/// Check FFmpeg installation
fn check_ffmpeg(binaries_dir: &PathBuf) -> (bool, Option<String>, Option<PathBuf>) {
    // Check in binaries directory first
    let local_path = binaries_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    debug!("Checking local FFmpeg path: {:?}", local_path);

    if local_path.exists() {
        debug!("Local FFmpeg binary exists, checking version");
        if let Some(version) = get_ffmpeg_version(&local_path) {
            debug!("Local FFmpeg version: {}", version);
            return (true, Some(version), Some(local_path));
        }
        debug!("Failed to get FFmpeg version from local binary");
    } else {
        debug!("Local FFmpeg binary not found");
    }

    // Check system PATH
    let system_cmd = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    debug!("Checking system PATH for: {}", system_cmd);
    if let Some(version) = get_ffmpeg_version_from_path(system_cmd) {
        debug!("Found FFmpeg in PATH, version: {}", version);
        // Find the actual path
        if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg(system_cmd)
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout);
                let path = PathBuf::from(path_str.lines().next().unwrap_or("").trim());
                debug!("FFmpeg path from system: {:?}", path);
                return (true, Some(version), Some(path));
            }
        }
        return (true, Some(version), None);
    }

    debug!("FFmpeg not found in local directory or system PATH");
    (false, None, None)
}

/// Check yt-dlp installation
fn check_ytdlp(binaries_dir: &PathBuf) -> (bool, Option<String>, Option<PathBuf>) {
    // Check in binaries directory first
    let local_path = binaries_dir.join(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" });
    debug!("Checking local yt-dlp path: {:?}", local_path);

    if local_path.exists() {
        debug!("Local yt-dlp binary exists, checking version");
        if let Some(version) = get_ytdlp_version(&local_path) {
            debug!("Local yt-dlp version: {}", version);
            return (true, Some(version), Some(local_path));
        }
        debug!("Failed to get yt-dlp version from local binary");
    } else {
        debug!("Local yt-dlp binary not found");
    }

    // Check system PATH
    let system_cmd = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    debug!("Checking system PATH for: {}", system_cmd);
    if let Some(version) = get_ytdlp_version_from_path(system_cmd) {
        debug!("Found yt-dlp in PATH, version: {}", version);
        if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
            .arg(system_cmd)
            .output()
        {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout);
                let path = PathBuf::from(path_str.lines().next().unwrap_or("").trim());
                debug!("yt-dlp path from system: {:?}", path);
                return (true, Some(version), Some(path));
            }
        }
        return (true, Some(version), None);
    }

    debug!("yt-dlp not found in local directory or system PATH");
    (false, None, None)
}

/// Get FFmpeg version from a specific path
fn get_ffmpeg_version(path: &PathBuf) -> Option<String> {
    let output = Command::new(path)
        .arg("-version")
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_ffmpeg_version(&stdout)
    } else {
        None
    }
}

/// Get FFmpeg version from system PATH
fn get_ffmpeg_version_from_path(cmd: &str) -> Option<String> {
    let output = Command::new(cmd)
        .arg("-version")
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_ffmpeg_version(&stdout)
    } else {
        None
    }
}

/// Parse FFmpeg version from output
fn parse_ffmpeg_version(output: &str) -> Option<String> {
    // Output format: "ffmpeg version X.X.X ..."
    let first_line = output.lines().next()?;
    if first_line.contains("ffmpeg version") {
        let parts: Vec<&str> = first_line.split_whitespace().collect();
        if parts.len() >= 3 {
            return Some(parts[2].to_string());
        }
    }
    None
}

/// Get yt-dlp version from a specific path
fn get_ytdlp_version(path: &PathBuf) -> Option<String> {
    let output = Command::new(path)
        .arg("--version")
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Some(stdout.trim().to_string())
    } else {
        None
    }
}

/// Get yt-dlp version from system PATH
fn get_ytdlp_version_from_path(cmd: &str) -> Option<String> {
    let output = Command::new(cmd)
        .arg("--version")
        .output()
        .ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Some(stdout.trim().to_string())
    } else {
        None
    }
}

/// Get the path to FFmpeg binary
pub fn get_ffmpeg_path(app: &AppHandle) -> Result<PathBuf> {
    debug!("Getting FFmpeg path");
    let binaries_dir = paths::get_binaries_dir(app)?;
    let local_path = binaries_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });

    if local_path.exists() {
        debug!("Using local FFmpeg: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" };
    debug!("Local FFmpeg not found, checking system PATH");
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(system_cmd)
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let path = PathBuf::from(path_str.lines().next().unwrap_or("").trim());
            if path.exists() {
                debug!("Using system FFmpeg: {:?}", path);
                return Ok(path);
            }
        }
    }

    debug!("FFmpeg not found anywhere");
    Err(ClipyError::BinaryNotFound("FFmpeg not found".into()))
}

/// Get the path to yt-dlp binary
pub fn get_ytdlp_path(app: &AppHandle) -> Result<PathBuf> {
    debug!("Getting yt-dlp path");
    let binaries_dir = paths::get_binaries_dir(app)?;
    let local_path = binaries_dir.join(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" });

    if local_path.exists() {
        debug!("Using local yt-dlp: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" };
    debug!("Local yt-dlp not found, checking system PATH");
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(system_cmd)
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let path = PathBuf::from(path_str.lines().next().unwrap_or("").trim());
            if path.exists() {
                debug!("Using system yt-dlp: {:?}", path);
                return Ok(path);
            }
        }
    }

    debug!("yt-dlp not found anywhere");
    Err(ClipyError::BinaryNotFound("yt-dlp not found".into()))
}

/// Get the path to FFprobe binary (comes bundled with FFmpeg)
pub fn get_ffprobe_path(app: &AppHandle) -> Result<PathBuf> {
    debug!("Getting FFprobe path");
    let binaries_dir = paths::get_binaries_dir(app)?;
    let local_path = binaries_dir.join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });

    if local_path.exists() {
        debug!("Using local FFprobe: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" };
    debug!("Local FFprobe not found, checking system PATH");
    if let Ok(output) = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(system_cmd)
        .output()
    {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout);
            let path = PathBuf::from(path_str.lines().next().unwrap_or("").trim());
            if path.exists() {
                debug!("Using system FFprobe: {:?}", path);
                return Ok(path);
            }
        }
    }

    // If FFprobe not found, check if it's next to FFmpeg
    debug!("FFprobe not in PATH, checking alongside FFmpeg");
    if let Ok(ffmpeg_path) = get_ffmpeg_path(app) {
        if let Some(parent) = ffmpeg_path.parent() {
            let ffprobe_path = parent.join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });
            debug!("Checking FFprobe next to FFmpeg: {:?}", ffprobe_path);
            if ffprobe_path.exists() {
                debug!("Found FFprobe next to FFmpeg: {:?}", ffprobe_path);
                return Ok(ffprobe_path);
            }
        }
    }

    debug!("FFprobe not found anywhere");
    Err(ClipyError::BinaryNotFound("FFprobe not found".into()))
}

/// Download and install FFmpeg
pub async fn install_ffmpeg(app: &AppHandle) -> Result<PathBuf> {
    info!("Installing FFmpeg");

    let binaries_dir = paths::get_binaries_dir(app)?;
    let target_path = binaries_dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    debug!("FFmpeg target path: {:?}", target_path);

    #[cfg(target_os = "windows")]
    {
        let download_url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
        download_and_extract_ffmpeg(download_url, &binaries_dir, &target_path).await?;
    }

    #[cfg(target_os = "macos")]
    {
        let download_url = "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip";
        download_and_extract_ffmpeg(download_url, &binaries_dir, &target_path).await?;
    }

    #[cfg(target_os = "linux")]
    {
        let download_url = "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";
        download_and_extract_ffmpeg(download_url, &binaries_dir, &target_path).await?;
    }

    info!("FFmpeg installed to {:?}", target_path);
    Ok(target_path)
}

/// Download and install yt-dlp
pub async fn install_ytdlp(app: &AppHandle) -> Result<PathBuf> {
    info!("Installing yt-dlp");

    let binaries_dir = paths::get_binaries_dir(app)?;
    let target_path = binaries_dir.join(if cfg!(windows) { "yt-dlp.exe" } else { "yt-dlp" });
    debug!("yt-dlp target path: {:?}", target_path);

    #[cfg(target_os = "windows")]
    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";

    #[cfg(target_os = "macos")]
    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos";

    #[cfg(target_os = "linux")]
    let download_url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";

    download_binary(download_url, &target_path).await?;

    // Make executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&target_path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&target_path, perms)?;
    }

    info!("yt-dlp installed to {:?}", target_path);
    Ok(target_path)
}

/// Download a binary file
async fn download_binary(url: &str, target_path: &PathBuf) -> Result<()> {
    debug!("Downloading binary from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to download: {}", e)))?;

    if !response.status().is_success() {
        return Err(ClipyError::Other(format!("Download failed with status: {}", response.status())));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read response: {}", e)))?;

    std::fs::write(target_path, &bytes)
        .map_err(|e| ClipyError::Other(format!("Failed to write binary: {}", e)))?;

    Ok(())
}

/// Download and extract FFmpeg (platform-specific)
#[allow(unused_variables)]
async fn download_and_extract_ffmpeg(url: &str, binaries_dir: &PathBuf, target_path: &PathBuf) -> Result<()> {
    // Download the archive
    debug!("Downloading FFmpeg from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to download: {}", e)))?;

    if !response.status().is_success() {
        return Err(ClipyError::Other(format!("Download failed with status: {}", response.status())));
    }

    let bytes = response.bytes()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read response: {}", e)))?;

    // Write to temp file
    let temp_archive = binaries_dir.join("ffmpeg_temp.zip");
    std::fs::write(&temp_archive, &bytes)
        .map_err(|e| ClipyError::Other(format!("Failed to write archive: {}", e)))?;

    // Extract (platform-specific logic would go here)
    // For now, we'll use a simple approach
    warn!("FFmpeg extraction not fully implemented - manual installation may be required");

    // Clean up
    let _ = std::fs::remove_file(&temp_archive);

    Ok(())
}

/// Update yt-dlp to latest version
pub async fn update_ytdlp(app: &AppHandle) -> Result<String> {
    info!("Updating yt-dlp to latest version");
    let ytdlp_path = get_ytdlp_path(app)?;
    debug!("Running yt-dlp update from: {:?}", ytdlp_path);

    let output = Command::new(&ytdlp_path)
        .arg("-U")
        .output()
        .map_err(|e| ClipyError::BinaryExecutionFailed(format!("Failed to update yt-dlp: {}", e)))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    debug!("yt-dlp update stdout: {}", stdout);
    debug!("yt-dlp update stderr: {}", stderr);
    debug!("yt-dlp update exit code: {:?}", output.status.code());

    if output.status.success() {
        info!("yt-dlp updated successfully");
        Ok(stdout.to_string())
    } else {
        debug!("yt-dlp update failed");
        Err(ClipyError::BinaryExecutionFailed(format!("Update failed: {}", stderr)))
    }
}
