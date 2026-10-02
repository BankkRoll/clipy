//! Logging configuration for Clipy
//!
//! Responsibilities:
//! - Install the global `tracing` subscriber (console + daily rolling file),
//!   idempotently.
//! - Prune rolled log files older than [`LOG_RETENTION_DAYS`] at startup.
//! - Read `advanced.debugMode` from the config file before Tauri (and its path
//!   resolver) exists.
//! - [`redact_url`]: strip credentials and query strings from URLs before they
//!   reach a log.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tracing_appender::non_blocking::WorkerGuard;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// Bundle identifier from `tauri.conf.json`; Tauri's `app_data_dir()` is
/// `dirs::data_dir()/<identifier>`.
const APP_IDENTIFIER: &str = "com.clipy.app";

/// Base name of the log file; the daily appender writes `clipy.log.YYYY-MM-DD`.
const LOG_FILE_PREFIX: &str = "clipy.log";

/// Rolled log files older than this many days are deleted at startup.
pub const LOG_RETENTION_DAYS: u64 = 7;

const ASCII_BANNER: &str = r#"
   ██████╗██╗     ██╗██████╗ ██╗   ██╗
  ██╔════╝██║     ██║██╔══██╗╚██╗ ██╔╝
  ██║     ██║     ██║██████╔╝ ╚████╔╝
  ██║     ██║     ██║██╔═══╝   ╚██╔╝
  ╚██████╗███████╗██║██║        ██║
   ╚═════╝╚══════╝╚═╝╚═╝        ╚═╝
"#;

/// Keeps the non-blocking writer's flush guard alive for the process lifetime
/// and marks logging as initialised.
static LOG_GUARD: OnceLock<Option<WorkerGuard>> = OnceLock::new();

/// Initialize the logging system in the default log directory.
///
/// Safe to call more than once: only the first call installs a subscriber.
/// Returns `true` if this call installed it.
pub fn init_logging(debug_mode: bool) -> bool {
    init_logging_in(&get_log_dir(), debug_mode)
}

/// Like [`init_logging`] but writing log files to `log_dir`.
pub fn init_logging_in(log_dir: &Path, debug_mode: bool) -> bool {
    let mut installed = false;
    LOG_GUARD.get_or_init(|| {
        if let Err(e) = std::fs::create_dir_all(log_dir) {
            eprintln!("Warning: Failed to create log directory: {}", e);
        }
        let pruned = prune_old_logs(
            log_dir,
            Duration::from_secs(LOG_RETENTION_DAYS * 86_400),
            SystemTime::now(),
        );

        let file_appender = RollingFileAppender::new(Rotation::DAILY, log_dir, LOG_FILE_PREFIX);
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);

        let env_filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new(filter_directive(debug_mode)));

        let console = fmt::layer()
            .with_target(true)
            .with_thread_ids(false)
            .with_file(true)
            .with_line_number(true);
        // Route console output through libtest's capture so the logger test
        // doesn't flood every other test's output.
        #[cfg(test)]
        let console = console.with_test_writer();

        let result = tracing_subscriber::registry()
            .with(env_filter)
            .with(console)
            .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
            .try_init();

        match result {
            Ok(()) => {
                installed = true;
                if pruned > 0 {
                    tracing::info!("Pruned {} old log file(s)", pruned);
                }
                Some(guard)
            }
            Err(e) => {
                eprintln!("Warning: a tracing subscriber is already installed: {}", e);
                None
            }
        }
    });
    installed
}

/// Default `EnvFilter` directive for the given debug mode.
pub fn filter_directive(debug_mode: bool) -> &'static str {
    if debug_mode {
        "debug,clipy_lib=trace"
    } else {
        "info,clipy_lib=info"
    }
}

