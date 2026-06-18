//! Binary management service for FFmpeg and yt-dlp

use crate::error::{ClipyError, Result};
use crate::models::settings::BinaryStatus;
use crate::utils::paths;
use std::path::PathBuf;
use std::process::Command;
use tauri::AppHandle;
use tracing::{debug, info};

/// Check if required binaries are installed
pub fn check_binaries(app: &AppHandle) -> Result<BinaryStatus> {
    info!("Checking binary status");

    let binaries_dir = paths::get_binaries_dir(app)?;
    debug!("Binaries directory: {:?}", binaries_dir);

    debug!("Checking FFmpeg installation...");
    let ffmpeg_status = check_ffmpeg(&binaries_dir);
    debug!(
        "FFmpeg status: installed={}, version={:?}",
        ffmpeg_status.0, ffmpeg_status.1
    );

    debug!("Checking yt-dlp installation...");
    let ytdlp_status = check_ytdlp(&binaries_dir);
    debug!(
        "yt-dlp status: installed={}, version={:?}",
        ytdlp_status.0, ytdlp_status.1
    );

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
    let local_path = binaries_dir.join(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
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
    let system_cmd = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
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
    let local_path = binaries_dir.join(if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    });
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
    let system_cmd = if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
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
    let output = Command::new(path).arg("-version").output().ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        parse_ffmpeg_version(&stdout)
    } else {
        None
    }
}

/// Get FFmpeg version from system PATH
fn get_ffmpeg_version_from_path(cmd: &str) -> Option<String> {
    let output = Command::new(cmd).arg("-version").output().ok()?;

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
    let output = Command::new(path).arg("--version").output().ok()?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Some(stdout.trim().to_string())
    } else {
        None
    }
}

/// Get yt-dlp version from system PATH
fn get_ytdlp_version_from_path(cmd: &str) -> Option<String> {
    let output = Command::new(cmd).arg("--version").output().ok()?;

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
    let local_path = binaries_dir.join(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });

    if local_path.exists() {
        debug!("Using local FFmpeg: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
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
    let local_path = binaries_dir.join(if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    });

    if local_path.exists() {
        debug!("Using local yt-dlp: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
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
    let local_path = binaries_dir.join(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    });

    if local_path.exists() {
        debug!("Using local FFprobe: {:?}", local_path);
        return Ok(local_path);
    }

    // Try system PATH
    let system_cmd = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
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
            let ffprobe_path = parent.join(if cfg!(windows) {
                "ffprobe.exe"
            } else {
                "ffprobe"
            });
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
    let target_path = binaries_dir.join(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    });
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
        let download_url =
            "https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz";
        download_and_extract_ffmpeg(download_url, &binaries_dir, &target_path).await?;
    }

    info!("FFmpeg installed to {:?}", target_path);
    Ok(target_path)
}

/// Download and install yt-dlp
pub async fn install_ytdlp(app: &AppHandle) -> Result<PathBuf> {
    info!("Installing yt-dlp");

    let binaries_dir = paths::get_binaries_dir(app)?;
    let target_path = binaries_dir.join(if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    });
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
        return Err(ClipyError::Other(format!(
            "Download failed with status: {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read response: {}", e)))?;

    std::fs::write(target_path, &bytes)
        .map_err(|e| ClipyError::Other(format!("Failed to write binary: {}", e)))?;

    Ok(())
}

