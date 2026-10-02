//! System-related commands

use crate::error::{ClipyError, Result};
use crate::models::settings::BinaryStatus;
use crate::services::{binary, cache};
use crate::utils::{path_policy, paths};
use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
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

/// Target OS for building file-manager command lines. A parameter rather than
/// `cfg!` so every platform's argv can be unit-tested on any host.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Os {
    Windows,
    Mac,
    Linux,
}

impl Os {
    fn current() -> Self {
        if cfg!(target_os = "windows") {
            Os::Windows
        } else if cfg!(target_os = "macos") {
            Os::Mac
        } else {
            Os::Linux
        }
    }
}

/// A program plus its argv, ready to spawn.
#[derive(Debug, PartialEq, Eq)]
struct ShellCommand {
    program: &'static str,
    args: Vec<OsString>,
}

impl ShellCommand {
    fn spawn(&self, what: &str) -> Result<()> {
        std::process::Command::new(self.program)
            .args(&self.args)
            .spawn()
            .map(|_| ())
            .map_err(|e| ClipyError::Other(format!("Failed to {what}: {e}")))
    }
}

// NOTE: neither `open` nor `xdg-open` accepts `--`, so option injection is
// prevented upstream instead: every path reaching these builders went through
// `path_policy`, which only yields absolute paths (never starting with `-`).

/// Command that opens directory `dir` in the platform file manager.
fn folder_command(os: Os, dir: &Path) -> ShellCommand {
    let program = match os {
        Os::Windows => "explorer",
        Os::Mac => "open",
        Os::Linux => "xdg-open",
    };
    ShellCommand {
        program,
        args: vec![dir.as_os_str().to_owned()],
    }
}

/// Command that reveals `target` in the platform file manager. Linux has no
/// standard "select" verb, so its parent directory is opened instead.
fn reveal_command(os: Os, target: &Path) -> ShellCommand {
    match os {
        Os::Windows => {
            // Explorer parses `/select,<path>` as one token; passing it as one
            // argument keeps paths with commas or spaces intact.
            let mut arg = OsString::from("/select,");
            arg.push(target.as_os_str());
            ShellCommand {
                program: "explorer",
                args: vec![arg],
            }
        }
        Os::Mac => ShellCommand {
            program: "open",
            args: vec!["-R".into(), target.as_os_str().to_owned()],
        },
        Os::Linux => folder_command(os, target.parent().unwrap_or(target)),
    }
}

/// Validate a path for `open_file`: must be an existing local audio, video or
/// image file, so the shell can never be asked to run an executable, script,
/// shortcut (`.lnk`) or URL.
fn validate_open_file(path: &str) -> Result<PathBuf> {
    path_policy::ensure_editor_source(path)
}

/// Validate a path for `show_in_folder`: any existing local file or directory.
/// Revealing never executes the target, so no type restriction is needed.
fn validate_reveal_target(path: &str) -> Result<PathBuf> {
    path_policy::canonicalize(&path_policy::validate_raw_path(path)?)
}

/// Open folder in file explorer
#[tauri::command]
pub async fn open_folder(path: String) -> Result<()> {
    let dir = path_policy::ensure_local_dir(&path)?;
    folder_command(Os::current(), &dir).spawn("open folder")
}

/// Open file with default application
#[tauri::command]
pub async fn open_file(path: String) -> Result<()> {
    let file = validate_open_file(&path)?;
    opener::open(&file).map_err(|e| ClipyError::Other(format!("Failed to open file: {}", e)))
}

/// Show file in file explorer
#[tauri::command]
pub async fn show_in_folder(path: String) -> Result<()> {
    let target = validate_reveal_target(&path)?;
    reveal_command(Os::current(), &target).spawn("show in folder")
}

/// Get default download path
#[tauri::command]
pub fn get_default_download_path() -> String {
    if let Some(dir) = dirs::download_dir() {
        dir.join("Clipy").to_string_lossy().to_string()
    } else if let Some(dir) = dirs::home_dir() {
        dir.join("Downloads")
            .join("Clipy")
            .to_string_lossy()
            .to_string()
    } else {
        "Downloads/Clipy".to_string()
    }
}

