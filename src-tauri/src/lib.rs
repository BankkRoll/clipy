//! Clipy - YouTube Video Downloader and Editor
//!
//! This is the main library for the Clipy Tauri application.
//! It provides all the backend functionality for downloading and editing videos.
//!
//! Lifecycle responsibilities owned here:
//! - startup (`setup`): directories, database, config, process registry, tray,
//!   download queue, and the optional start-hidden behaviour;
//! - close-to-tray handling for the main window;
//! - a single shutdown path ([`shutdown_background_work`]) run on every
//!   `RunEvent::ExitRequested`/`Exit`, so quitting from the window, the tray or
//!   the OS never orphans yt-dlp/ffmpeg child processes.

// These two lints are stylistic and intentionally allowed crate-wide so the CI
// `clippy -D warnings` gate stays green:
// - `ptr_arg`: several binary/path helpers take `&PathBuf` by established
//   convention in this crate; converting to `&Path` is churn with no behavior
//   change.
// - `too_many_arguments`: a couple of internal progress/builder helpers take
//   many small fields by value for clarity at the call sites.
#![allow(clippy::ptr_arg)]
#![allow(clippy::too_many_arguments)]

pub mod commands;
pub mod error;
pub mod media_protocol;
pub mod models;
pub mod services;
pub mod utils;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{Manager, RunEvent};
use tracing::{info, warn};

/// Upper bound on how long quitting waits for downloads to stop.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(15);

/// Whether the system tray was created successfully.
static TRAY_READY: AtomicBool = AtomicBool::new(false);
/// Set once the shutdown path has started, so it runs at most once.
static SHUTDOWN_STARTED: AtomicBool = AtomicBool::new(false);

/// What to do when the user closes the main window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloseAction {
    /// Hide the window and keep running in the tray.
    HideToTray,
    /// Let the window close (which exits the app).
    Close,
}

/// Decide how to handle a main-window close request.
///
/// Hiding is only safe when a tray icon exists; otherwise the app would keep
/// running with no way to bring it back.
pub fn close_action(close_to_tray: bool, tray_available: bool) -> CloseAction {
    if close_to_tray && tray_available {
        CloseAction::HideToTray
    } else {
        CloseAction::Close
    }
}

/// Whether to hide the main window at launch ("start minimized"). Same tray
/// requirement as [`close_action`].
pub fn should_start_hidden(minimize_to_tray: bool, tray_available: bool) -> bool {
    minimize_to_tray && tray_available
}

/// Whether `event` means the app is about to exit.
pub fn is_exit_event(event: &RunEvent) -> bool {
    matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit)
}

/// Stop all background work: cancel a running export and shut the download
/// queue down (killing yt-dlp processes), waiting at most `timeout`.
///
/// Must be called from outside an async runtime (it blocks).
pub fn stop_background_work(
    queue: Option<Arc<services::queue::DownloadQueue>>,
    cancel_export: impl FnOnce(),
    timeout: Duration,
) {
    cancel_export();
    if let Some(queue) = queue {
        let finished = tauri::async_runtime::block_on(async move {
            tokio::time::timeout(timeout, queue.shutdown()).await
        });
        if finished.is_err() {
            warn!("Download queue did not shut down within {:?}", timeout);
        }
    }
}

/// Run the app-wide shutdown path once. Returns `false` if it already ran.
pub fn shutdown_background_work() -> bool {
    if SHUTDOWN_STARTED.swap(true, Ordering::SeqCst) {
        return false;
    }
    info!("Stopping background work before exit");
    stop_background_work(
        services::queue::get_queue().ok(),
        services::ffmpeg::request_export_cancel,
        SHUTDOWN_TIMEOUT,
    );
    true
}

