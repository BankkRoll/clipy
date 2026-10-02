//! Configuration service for managing app settings
//!
//! Responsibilities:
//! - [`ConfigStore`]: settings bound to one JSON file, loaded once and kept in
//!   memory; every update is persisted with an atomic temp-file + rename.
//! - Corrupt-file recovery: an unparseable config is moved aside to
//!   `config.json.bak-<timestamp>` before falling back to defaults, so a user's
//!   hand-edited file is never silently destroyed.
//! - Process-wide accessors (`init_config`, `get_settings`, ...) as thin
//!   wrappers over one installed store.

use crate::error::{ClipyError, Result};
use crate::models::settings::AppSettings;
use crate::utils::paths;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tauri::{AppHandle, Runtime};
use tracing::{debug, info, warn};

/// App settings bound to a JSON file on disk.
pub struct ConfigStore {
    path: PathBuf,
    settings: RwLock<AppSettings>,
}

impl ConfigStore {
    /// Load settings from `path`.
    ///
    /// - Missing file: defaults are written to `path`.
    /// - Unparseable file: it is renamed to `<path>.bak-<timestamp>`, a warning
    ///   is logged, and defaults are written in its place.
    /// - Unreadable file (permissions, I/O): returned as an error.
    pub fn load(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let settings = if path.exists() {
            debug!("Loading existing config from {:?}", path);
            let content = fs::read_to_string(&path)
                .map_err(|e| ClipyError::Config(format!("Failed to read config: {}", e)))?;
            match serde_json::from_str::<AppSettings>(&content) {
                Ok(settings) => settings,
                Err(e) => {
                    let backup = backup_corrupt_file(&path)?;
                    warn!(
                        "Config at {:?} could not be parsed ({}); moved to {:?} and using defaults",
                        path, e, backup
                    );
                    let settings = AppSettings::default();
                    write_settings(&path, &settings)?;
                    settings
                }
            }
        } else {
            debug!("Creating default config at {:?}", path);
            let settings = AppSettings::default();
            write_settings(&path, &settings)?;
            settings
        };

        Ok(Self {
            path,
            settings: RwLock::new(settings),
        })
    }

    /// The file this store persists to.
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// A snapshot of the current settings.
    pub fn get(&self) -> AppSettings {
        self.settings
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Persist `settings` and make them current. On write failure the
    /// in-memory settings are left unchanged.
    pub fn update(&self, settings: AppSettings) -> Result<()> {
        write_settings(&self.path, &settings)?;
        *self.settings.write().unwrap_or_else(|e| e.into_inner()) = settings;
        Ok(())
    }

    /// Restore and persist defaults, returning them.
    pub fn reset(&self) -> Result<AppSettings> {
        let settings = AppSettings::default();
        self.update(settings.clone())?;
        Ok(settings)
    }
}

/// Move a corrupt config aside and return the backup path.
fn backup_corrupt_file(path: &Path) -> Result<PathBuf> {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S%.3f");
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".bak-{}", stamp));
    let backup = path.with_file_name(name);
    fs::rename(path, &backup)
        .map_err(|e| ClipyError::Config(format!("Failed to back up corrupt config: {}", e)))?;
    Ok(backup)
}

fn write_settings(path: &Path, settings: &AppSettings) -> Result<()> {
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| ClipyError::Config(format!("Failed to serialize config: {}", e)))?;
    write_atomic(path, content.as_bytes())
        .map_err(|e| ClipyError::Config(format!("Failed to write config: {}", e)))?;
    debug!("Config saved to {:?}", path);
    Ok(())
}

/// Write `bytes` to `path` so readers see either the old or the new file,
/// never a truncated one (crash or power loss mid-write).
///
/// The temp file lives in the destination directory because a rename is only
/// atomic within one filesystem.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

static CONFIG: RwLock<Option<Arc<ConfigStore>>> = RwLock::new(None);

/// Load the app's config file and install it as the process-wide store.
pub fn init_config<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
    info!("Initializing configuration");
    let store = ConfigStore::load(paths::get_config_path(app)?)?;
    install(Arc::new(store));
    info!("Configuration initialized successfully");
    Ok(())
}

/// Replace the process-wide config store.
pub fn install(store: Arc<ConfigStore>) {
    *CONFIG.write().unwrap_or_else(|e| e.into_inner()) = Some(store);
}

