//! Path utilities for Clipy
//!
//! Handles all application path management including:
//! - App data directory
//! - Config files
//! - Cache directories
//! - Download directories
//! - Binary locations
//!
//! Every resolver is generic over the Tauri [`Runtime`] so the same code runs
//! against the real Wry runtime and `tauri::test::MockRuntime`.

use crate::error::{ClipyError, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime};
use tracing::{debug, info};

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

/// Get the application data directory (`<data_dir>/<bundle identifier>`).
pub fn get_app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map_err(|e| ClipyError::InvalidPath(e.to_string()))
}

/// Get the config file path
pub fn get_config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(CONFIG_FILE))
}

/// Get the database file path
pub fn get_database_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(DATABASE_FILE))
}

/// Get the cache directory path
pub fn get_cache_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(CACHE_DIR))
}

/// Get the temp directory path
pub fn get_temp_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(TEMP_DIR))
}

/// Get the logs directory path
pub fn get_logs_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(LOGS_DIR))
}

/// Get the binaries directory path
pub fn get_binaries_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(BINARIES_DIR))
}

/// Get the thumbnails cache directory path
pub fn get_thumbnails_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_cache_dir(app)?.join(THUMBNAILS_DIR))
}

/// Get the projects directory path
pub fn get_projects_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(PROJECTS_DIR))
}

/// Get the download archive file path (for tracking downloaded videos)
pub fn get_download_archive_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_app_data_dir(app)?.join(DOWNLOAD_ARCHIVE_FILE))
}

/// Get the FFmpeg binary path
pub fn get_ffmpeg_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_binaries_dir(app)?.join(executable_name("ffmpeg")))
}

/// Get the yt-dlp binary path
pub fn get_ytdlp_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(get_binaries_dir(app)?.join(executable_name("yt-dlp")))
}

/// Append the platform executable suffix (`.exe` on Windows) to `stem`.
pub fn executable_name(stem: &str) -> String {
    format!("{}{}", stem, std::env::consts::EXE_SUFFIX)
}

/// Get the default downloads directory.
///
/// NOTE: this prefers the OS *Videos* folder (`~/Videos/Clipy`) and only falls
/// back to *Downloads* when the platform has no Videos dir.
/// `commands::system::get_default_download_path` prefers *Downloads* instead;
/// the two are intentionally left as-is because existing installs already
/// persisted whichever path they resolved on first launch. The persisted
/// `download.downloadPath` setting is the source of truth at download time.
pub fn get_default_downloads_dir() -> PathBuf {
    dirs::video_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_NAME)
}

/// Ensure all application directories exist
pub fn ensure_app_dirs<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    let dirs = [
        get_app_data_dir(app)?,
        get_cache_dir(app)?,
        get_temp_dir(app)?,
        get_logs_dir(app)?,
        get_binaries_dir(app)?,
        get_thumbnails_dir(app)?,
        get_projects_dir(app)?,
        get_default_downloads_dir(),
    ];
    ensure_dirs(&dirs)?;
    info!("Application directories initialized");
    Ok(())
}

/// Create every directory in `dirs` (and its parents) if missing.
pub fn ensure_dirs(dirs: &[PathBuf]) -> Result<()> {
    for dir in dirs {
        if !dir.exists() {
            debug!("Creating directory: {:?}", dir);
            fs::create_dir_all(dir)?;
        }
    }
    Ok(())
}

/// Clean up temporary files
pub fn cleanup_temp_dir<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    remove_dir_contents(&get_temp_dir(app)?)?;
    info!("Temporary files cleaned up");
    Ok(())
}

/// Best-effort removal of every entry inside `dir`, keeping `dir` itself.
///
/// Individual entries that cannot be removed (e.g. a file still open on
/// Windows) are skipped rather than aborting the sweep.
pub fn remove_dir_contents(dir: &Path) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            let _ = fs::remove_dir_all(&path);
        } else {
            let _ = fs::remove_file(&path);
        }
    }
    Ok(())
}

/// Get the cache size in bytes
pub fn get_cache_size<R: Runtime>(app: &AppHandle<R>) -> Result<u64> {
    calculate_dir_size(&get_cache_dir(app)?)
}