/// Delete rolled `clipy.log.*` files in `dir` older than `max_age` relative to
/// `now`, returning how many were removed.
///
/// Age comes from the `YYYY-MM-DD` suffix the daily appender writes; files
/// without a parseable date fall back to their modification time. Unrelated
/// files and the bare `clipy.log` are never touched.
pub fn prune_old_logs(dir: &Path, max_age: Duration, now: SystemTime) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let prefix = format!("{}.", LOG_FILE_PREFIX);
    let mut removed = 0;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some(suffix) = name.strip_prefix(&prefix) else {
            continue;
        };
        let stamp = parse_log_date(suffix).or_else(|| entry.metadata().ok()?.modified().ok());
        let expired = stamp
            .and_then(|t| now.duration_since(t).ok())
            .is_some_and(|age| age > max_age);
        if expired && std::fs::remove_file(entry.path()).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Midnight UTC of a `YYYY-MM-DD` suffix (the appender may append further
/// segments, e.g. `2024-01-02.1`).
fn parse_log_date(suffix: &str) -> Option<SystemTime> {
    let date = chrono::NaiveDate::parse_from_str(suffix.get(..10)?, "%Y-%m-%d").ok()?;
    let secs = date.and_hms_opt(0, 0, 0)?.and_utc().timestamp();
    Some(SystemTime::UNIX_EPOCH + Duration::from_secs(u64::try_from(secs).ok()?))
}

/// Print the startup banner to console
pub fn print_banner(version: &str, debug_mode: bool) {
    println!("{}", ASCII_BANNER);
    println!("  Version: {}", version);
    println!("  Platform: {}", std::env::consts::OS);
    println!("  Debug Mode: {}", if debug_mode { "ON" } else { "OFF" });
    println!();

    if debug_mode {
        println!("  [Clipy] Debug mode is enabled - verbose logging active");
        println!();
    }
}

/// Read `advanced.debugMode` from the config file before full app
/// initialization. Returns `false` if the file is missing or unreadable.
pub fn read_debug_mode_from_config() -> bool {
    get_config_path().is_some_and(|p| read_debug_mode_from(&p))
}

/// Read `advanced.debugMode` from the config JSON at `path`.
pub fn read_debug_mode_from(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|json| json.get("advanced")?.get("debugMode")?.as_bool())
        .unwrap_or(false)
}

fn get_log_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Clipy")
        .join("logs")
}

/// Config path matching `paths::get_config_path`, resolved without an
/// `AppHandle`.
///
/// NOTE: must mirror Tauri's `app_data_dir()`, which is built on
/// `dirs::data_dir()` — *not* `config_dir()`. They coincide on Windows
/// (`%APPDATA%`) and macOS (`~/Library/Application Support`) but differ on
/// Linux (`~/.local/share` vs `~/.config`), which previously made debug mode
/// unreadable there.
fn get_config_path() -> Option<PathBuf> {
    Some(config_path_under(&dirs::data_dir()?))
}

fn config_path_under(data_dir: &Path) -> PathBuf {
    data_dir.join(APP_IDENTIFIER).join("config.json")
}