fn setup(app: &mut tauri::App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    let app_handle = app.handle().clone();
    utils::paths::ensure_app_dirs(&app_handle)?;
    services::database::init_database(&app_handle)?;
    services::config::init_config(&app_handle)?;
    services::process_registry::init_registry();

    let tray_ok = match utils::tray::setup_tray(&app_handle) {
        Ok(_) => true,
        Err(e) => {
            warn!("Failed to set up system tray: {}", e);
            false
        }
    };
    TRAY_READY.store(tray_ok, Ordering::SeqCst);

    let settings = services::config::get_settings()?;
    services::queue::init_queue(
        app_handle.clone(),
        settings.download.max_concurrent_downloads,
    );

    match services::binary::check_binaries(&app_handle) {
        Ok(status) if !status.ffmpeg_installed || !status.ytdlp_installed => {
            info!("Some binaries not found, will prompt for download on first use");
        }
        Ok(_) => {}
        Err(e) => info!("Failed to check binaries: {}", e),
    }

    if let Some(win) = app.get_webview_window("main") {
        if should_start_hidden(settings.general.minimize_to_tray, tray_ok) {
            let _ = win.hide();
        } else {
            if settings.general.minimize_to_tray {
                warn!("Start-minimized requested but no tray is available; showing window");
            }
            let _ = win.show();
        }
    }

    info!("Clipy initialized successfully");
    Ok(())
}

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_mode = utils::logger::read_debug_mode_from_config();
    utils::logger::init_logging(debug_mode);
    utils::logger::print_banner(env!("CARGO_PKG_VERSION"), debug_mode);
    info!("Starting Clipy v{}", env!("CARGO_PKG_VERSION"));

    let app = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(media_protocol::SCHEME, media_protocol::handle)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        // TODO: Enable updater plugin when update server is configured
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(setup)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = services::config::get_settings()
                    .map(|s| s.general.close_to_tray)
                    .unwrap_or(false);
                if close_action(close_to_tray, TRAY_READY.load(Ordering::SeqCst))
                    == CloseAction::HideToTray
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            // System commands
            commands::system::get_system_info,
            commands::system::check_binaries,
            commands::system::install_ffmpeg,
            commands::system::install_ytdlp,
            commands::system::update_ytdlp,
            commands::system::get_cache_stats,
            commands::system::clear_cache,
            commands::system::clear_temp,
            commands::system::open_folder,
            commands::system::open_file,
            commands::system::show_in_folder,
            commands::system::get_default_download_path,
            commands::system::media_url,
            commands::system::is_admin,
            // Download commands
            commands::download::fetch_video_info,
            commands::download::get_available_qualities,
            commands::download::start_download,
            commands::download::pause_download,
            commands::download::resume_download,
            commands::download::cancel_download,
            commands::download::get_downloads,
            commands::download::get_active_downloads,
            commands::download::clear_completed_downloads,
            commands::download::retry_download,
            commands::download::set_max_concurrent_downloads,
            commands::download::validate_url,
            commands::download::extract_video_id,
            // Library commands
            commands::library::get_library_videos,
            commands::library::add_library_video,
            commands::library::delete_library_video,
            commands::library::search_library,
            commands::library::import_video,
            commands::library::check_video_exists,
            commands::library::get_video_file_size,
            commands::library::rename_library_video,
            commands::library::get_library_stats,
            commands::library::bulk_delete_library_videos,
            commands::library::export_library_json,
            commands::library::export_library_to_file,
            // Editor commands
            commands::editor::get_video_metadata,
            commands::editor::generate_thumbnail,
            commands::editor::generate_timeline_thumbnails,
            commands::editor::extract_waveform,
            commands::editor::export_project,
            commands::editor::cancel_export,
            commands::editor::get_export_status,
            commands::editor::save_project,
            commands::editor::load_project,
            commands::editor::create_project,
            commands::editor::transcode_for_editing,
            commands::editor::get_export_formats,
            commands::editor::get_export_resolutions,
            commands::editor::generate_captions,
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::reset_settings,
            commands::settings::update_setting,
            commands::settings::get_setting,
            commands::settings::export_settings,
            commands::settings::import_settings,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, event| {
        if is_exit_event(&event) {
            shutdown_background_work();
        }
    });
}

#[cfg(test)]
pub(crate) mod test_support {
    //! Shared helpers for unit tests that touch process-wide state.

    use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};

    static GLOBALS: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    /// Serialize sync tests that install global singletons (config, database,
    /// queue).
    pub fn lock_globals() -> tokio::sync::MutexGuard<'static, ()> {
        GLOBALS.blocking_lock()
    }

    /// Async variant of [`lock_globals`].
    pub async fn lock_globals_async() -> tokio::sync::MutexGuard<'static, ()> {
        GLOBALS.lock().await
    }

    /// A mock app whose `app_data_dir()` is a fresh temp directory.
    ///
    /// NOTE: Tauri joins the identifier onto `dirs::data_dir()`; joining an
    /// absolute path replaces the base, which redirects every app path into
    /// the temp dir without touching the real user profile.
    pub fn mock_app_in_tempdir() -> tauri::App<MockRuntime> {
        let dir = tempfile::tempdir().unwrap().keep();
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = dir.to_string_lossy().into_owned();
        mock_builder().build(context).unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicUsize;

    #[test]
    fn close_hides_only_when_tray_exists() {
        assert_eq!(close_action(true, true), CloseAction::HideToTray);
        assert_eq!(close_action(true, false), CloseAction::Close);
        assert_eq!(close_action(false, true), CloseAction::Close);
        assert_eq!(close_action(false, false), CloseAction::Close);
    }

    #[test]
    fn start_hidden_requires_tray() {
        assert!(should_start_hidden(true, true));
        assert!(!should_start_hidden(true, false));
        assert!(!should_start_hidden(false, true));
    }

    #[test]
    fn exit_events_are_detected() {
        assert!(is_exit_event(&RunEvent::Exit));
        assert!(!is_exit_event(&RunEvent::Ready));
        assert!(!is_exit_event(&RunEvent::Resumed));
    }

    #[test]
    fn stop_background_work_cancels_export_and_running_downloads() {
        let h = services::queue::testing::harness(2);
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            h.add("a").await;
            h.wait_running("a").await;
        });

        let cancelled = AtomicUsize::new(0);
        stop_background_work(
            Some(h.queue.clone()),
            || {
                cancelled.fetch_add(1, Ordering::SeqCst);
            },
            Duration::from_secs(5),
        );
        assert_eq!(cancelled.load(Ordering::SeqCst), 1);
        assert_eq!(h.dl.cancels(), ["a"]);
        let status = rt.block_on(h.status("a"));
        assert_eq!(status, Some(models::download::DownloadStatus::Cancelled));

        stop_background_work(None, || {}, Duration::from_secs(1));
    }

    #[test]
    fn stop_background_work_gives_up_after_timeout() {
        let dl = services::queue::testing::FakeDownloader::stubborn();
        let h = services::queue::testing::harness_with(1, dl);
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            h.add("stuck").await;
            h.wait_running("stuck").await;
        });
        let start = std::time::Instant::now();
        stop_background_work(Some(h.queue.clone()), || {}, Duration::from_millis(100));
        assert!(start.elapsed() < Duration::from_secs(5));
    }
}