/// Download and extract FFmpeg (platform-specific).
///
/// Downloads the archive at `url` to a temp file inside `binaries_dir`, then
/// extracts the `ffmpeg` (and `ffprobe`) binaries into `binaries_dir`, placing
/// the ffmpeg binary at `target_path`. The archives are nested, so entries are
/// matched by basename rather than full path.
///
/// - Windows/macOS: `.zip` archives, extracted via the `zip` crate.
/// - Linux: `.tar.xz` archive, decompressed with `xz2` then untarred with `tar`.
async fn download_and_extract_ffmpeg(
    url: &str,
    binaries_dir: &PathBuf,
    target_path: &PathBuf,
) -> Result<()> {
    // Download the archive
    debug!("Downloading FFmpeg from {}", url);

    let response = reqwest::get(url)
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to download: {}", e)))?;

    if !response.status().is_success() {
        return Err(ClipyError::Other(format!(
            "Download failed with status: {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read response: {}", e)))?;

    // Write to temp file (memory-friendly: extraction streams from this file)
    let ext = if cfg!(target_os = "linux") {
        "tar.xz"
    } else {
        "zip"
    };
    let temp_archive = binaries_dir.join(format!("ffmpeg_temp.{}", ext));
    std::fs::write(&temp_archive, &bytes)
        .map_err(|e| ClipyError::Other(format!("Failed to write archive: {}", e)))?;
    drop(bytes);

    // Extract on a blocking thread (zip/tar are synchronous, blocking I/O).
    let temp_archive_extract = temp_archive.clone();
    let binaries_dir_extract = binaries_dir.clone();
    let target_path_extract = target_path.clone();
    let extract_result = tokio::task::spawn_blocking(move || {
        extract_ffmpeg_archive(
            &temp_archive_extract,
            &binaries_dir_extract,
            &target_path_extract,
        )
    })
    .await
    .map_err(|e| ClipyError::Other(format!("Extraction task failed: {}", e)))?;

    // Clean up temp archive regardless of extraction outcome.
    let _ = std::fs::remove_file(&temp_archive);

    extract_result?;

    if !target_path.exists() {
        return Err(ClipyError::Other(
            "FFmpeg binary not found in downloaded archive".into(),
        ));
    }

    info!("FFmpeg extracted to {:?}", target_path);
    Ok(())
}

/// Synchronous extraction of the ffmpeg/ffprobe binaries from a downloaded archive.
#[cfg(not(target_os = "linux"))]
fn extract_ffmpeg_archive(
    archive: &PathBuf,
    binaries_dir: &PathBuf,
    target_path: &PathBuf,
) -> Result<()> {
    extract_ffmpeg_zip(archive, binaries_dir, target_path)
}

/// Synchronous extraction of the ffmpeg/ffprobe binaries from a downloaded archive.
#[cfg(target_os = "linux")]
fn extract_ffmpeg_archive(
    archive: &PathBuf,
    binaries_dir: &PathBuf,
    target_path: &PathBuf,
) -> Result<()> {
    extract_ffmpeg_tar_xz(archive, binaries_dir, target_path)
}

/// Return true if `name` is the basename `ffmpeg`/`ffmpeg.exe` or `ffprobe`/`ffprobe.exe`.
/// Returns the destination filename to use, or None if this entry is not wanted.
fn ffmpeg_entry_dest(name: &str) -> Option<&'static str> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
    match base {
        "ffmpeg" | "ffmpeg.exe" => Some(if cfg!(windows) {
            "ffmpeg.exe"
        } else {
            "ffmpeg"
        }),
        "ffprobe" | "ffprobe.exe" => Some(if cfg!(windows) {
            "ffprobe.exe"
        } else {
            "ffprobe"
        }),
        _ => None,
    }
}

/// Set 0o755 permissions on an extracted unix binary.
#[cfg(unix)]
fn set_executable(path: &PathBuf) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &PathBuf) -> Result<()> {
    Ok(())
}

