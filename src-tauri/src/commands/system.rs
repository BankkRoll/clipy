//! System-related commands

use crate::error::{ClipyError, Result};
use crate::models::settings::BinaryStatus;
use crate::services::{binary, cache};
use crate::utils::{path_policy, paths};
use serde::Serialize;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
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
pub async fn get_system_info<R: Runtime>(app: AppHandle<R>) -> Result<SystemInfo> {
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
pub async fn check_binaries<R: Runtime>(app: AppHandle<R>) -> Result<BinaryStatus> {
    // PERF: probing spawns each tool and waits on it (seconds on a cold
    // disk); run it on the blocking pool so it never stalls an async worker.
    tokio::task::spawn_blocking(move || binary::check_binaries(&app))
        .await
        .map_err(|e| ClipyError::Other(format!("Binary check task failed: {e}")))?
}

/// Install FFmpeg
#[tauri::command]
pub async fn install_ffmpeg<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    info!("Installing FFmpeg via command");
    let path = binary::install_ffmpeg(&app).await;
    path.map(|p| p.to_string_lossy().into_owned())
}

/// Install yt-dlp
#[tauri::command]
pub async fn install_ytdlp<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    info!("Installing yt-dlp via command");
    let path = binary::install_ytdlp(&app).await;
    path.map(|p| p.to_string_lossy().into_owned())
}

/// Update Clipy's yt-dlp to the latest verified release; returns its version.
#[tauri::command]
pub async fn update_ytdlp<R: Runtime>(app: AppHandle<R>) -> Result<String> {
    info!("Updating yt-dlp via command");
    binary::update_ytdlp(&app).await
}

/// Compare the installed yt-dlp with the latest release.
#[tauri::command]
pub async fn check_ytdlp_update<R: Runtime>(
    app: AppHandle<R>,
) -> Result<binary::YtdlpUpdateStatus> {
    binary::check_ytdlp_update(&app).await
}

/// Get cache statistics
#[tauri::command]
pub async fn get_cache_stats<R: Runtime>(app: AppHandle<R>) -> Result<cache::CacheStats> {
    cache::get_cache_stats(&app).await
}

/// Clear cache
#[tauri::command]
pub async fn clear_cache<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    cache::clear_cache(&app).await
}

/// Clear temporary files
#[tauri::command]
pub async fn clear_temp<R: Runtime>(app: AppHandle<R>) -> Result<()> {
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
    /// The OS this build targets.
    const CURRENT: Os = if cfg!(target_os = "windows") {
        Os::Windows
    } else if cfg!(target_os = "macos") {
        Os::Mac
    } else {
        Os::Linux
    };
}

/// A program plus its argv, ready to spawn.
#[derive(Debug, PartialEq, Eq)]
struct ShellCommand {
    program: &'static str,
    args: Vec<OsString>,
}