/// The process-wide store, or an error before [`init_config`] ran.
pub fn store() -> Result<Arc<ConfigStore>> {
    CONFIG
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
        .ok_or_else(|| ClipyError::Config("Config not initialized".into()))
}

/// Get current settings
pub fn get_settings() -> Result<AppSettings> {
    Ok(store()?.get())
}

/// Persist and apply new settings.
pub fn update_settings(settings: AppSettings) -> Result<()> {
    store()?.update(settings)
}

/// Reset settings to defaults
pub fn reset_settings() -> Result<AppSettings> {
    store()?.reset()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn backups_in(dir: &Path) -> Vec<PathBuf> {
        fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().path())
            .filter(|p| p.to_string_lossy().contains(".bak-"))
            .collect()
    }

    #[test]
    fn missing_file_is_created_with_defaults() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("nested").join("config.json");
        let store = ConfigStore::load(&path).unwrap();
        assert_eq!(store.path(), path);
        assert!(path.exists());
        let on_disk: AppSettings =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(
            on_disk.download.max_concurrent_downloads,
            store.get().download.max_concurrent_downloads
        );
    }

    #[test]
    fn update_round_trips_through_disk() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.json");
        let store = ConfigStore::load(&path).unwrap();
        let mut settings = store.get();
        settings.appearance.theme = "dark".into();
        settings.download.max_concurrent_downloads = 7;
        store.update(settings).unwrap();
        assert_eq!(store.get().appearance.theme, "dark");

        let reloaded = ConfigStore::load(&path).unwrap();
        assert_eq!(reloaded.get().appearance.theme, "dark");
        assert_eq!(reloaded.get().download.max_concurrent_downloads, 7);
        assert!(backups_in(tmp.path()).is_empty());

        let defaults = reloaded.reset().unwrap();
        assert_eq!(defaults.appearance.theme, "system");
        assert_eq!(
            ConfigStore::load(&path).unwrap().get().appearance.theme,
            "system"
        );
    }

    #[test]
    fn corrupt_file_is_backed_up_not_discarded() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.json");
        fs::write(&path, "{ not json").unwrap();

        let store = ConfigStore::load(&path).unwrap();
        assert_eq!(store.get().appearance.theme, "system");

        let backups = backups_in(tmp.path());
        assert_eq!(backups.len(), 1);
        assert_eq!(fs::read_to_string(&backups[0]).unwrap(), "{ not json");
        assert!(backups[0]
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("config.json.bak-"));
        serde_json::from_str::<AppSettings>(&fs::read_to_string(&path).unwrap()).unwrap();
    }

    #[test]
    fn unreadable_config_is_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.json");
        fs::create_dir(&path).unwrap();
        let err = ConfigStore::load(&path).err().unwrap();
        assert!(err.to_string().contains("Failed to read config"));
    }

    #[test]
    fn failed_write_keeps_previous_settings() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.json");
        let store = ConfigStore::load(&path).unwrap();
        fs::remove_file(&path).unwrap();
        fs::create_dir(&path).unwrap();

        let mut settings = store.get();
        settings.appearance.theme = "dark".into();
        assert!(store.update(settings).is_err());
        assert_eq!(store.get().appearance.theme, "system");
    }

    #[test]
    fn write_atomic_replaces_whole_file_and_leaves_no_temp() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("f.json");
        write_atomic(&path, b"a much longer first version").unwrap();
        write_atomic(&path, b"short").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "short");
        assert_eq!(fs::read_dir(tmp.path()).unwrap().count(), 1);
    }

    #[test]
    fn global_accessors_use_installed_store() {
        let _guard = crate::test_support::lock_globals();
        let app = crate::test_support::mock_app_in_tempdir();
        crate::utils::paths::ensure_dirs(&[paths::get_app_data_dir(app.handle()).unwrap()])
            .unwrap();
        init_config(app.handle()).unwrap();
        assert!(paths::get_config_path(app.handle()).unwrap().exists());

        let mut settings = get_settings().unwrap();
        settings.general.language = "fr".into();
        update_settings(settings).unwrap();
        assert_eq!(get_settings().unwrap().general.language, "fr");
        assert_eq!(reset_settings().unwrap().general.language, "en");
        assert_eq!(store().unwrap().get().general.language, "en");
    }
}