/// Build a `clipy-media://` URL for a local file so the webview can play it via
/// our custom streaming protocol (the built-in asset protocol rejects many
/// real-world filenames on Windows).
#[tauri::command]
pub fn media_url(path: String) -> String {
    crate::media_protocol::to_media_url(&path)
}

/// Called by the frontend once it has mounted. In installer smoke-test mode
/// this ends the process with exit code 0, proving the installed app booted
/// end to end; otherwise it does nothing.
#[tauri::command]
pub fn app_ready(app: AppHandle) {
    if crate::utils::smoke::is_enabled() {
        info!("Smoke test: frontend ready, exiting");
        app.exit(0);
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[test]
    fn folder_commands_per_os() {
        let dir = Path::new("/videos/My Clips");
        for (os, program) in [
            (Os::Windows, "explorer"),
            (Os::Mac, "open"),
            (Os::Linux, "xdg-open"),
        ] {
            let cmd = folder_command(os, dir);
            assert_eq!(cmd.program, program);
            assert_eq!(cmd.args, vec![OsString::from("/videos/My Clips")]);
        }
    }

    #[test]
    fn reveal_commands_per_os() {
        let f = Path::new("/videos/a, b.mp4");
        assert_eq!(
            reveal_command(Os::Windows, f).args,
            vec![OsString::from("/select,/videos/a, b.mp4")]
        );
        let mac = reveal_command(Os::Mac, f);
        assert_eq!(mac.program, "open");
        assert_eq!(
            mac.args,
            vec![OsString::from("-R"), OsString::from("/videos/a, b.mp4")]
        );
        let linux = reveal_command(Os::Linux, f);
        assert_eq!(linux.program, "xdg-open");
        assert_eq!(linux.args, vec![OsString::from("/videos")]);
        assert_eq!(
            reveal_command(Os::Linux, Path::new("/")).args,
            vec![OsString::from("/")]
        );
    }

    #[test]
    fn current_os_matches_target() {
        let os = Os::current();
        if cfg!(windows) {
            assert_eq!(os, Os::Windows);
        } else if cfg!(target_os = "macos") {
            assert_eq!(os, Os::Mac);
        } else {
            assert_eq!(os, Os::Linux);
        }
    }

    #[test]
    fn open_file_only_accepts_media() {
        let dir = tempfile::tempdir().unwrap();
        let video = dir.path().join("v.mp4");
        fs::write(&video, b"x").unwrap();
        assert!(validate_open_file(&s(&video)).is_ok());
        for name in [
            "setup.exe",
            "run.bat",
            "link.lnk",
            "x.ps1",
            "x.sh",
            "x.html",
        ] {
            let p = dir.path().join(name);
            fs::write(&p, b"x").unwrap();
            assert!(validate_open_file(&s(&p)).is_err(), "{name}");
        }
        assert!(validate_open_file("https://evil.example/x.mp4").is_err());
        assert!(validate_open_file("-x.mp4").is_err());
        assert!(validate_open_file(&s(dir.path())).is_err());
    }

    #[test]
    fn reveal_accepts_existing_files_and_dirs_only() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("notes.txt");
        fs::write(&f, b"x").unwrap();
        assert!(validate_reveal_target(&s(&f)).is_ok());
        assert!(validate_reveal_target(&s(dir.path())).is_ok());
        assert!(validate_reveal_target(&s(&dir.path().join("missing"))).is_err());
        assert!(validate_reveal_target("file:///etc").is_err());
    }

    #[tokio::test]
    async fn commands_reject_bad_paths_without_spawning() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("evil.exe");
        fs::write(&exe, b"MZ").unwrap();
        assert!(open_file(s(&exe)).await.is_err());
        assert!(open_folder(s(&exe)).await.is_err());
        assert!(open_folder("--help".into()).await.is_err());
        assert!(show_in_folder("http://x".into()).await.is_err());
        assert!(show_in_folder(s(&dir.path().join("missing")))
            .await
            .is_err());
    }

    #[test]
    fn simple_commands() {
        assert!(get_default_download_path().ends_with("Clipy"));
        assert!(media_url("/a b.mp4".into()).starts_with("clipy-media://localhost/"));
        let _ = is_admin();
    }
}
