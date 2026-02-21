//! Configuration service for managing app settings

use crate::error::{ClipyError, Result};
use crate::models::settings::AppSettings;
use crate::utils::paths;
use std::fs;
use std::sync::RwLock;
use tauri::AppHandle;
use tracing::{debug, info, warn};

/// Global config state
static CONFIG: RwLock<Option<AppSettings>> = RwLock::new(None);

/// Initialize configuration
pub fn init_config(app: &AppHandle) -> Result<()> {
    info!("Initializing configuration");

    let config_path = paths::get_config_path(app)?;

    let settings = if config_path.exists() {
        debug!("Loading existing config from {:?}", config_path);
        let content = fs::read_to_string(&config_path)
            .map_err(|e| ClipyError::Config(format!("Failed to read config: {}", e)))?;

        serde_json::from_str(&content).unwrap_or_else(|e| {
            warn!("Failed to parse config, using defaults: {}", e);
            AppSettings::default()
        })
    } else {
        debug!("Creating default config");
        let settings = AppSettings::default();
        save_config_internal(app, &settings)?;
        settings
    };

    let mut config = CONFIG.write().map_err(|_| ClipyError::Config("Config lock poisoned".into()))?;
    *config = Some(settings);

    info!("Configuration initialized successfully");
    Ok(())
}

/// Get current settings
pub fn get_settings() -> Result<AppSettings> {
    let config = CONFIG.read().map_err(|_| ClipyError::Config("Config lock poisoned".into()))?;
    config.clone().ok_or_else(|| ClipyError::Config("Config not initialized".into()))
}

/// Update settings
pub fn update_settings(app: &AppHandle, settings: AppSettings) -> Result<()> {
    save_config_internal(app, &settings)?;

    let mut config = CONFIG.write().map_err(|_| ClipyError::Config("Config lock poisoned".into()))?;
    *config = Some(settings);

    Ok(())
}

/// Save config to disk
fn save_config_internal(app: &AppHandle, settings: &AppSettings) -> Result<()> {
    let config_path = paths::get_config_path(app)?;

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| ClipyError::Config(format!("Failed to serialize config: {}", e)))?;

    fs::write(&config_path, content)
        .map_err(|e| ClipyError::Config(format!("Failed to write config: {}", e)))?;

    debug!("Config saved to {:?}", config_path);
    Ok(())
}

/// Reset settings to defaults
pub fn reset_settings(app: &AppHandle) -> Result<AppSettings> {
    let settings = AppSettings::default();
    update_settings(app, settings.clone())?;
    Ok(settings)
}