/// Total size in bytes of all regular files under `path` (recursive).
/// A missing directory has size 0.
pub fn calculate_dir_size(path: &Path) -> Result<u64> {
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
pub fn clear_cache<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
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

    sanitized.trim().chars().take(200).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::mock_app;

    #[test]
    fn resolvers_are_rooted_in_app_data_dir() {
        let app = mock_app();
        let handle = app.handle();
        let root = get_app_data_dir(handle).unwrap();

        assert_eq!(get_config_path(handle).unwrap(), root.join("config.json"));
        assert_eq!(get_database_path(handle).unwrap(), root.join("library.db"));
        assert_eq!(get_cache_dir(handle).unwrap(), root.join("cache"));
        assert_eq!(get_temp_dir(handle).unwrap(), root.join("temp"));
        assert_eq!(get_logs_dir(handle).unwrap(), root.join("logs"));
        assert_eq!(get_binaries_dir(handle).unwrap(), root.join("binaries"));
        assert_eq!(
            get_thumbnails_dir(handle).unwrap(),
            root.join("cache").join("thumbnails")
        );
        assert_eq!(get_projects_dir(handle).unwrap(), root.join("projects"));
        assert_eq!(
            get_download_archive_path(handle).unwrap(),
            root.join("download_archive.txt")
        );
        assert_eq!(
            get_ffmpeg_path(handle).unwrap(),
            root.join("binaries").join(executable_name("ffmpeg"))
        );
        assert_eq!(
            get_ytdlp_path(handle).unwrap(),
            root.join("binaries").join(executable_name("yt-dlp"))
        );
    }

    #[test]
    fn executable_name_uses_platform_suffix() {
        if cfg!(windows) {
            assert_eq!(executable_name("ffmpeg"), "ffmpeg.exe");
        } else {
            assert_eq!(executable_name("ffmpeg"), "ffmpeg");
        }
    }

    #[test]
    fn default_downloads_dir_ends_with_app_name() {
        let dir = get_default_downloads_dir();
        assert_eq!(dir.file_name().unwrap(), "Clipy");
    }

    #[test]
    fn ensure_dirs_creates_nested_and_is_idempotent() {
        let tmp = tempfile::tempdir().unwrap();
        let dirs = vec![tmp.path().join("a").join("b"), tmp.path().join("c")];
        ensure_dirs(&dirs).unwrap();
        ensure_dirs(&dirs).unwrap();
        assert!(dirs.iter().all(|d| d.is_dir()));
    }

    #[test]
    fn ensure_dirs_reports_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("file");
        fs::write(&file, b"x").unwrap();
        assert!(ensure_dirs(&[file.join("child")]).is_err());
    }

    #[test]
    fn dir_size_and_content_removal() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("cache");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("a.bin"), vec![0u8; 10]).unwrap();
        fs::write(root.join("nested").join("b.bin"), vec![0u8; 5]).unwrap();

        assert_eq!(calculate_dir_size(&root).unwrap(), 15);
        assert_eq!(calculate_dir_size(&tmp.path().join("missing")).unwrap(), 0);

        remove_dir_contents(&root).unwrap();
        assert!(root.is_dir());
        assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
        remove_dir_contents(&tmp.path().join("missing")).unwrap();
    }

    #[test]
    fn app_handle_cache_and_temp_helpers() {
        let app = crate::test_support::mock_app_in_tempdir();
        let handle = app.handle();
        let cache = get_cache_dir(handle).unwrap();
        let temp = get_temp_dir(handle).unwrap();
        fs::create_dir_all(cache.join("thumbnails")).unwrap();
        fs::create_dir_all(temp.join("job")).unwrap();
        fs::write(cache.join("thumbnails").join("a.jpg"), vec![0u8; 8]).unwrap();
        fs::write(temp.join("job").join("x.tmp"), b"x").unwrap();

        assert_eq!(get_cache_size(handle).unwrap(), 8);
        clear_cache(handle).unwrap();
        assert!(cache.is_dir());
        assert_eq!(get_cache_size(handle).unwrap(), 0);

        cleanup_temp_dir(handle).unwrap();
        assert!(temp.is_dir());
        assert_eq!(fs::read_dir(&temp).unwrap().count(), 0);
    }

    #[test]
    fn sanitize_filename_rules() {
        assert_eq!(sanitize_filename("a<b>c:d"), "a_b_c_d");
        assert_eq!(sanitize_filename("  x\ty  "), "x_y");
        assert_eq!(sanitize_filename(&"z".repeat(300)).len(), 200);
    }
}