/// Render `raw` as `scheme://host[:port]/path` for logging: credentials,
/// query string and fragment are dropped because they routinely carry
/// secrets (proxy passwords, signed tokens, session ids).
///
/// Unparseable input is replaced entirely rather than echoed.
///
/// # Example
/// ```
/// use clipy_lib::utils::logger::redact_url;
/// assert_eq!(
///     redact_url("http://user:pw@proxy.local:8080/x?token=1"),
///     "http://proxy.local:8080/x"
/// );
/// ```
pub fn redact_url(raw: &str) -> String {
    match url::Url::parse(raw) {
        Ok(url) if url.has_host() => {
            let port = url.port().map(|p| format!(":{p}")).unwrap_or_default();
            format!(
                "{}://{}{}{}",
                url.scheme(),
                url.host_str().unwrap_or_default(),
                port,
                url.path()
            )
        }
        _ if raw.is_empty() => String::new(),
        _ => "<unparseable url>".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use filetime::{set_file_mtime, FileTime};

    const DAY: u64 = 86_400;

    fn at(date: &str) -> SystemTime {
        parse_log_date(date).unwrap()
    }

    #[test]
    fn config_path_uses_data_dir_like_tauri() {
        let expected = dirs::data_dir()
            .unwrap()
            .join("com.clipy.app")
            .join("config.json");
        assert_eq!(get_config_path().unwrap(), expected);
        assert_eq!(config_path_under(Path::new("base")), {
            Path::new("base").join("com.clipy.app").join("config.json")
        });
    }

    #[test]
    fn config_path_matches_tauri_app_data_dir_for_identifier() {
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        context.config_mut().identifier = APP_IDENTIFIER.into();
        let app = tauri::test::mock_builder().build(context).unwrap();
        assert_eq!(
            crate::utils::paths::get_config_path(app.handle()).unwrap(),
            get_config_path().unwrap()
        );
    }

    #[test]
    fn debug_mode_is_read_from_config_json() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("config.json");
        assert!(!read_debug_mode_from(&path));

        std::fs::write(&path, r#"{"advanced":{"debugMode":true}}"#).unwrap();
        assert!(read_debug_mode_from(&path));

        std::fs::write(&path, r#"{"advanced":{"debugMode":"yes"}}"#).unwrap();
        assert!(!read_debug_mode_from(&path));

        std::fs::write(&path, r#"{"general":{}}"#).unwrap();
        assert!(!read_debug_mode_from(&path));

        std::fs::write(&path, "garbage").unwrap();
        assert!(!read_debug_mode_from(&path));

        let _ = read_debug_mode_from_config();
    }

    #[test]
    fn prune_removes_only_expired_rolled_logs() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        for name in [
            "clipy.log.2024-01-01",
            "clipy.log.2024-01-05",
            "clipy.log.2024-01-09",
            "clipy.log.2024-01-02.1",
            "clipy.log",
            "other.log.2020-01-01",
            "clipy.log.nodate",
            "clipy.log.fresh-nodate",
        ] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        let now = at("2024-01-10");
        set_file_mtime(
            dir.join("clipy.log.nodate"),
            FileTime::from_system_time(now - Duration::from_secs(30 * DAY)),
        )
        .unwrap();
        set_file_mtime(
            dir.join("clipy.log.fresh-nodate"),
            FileTime::from_system_time(now - Duration::from_secs(DAY)),
        )
        .unwrap();

        let removed = prune_old_logs(dir, Duration::from_secs(7 * DAY), now);
        assert_eq!(removed, 3);

        let mut left: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            [
                "clipy.log",
                "clipy.log.2024-01-05",
                "clipy.log.2024-01-09",
                "clipy.log.fresh-nodate",
                "other.log.2020-01-01",
            ]
        );
    }

    #[test]
    fn prune_on_missing_dir_is_noop() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(
            prune_old_logs(&tmp.path().join("nope"), Duration::ZERO, SystemTime::now()),
            0
        );
    }

    #[test]
    fn log_date_parsing() {
        assert_eq!(
            parse_log_date("1970-01-02"),
            Some(SystemTime::UNIX_EPOCH + Duration::from_secs(DAY))
        );
        assert!(parse_log_date("2024-13-01").is_none());
        assert!(parse_log_date("short").is_none());
        assert!(parse_log_date("1960-01-01").is_none());
    }

    #[test]
    fn filter_directive_depends_on_debug_mode() {
        assert!(filter_directive(true).contains("trace"));
        assert!(!filter_directive(false).contains("trace"));
    }

    #[test]
    fn init_logging_is_idempotent() {
        let dir = tempfile::tempdir().unwrap().keep();
        let first = init_logging_in(&dir, false);
        assert!(!init_logging_in(&dir, true));
        assert!(!init_logging(false));
        if first {
            tracing::info!("logger test line");
            assert!(dir.is_dir());
        }
    }

    #[test]
    fn banner_prints_without_panicking() {
        print_banner("1.2.3", true);
        print_banner("1.2.3", false);
    }

    #[test]
    fn redact_url_strips_secrets() {
        assert_eq!(
            redact_url("https://www.youtube.com/watch?v=abc&list=x#t=1"),
            "https://www.youtube.com/watch"
        );
        assert_eq!(
            redact_url("socks5://alice:s3cret@10.0.0.1:1080"),
            "socks5://10.0.0.1:1080"
        );
        assert_eq!(redact_url("http://proxy:8080"), "http://proxy:8080/");
        assert_eq!(redact_url("not a url"), "<unparseable url>");
        assert_eq!(redact_url("mailto:a@b.c"), "<unparseable url>");
        assert_eq!(redact_url(""), "");
    }
}
