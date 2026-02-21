//! Logging configuration for Clipy

use std::path::PathBuf;
use tracing_appender::rolling::{RollingFileAppender, Rotation};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

/// ASCII banner for Clipy
const ASCII_BANNER: &str = r#"
   ██████╗██╗     ██╗██████╗ ██╗   ██╗
  ██╔════╝██║     ██║██╔══██╗╚██╗ ██╔╝
  ██║     ██║     ██║██████╔╝ ╚████╔╝
  ██║     ██║     ██║██╔═══╝   ╚██╔╝
  ╚██████╗███████╗██║██║        ██║
   ╚═════╝╚══════╝╚═╝╚═╝        ╚═╝
"#;

/// Initialize the logging system
///
/// # Arguments
/// * `debug_mode` - If true, uses debug level logging; otherwise uses info level
pub fn init_logging(debug_mode: bool) {
    // Get log directory
    let log_dir = get_log_dir();

    // Ensure log directory exists
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        eprintln!("Warning: Failed to create log directory: {}", e);
    }

    // Create rolling file appender (daily rotation, keep 7 days)
    let file_appender = RollingFileAppender::new(Rotation::DAILY, &log_dir, "clipy.log");

    // Create a non-blocking writer
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Configure the filter based on debug mode
    let log_level = if debug_mode {
        "debug,clipy_lib=trace"  // Verbose when debug enabled
    } else {
        "info,clipy_lib=info"    // Minimal when debug disabled
    };

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(log_level));

    // Build the subscriber with both console and file output
    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(
            fmt::layer()
                .with_target(true)
                .with_thread_ids(false)
                .with_file(true)
                .with_line_number(true),
        )
        .with(fmt::layer().with_writer(non_blocking).with_ansi(false));

    // Set the global subscriber
    tracing::subscriber::set_global_default(subscriber)
        .expect("Failed to set global tracing subscriber");

    // Keep the guard alive for the lifetime of the application
    std::mem::forget(_guard);
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

/// Read debug_mode from config file before full app initialization
/// Returns the debug_mode value or false if config can't be read
pub fn read_debug_mode_from_config() -> bool {
    let config_path = get_config_path();

    if !config_path.exists() {
        return false;
    }

    match std::fs::read_to_string(&config_path) {
        Ok(content) => {
            // Parse as JSON and extract advanced.debugMode
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(debug_mode) = json
                    .get("advanced")
                    .and_then(|adv| adv.get("debugMode"))
                    .and_then(|v| v.as_bool())
                {
                    return debug_mode;
                }
            }
            false
        }
        Err(_) => false,
    }
}

/// Get the log directory path
fn get_log_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Clipy")
        .join("logs")
}

/// Get the config file path
/// Uses the same path as Tauri's app_data_dir (AppData\Roaming\{identifier})
fn get_config_path() -> PathBuf {
    // Tauri uses config_dir (AppData\Roaming on Windows) + identifier
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("com.clipy.app")
        .join("config.json")
}
