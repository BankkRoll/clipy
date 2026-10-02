//! Settings-related commands
//!
//! Single-key access (`update_setting` / `get_setting`) is implemented
//! generically over the camelCase JSON form of [`AppSettings`]: a key is
//! `"<section>.<field>"` exactly as it appears in the serialized settings, so
//! new fields are supported automatically and type mismatches are rejected by
//! serde instead of being silently coerced.

use crate::error::{ClipyError, Result};
use crate::models::settings::AppSettings;
use crate::services::{config, queue};
use crate::utils::logger::redact_url;
use serde_json::Value;
use tracing::{debug, info, warn};

const MAX_CONCURRENT_KEY: &str = "download.maxConcurrentDownloads";

/// Get application settings
#[tauri::command]
pub fn get_settings() -> Result<AppSettings> {
    config::get_settings()
}

/// Replace all application settings.
#[tauri::command]
pub async fn update_settings(mut settings: AppSettings) -> Result<()> {
    info!("Updating application settings");
    normalize(&mut settings);
    let max = settings.download.max_concurrent_downloads;
    config::update_settings(settings)?;
    apply_live_concurrency(max).await;
    Ok(())
}

/// Reset settings to defaults
#[tauri::command]
pub async fn reset_settings() -> Result<AppSettings> {
    info!("Resetting settings to defaults");
    let settings = config::reset_settings()?;
    apply_live_concurrency(settings.download.max_concurrent_downloads).await;
    Ok(settings)
}

/// Update one setting addressed as `"<section>.<field>"`.
#[tauri::command]
pub async fn update_setting(key: String, value: Value) -> Result<()> {
    debug!(
        "Updating setting: {} = {}",
        key,
        redact_setting_value(&key, &value)
    );
    let mut settings = config::get_settings()?;
    apply_setting(&mut settings, &key, &value)?;
    normalize(&mut settings);
    let max = settings.download.max_concurrent_downloads;
    config::update_settings(settings)?;
    if key == MAX_CONCURRENT_KEY {
        apply_live_concurrency(max).await;
    }
    Ok(())
}

/// Get one setting addressed as `"<section>.<field>"`.
#[tauri::command]
pub fn get_setting(key: String) -> Result<Value> {
    read_setting(&config::get_settings()?, &key)
        .ok_or_else(|| ClipyError::Config(format!("Unknown setting: {}", key)))
}

/// Export settings to JSON
#[tauri::command]
pub fn export_settings() -> Result<String> {
    serde_json::to_string_pretty(&config::get_settings()?)
        .map_err(|e| ClipyError::Config(format!("Failed to serialize settings: {}", e)))
}

/// Import settings from JSON
#[tauri::command]
pub async fn import_settings(json: String) -> Result<()> {
    info!("Importing settings from JSON ({} bytes)", json.len());
    let settings: AppSettings = serde_json::from_str(&json)
        .map_err(|e| ClipyError::Config(format!("Failed to parse settings: {}", e)))?;
    update_settings(settings).await
}

/// Clamp values the backend cannot honor, so the persisted config always
/// matches what is actually applied.
fn normalize(settings: &mut AppSettings) {
    let max = &mut settings.download.max_concurrent_downloads;
    *max = queue::clamp_concurrency(*max);
}

/// Push a concurrency change to the running queue (if any) so it takes
/// effect immediately rather than on next launch.
async fn apply_live_concurrency(max: u32) {
    match queue::get_queue() {
        Ok(q) => {
            q.set_max_concurrent(max).await;
        }
        Err(e) => debug!(
            "Queue not running, concurrency applies on next start: {}",
            e
        ),
    }
}

fn split_key(key: &str) -> Option<(&str, &str)> {
    let (section, field) = key.split_once('.')?;
    (!section.is_empty() && !field.is_empty() && !field.contains('.')).then_some((section, field))
}