impl ShellCommand {
    fn spawn(&self, what: &str) -> Result<()> {
        crate::utils::process::std_command(self.program)
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
    folder_command(Os::CURRENT, &dir).spawn("open folder")
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
    reveal_command(Os::CURRENT, &target).spawn("show in folder")
}

/// Get default download path
#[tauri::command]
pub fn get_default_download_path() -> String {
    default_download_path(dirs::download_dir(), dirs::home_dir())
}

/// `<Downloads>/Clipy`, else `<home>/Downloads/Clipy`, else `<temp>/Clipy`
/// (never relative: the working directory may be read-only).
fn default_download_path(download_dir: Option<PathBuf>, home_dir: Option<PathBuf>) -> String {
    download_dir
        .or_else(|| home_dir.map(|home| home.join("Downloads")))
        .unwrap_or_else(std::env::temp_dir)
        .join("Clipy")
        .to_string_lossy()
        .to_string()
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
pub fn app_ready<R: Runtime>(app: AppHandle<R>) {
    finish_smoke_test(crate::utils::smoke::is_enabled(), || app.exit(0));
}

/// Call `exit` when the frontend reported ready during a smoke test.
fn finish_smoke_test(smoke_enabled: bool, exit: impl FnOnce()) {
    if smoke_enabled {
        info!("Smoke test: frontend ready, exiting");
        exit();
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
        #[cfg(windows)]
        let expected = Os::Windows;
        #[cfg(target_os = "macos")]
        let expected = Os::Mac;
        #[cfg(not(any(windows, target_os = "macos")))]
        let expected = Os::Linux;
        assert_eq!(Os::CURRENT, expected);
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
    fn ready_exits_only_in_smoke_mode() {
        let exited = std::cell::Cell::new(false);
        finish_smoke_test(false, || exited.set(true));
        assert!(!exited.get());
        finish_smoke_test(true, || exited.set(true));
        assert!(exited.get());
    }

    #[test]
    fn default_download_path_fallbacks() {
        let p = |d: Option<&str>, h: Option<&str>| {
            PathBuf::from(default_download_path(
                d.map(PathBuf::from),
                h.map(PathBuf::from),
            ))
        };
        assert_eq!(
            p(Some("/dl"), Some("/home")),
            Path::new("/dl").join("Clipy")
        );
        assert_eq!(
            p(None, Some("/home")),
            Path::new("/home").join("Downloads").join("Clipy")
        );
        assert_eq!(p(None, None), std::env::temp_dir().join("Clipy"));
    }

    #[test]
    fn shell_commands_spawn_or_report_failure() {
        let missing = ShellCommand {
            program: "clipy-definitely-missing-program",
            args: Vec::new(),
        };
        let err = missing.spawn("open folder").unwrap_err();
        assert!(
            err.to_string().starts_with("Failed to open folder:"),
            "{err}"
        );
        #[cfg(windows)]
        let harmless = ShellCommand {
            program: "cmd",
            args: vec!["/c".into(), "exit".into()],
        };
        #[cfg(not(windows))]
        let harmless = ShellCommand {
            program: "true",
            args: Vec::new(),
        };
        harmless.spawn("run").unwrap();
    }

    #[tokio::test]
    async fn install_commands_fail_cleanly_without_a_usable_binaries_dir() {
        let app = crate::test_support::mock_app_in_tempdir();
        let data = paths::get_app_data_dir(app.handle()).unwrap();
        fs::create_dir_all(&data).unwrap();
        // A file where the binaries dir should be: both installers must stop
        // before any download starts.
        let bin = paths::get_binaries_dir(app.handle()).unwrap();
        fs::write(&bin, b"not a dir").unwrap();
        assert!(install_ffmpeg(app.handle().clone()).await.is_err());
        assert!(install_ytdlp(app.handle().clone()).await.is_err());
        assert_eq!(fs::read(&bin).unwrap(), b"not a dir");
    }

    #[tokio::test]
    async fn app_commands_use_the_app_directories() {
        use crate::test_support::mock_app_in_tempdir;
        let app = mock_app_in_tempdir();
        let handle = || app.handle().clone();

        let info = get_system_info(handle()).await.unwrap();
        let data = paths::get_app_data_dir(app.handle()).unwrap();
        assert_eq!(PathBuf::from(&info.app_data_path), data);
        assert_eq!(PathBuf::from(&info.temp_path), data.join("temp"));
        assert_eq!(info.app_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.os, std::env::consts::OS);

        let cache = paths::get_cache_dir(app.handle()).unwrap();
        let temp = paths::get_temp_dir(app.handle()).unwrap();
        for dir in [&cache, &temp] {
            fs::create_dir_all(dir).unwrap();
            fs::write(dir.join("f.bin"), b"12345").unwrap();
        }
        let stats = get_cache_stats(handle()).await.unwrap();
        assert_eq!((stats.thumbnail_size, stats.temp_file_size), (5, 5));
        clear_cache(handle()).await.unwrap();
        clear_temp(handle()).await.unwrap();
        assert!(!cache.join("f.bin").exists() && !temp.join("f.bin").exists());

        // Smoke mode is off in tests, so reporting ready does not exit.
        app_ready(handle());
    }

    #[tokio::test]
    async fn check_binaries_command_probes_off_the_async_worker() {
        use crate::test_support::{fake_tool, mock_app_in_tempdir, Script};
        let app = mock_app_in_tempdir();
        let bin = paths::get_binaries_dir(app.handle()).unwrap();
        let ffmpeg = Script {
            stdout: "ffmpeg version 7.1-test\n".into(),
            ..Default::default()
        };
        fake_tool(&bin, "ffmpeg", &ffmpeg);
        let status = check_binaries(app.handle().clone()).await.unwrap();
        assert!(status.ffmpeg_installed);
        assert_eq!(status.ffmpeg_version.as_deref(), Some("7.1-test"));
    }

    #[test]
    fn simple_commands() {
        assert!(get_default_download_path().ends_with("Clipy"));
        assert!(media_url("/a b.mp4".into()).starts_with("clipy-media://localhost/"));
        let _ = is_admin();
    }
}