/// Extract ffmpeg/ffprobe from a `.zip` archive (Windows/macOS).
#[cfg(not(target_os = "linux"))]
fn extract_ffmpeg_zip(
    archive: &PathBuf,
    binaries_dir: &PathBuf,
    target_path: &PathBuf,
) -> Result<()> {
    let file = std::fs::File::open(archive)
        .map_err(|e| ClipyError::Other(format!("Failed to open archive: {}", e)))?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| ClipyError::Other(format!("Failed to read zip archive: {}", e)))?;

    let mut found_ffmpeg = false;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| ClipyError::Other(format!("Failed to read zip entry: {}", e)))?;

        if !entry.is_file() {
            continue;
        }

        let entry_name = entry.name().to_string();
        let dest_name = match ffmpeg_entry_dest(&entry_name) {
            Some(name) => name,
            None => continue,
        };

        let dest_path = if dest_name
            == target_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
        {
            target_path.clone()
        } else {
            binaries_dir.join(dest_name)
        };

        debug!("Extracting {} -> {:?}", entry_name, dest_path);
        let mut out = std::fs::File::create(&dest_path)
            .map_err(|e| ClipyError::Other(format!("Failed to create {:?}: {}", dest_path, e)))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| ClipyError::Other(format!("Failed to extract {}: {}", entry_name, e)))?;
        drop(out);

        set_executable(&dest_path)?;

        if dest_name.starts_with("ffmpeg") {
            found_ffmpeg = true;
        }
    }

    if !found_ffmpeg {
        return Err(ClipyError::Other(
            "ffmpeg binary not found inside zip archive".into(),
        ));
    }

    Ok(())
}

/// Extract ffmpeg/ffprobe from a `.tar.xz` archive (Linux).
#[cfg(target_os = "linux")]
fn extract_ffmpeg_tar_xz(
    archive: &PathBuf,
    binaries_dir: &PathBuf,
    target_path: &PathBuf,
) -> Result<()> {
    let file = std::fs::File::open(archive)
        .map_err(|e| ClipyError::Other(format!("Failed to open archive: {}", e)))?;
    let decompressor = xz2::read::XzDecoder::new(std::io::BufReader::new(file));
    let mut tar = tar::Archive::new(decompressor);

    let mut found_ffmpeg = false;
    let entries = tar
        .entries()
        .map_err(|e| ClipyError::Other(format!("Failed to read tar entries: {}", e)))?;

    for entry in entries {
        let mut entry =
            entry.map_err(|e| ClipyError::Other(format!("Failed to read tar entry: {}", e)))?;

        let path = entry
            .path()
            .map_err(|e| ClipyError::Other(format!("Failed to read tar entry path: {}", e)))?;
        let entry_name = path.to_string_lossy().to_string();

        let dest_name = match ffmpeg_entry_dest(&entry_name) {
            Some(name) => name,
            None => continue,
        };

        let dest_path = if dest_name
            == target_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
        {
            target_path.clone()
        } else {
            binaries_dir.join(dest_name)
        };

        debug!("Extracting {} -> {:?}", entry_name, dest_path);
        let mut out = std::fs::File::create(&dest_path)
            .map_err(|e| ClipyError::Other(format!("Failed to create {:?}: {}", dest_path, e)))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| ClipyError::Other(format!("Failed to extract {}: {}", entry_name, e)))?;
        drop(out);

        set_executable(&dest_path)?;

        if dest_name.starts_with("ffmpeg") {
            found_ffmpeg = true;
        }
    }

    if !found_ffmpeg {
        return Err(ClipyError::Other(
            "ffmpeg binary not found inside tar.xz archive".into(),
        ));
    }

    Ok(())
}

/// Update yt-dlp to latest version
pub async fn update_ytdlp(app: &AppHandle) -> Result<String> {
    info!("Updating yt-dlp to latest version");
    let ytdlp_path = get_ytdlp_path(app)?;
    debug!("Running yt-dlp update from: {:?}", ytdlp_path);

    let output = Command::new(&ytdlp_path).arg("-U").output().map_err(|e| {
        ClipyError::BinaryExecutionFailed(format!("Failed to update yt-dlp: {}", e))
    })?;

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
        Err(ClipyError::BinaryExecutionFailed(format!(
            "Update failed: {}",
            stderr
        )))
    }
}