/// Read the JSON value of `"<section>.<field>"`, or `None` for unknown keys.
///
/// # Example
/// ```
/// use clipy_lib::commands::settings::read_setting;
/// use clipy_lib::models::settings::AppSettings;
/// let s = AppSettings::default();
/// assert_eq!(read_setting(&s, "general.language"), Some("en".into()));
/// assert_eq!(read_setting(&s, "general.nope"), None);
/// ```
pub fn read_setting(settings: &AppSettings, key: &str) -> Option<Value> {
    let (section, field) = split_key(key)?;
    let json = serde_json::to_value(settings).ok()?;
    json.get(section)?.get(field).cloned()
}

/// Set `"<section>.<field>"` to `value`.
///
/// Fails for unknown keys and for values whose JSON type does not fit the
/// field (e.g. a string for a bool, a negative or fractional number for an
/// integer, or an out-of-range integer) — `settings` is untouched on error.
pub fn apply_setting(settings: &mut AppSettings, key: &str, value: &Value) -> Result<()> {
    let unknown = || ClipyError::Config(format!("Unknown setting: {}", key));
    let (section, field) = split_key(key).ok_or_else(unknown)?;
    let mut json = serde_json::to_value(&*settings)?;
    let slot = json
        .get_mut(section)
        .and_then(|s| s.get_mut(field))
        .ok_or_else(unknown)?;
    *slot = value.clone();
    *settings = serde_json::from_value(json)
        .map_err(|e| ClipyError::Config(format!("Invalid value for {}: {}", key, e)))?;
    Ok(())
}

/// Loggable rendering of a setting value with secrets removed: proxy URLs
/// lose their credentials and anything cookie-related is fully masked.
pub fn redact_setting_value(key: &str, value: &Value) -> String {
    let lower = key.to_ascii_lowercase();
    if lower.contains("cookie") || lower.contains("password") || lower.contains("token") {
        return "<redacted>".into();
    }
    if lower.contains("proxy") {
        return match value.as_str() {
            Some(raw) => format!("\"{}\"", redact_url(raw)),
            None => "<redacted>".into(),
        };
    }
    if value.to_string().len() > 200 {
        warn!("Setting {} has an unusually large value", key);
        return "<large value>".into();
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::config::ConfigStore;
    use crate::services::queue::testing::harness;
    use serde_json::json;
    use std::sync::Arc;

    /// Every `section.field` key in the serialized defaults.
    fn all_keys() -> Vec<String> {
        let json = serde_json::to_value(AppSettings::default()).unwrap();
        let mut keys = Vec::new();
        for (section, fields) in json.as_object().unwrap() {
            for field in fields.as_object().unwrap().keys() {
                keys.push(format!("{section}.{field}"));
            }
        }
        keys
    }

    /// A value of the same JSON type as `v` but different content.
    fn changed(v: &Value) -> Value {
        match v {
            Value::Bool(b) => json!(!b),
            Value::String(s) => json!(format!("{s}-x")),
            Value::Number(n) if n.is_u64() => json!(n.as_u64().unwrap() + 1),
            Value::Number(n) => json!(n.as_f64().unwrap() + 0.25),
            Value::Array(_) => json!(["a", "b"]),
            other => panic!("unexpected setting type {other:?}"),
        }
    }

    /// A value of a different JSON type than `v`.
    fn wrong_type(v: &Value) -> Value {
        match v {
            Value::String(_) => json!(5),
            _ => json!("definitely wrong"),
        }
    }

    #[test]
    fn every_key_round_trips_through_apply_and_read() {
        let keys = all_keys();
        assert!(keys.len() > 50, "only {} keys found", keys.len());
        for key in keys {
            let mut settings = AppSettings::default();
            let original = read_setting(&settings, &key).expect(&key);
            let next = changed(&original);
            apply_setting(&mut settings, &key, &next).unwrap_or_else(|e| panic!("{key}: {e}"));
            assert_eq!(read_setting(&settings, &key), Some(next), "{key}");

            let before = serde_json::to_value(&settings).unwrap();
            let err = apply_setting(&mut settings, &key, &wrong_type(&original));
            assert!(err.is_err(), "{key} accepted a wrong type");
            assert_eq!(serde_json::to_value(&settings).unwrap(), before, "{key}");
        }
    }

    #[test]
    fn integers_are_not_truncated_or_coerced() {
        let mut s = AppSettings::default();
        for bad in [json!(-1), json!(2.5), json!(u64::from(u32::MAX) + 1)] {
            assert!(
                apply_setting(&mut s, MAX_CONCURRENT_KEY, &bad).is_err(),
                "{bad}"
            );
        }
        assert_eq!(s.download.max_concurrent_downloads, 3);
        apply_setting(&mut s, "editor.defaultTransitionDuration", &json!(2)).unwrap();
        assert_eq!(s.editor.default_transition_duration, 2.0);
        assert!(
            apply_setting(&mut s, "download.sponsorBlockCategories", &json!(["ok", 1])).is_err()
        );
    }

    #[test]
    fn unknown_and_malformed_keys_are_rejected() {
        let mut s = AppSettings::default();
        for key in [
            "general",
            "general.",
            ".language",
            "general.nope",
            "nope.language",
            "general.language.extra",
            "",
        ] {
            let err = apply_setting(&mut s, key, &json!("x")).unwrap_err();
            assert!(err.to_string().contains("Unknown setting"), "{key}");
            assert_eq!(read_setting(&s, key), None, "{key}");
        }
    }

    #[test]
    fn secrets_are_redacted_for_logging() {
        let proxy = json!("http://user:hunter2@proxy.example:3128");
        let shown = redact_setting_value("advanced.proxyUrl", &proxy);
        assert!(!shown.contains("hunter2") && !shown.contains("user"));
        assert!(shown.contains("proxy.example:3128"));
        assert_eq!(
            redact_setting_value("advanced.proxyUrl", &json!(null)),
            "<redacted>"
        );
        assert_eq!(
            redact_setting_value("download.cookiesFromBrowser", &json!("firefox:profile")),
            "<redacted>"
        );
        assert_eq!(
            redact_setting_value("general.language", &json!("en")),
            "\"en\""
        );
        assert_eq!(
            redact_setting_value("download.filenameTemplate", &json!("x".repeat(500))),
            "<large value>"
        );
    }

    #[tokio::test]
    async fn commands_persist_and_push_concurrency_to_queue() {
        let _g = crate::test_support::lock_globals_async().await;
        let tmp = tempfile::tempdir().unwrap();
        let store = Arc::new(ConfigStore::load(tmp.path().join("config.json")).unwrap());
        config::install(store.clone());
        let h = harness(3);
        queue::install_queue(h.queue.clone());

        update_setting(MAX_CONCURRENT_KEY.into(), json!(0))
            .await
            .unwrap();
        assert_eq!(get_setting(MAX_CONCURRENT_KEY.into()).unwrap(), json!(1));
        assert_eq!(h.queue.max_concurrent().await, 1);

        update_setting("appearance.theme".into(), json!("dark"))
            .await
            .unwrap();
        assert_eq!(get_settings().unwrap().appearance.theme, "dark");
        assert!(update_setting("appearance.theme".into(), json!(1))
            .await
            .is_err());
        assert!(get_setting("nope.nope".into()).is_err());

        let mut s = get_settings().unwrap();
        s.download.max_concurrent_downloads = 50;
        update_settings(s).await.unwrap();
        assert_eq!(h.queue.max_concurrent().await, 10);

        let exported = export_settings().unwrap();
        let reset = reset_settings().await.unwrap();
        assert_eq!(reset.appearance.theme, "system");
        assert_eq!(h.queue.max_concurrent().await, 3);

        import_settings(exported).await.unwrap();
        assert_eq!(get_settings().unwrap().appearance.theme, "dark");
        assert!(import_settings("{".into()).await.is_err());

        let reloaded = ConfigStore::load(store.path()).unwrap();
        assert_eq!(reloaded.get().appearance.theme, "dark");
    }

    #[tokio::test]
    async fn concurrency_push_without_queue_is_harmless() {
        let _g = crate::test_support::lock_globals_async().await;
        apply_live_concurrency(2).await;
    }
}
