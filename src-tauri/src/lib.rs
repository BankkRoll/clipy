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
use tauri::{AppHandle, Manager, RunEvent, Runtime};
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

/// Startup work run from the Tauri `setup` hook: directories, database,
/// config, process registry, tray, download queue, a background binary check
/// and the initial window visibility.
fn setup<R: Runtime>(app: &AppHandle<R>) -> std::result::Result<(), Box<dyn std::error::Error>> {
    if utils::smoke::is_enabled() {
        info!("Smoke-test mode: waiting for the frontend to report ready");
        utils::smoke::start_watchdog(utils::smoke::READY_TIMEOUT);
    }
    utils::paths::ensure_app_dirs(app)?;
    services::database::init_database(app)?;
    services::config::init_config(app)?;
    services::process_registry::init_registry();

    let tray_ok = utils::tray::setup_tray(app)
        .inspect_err(|e| warn!("Failed to set up system tray: {}", e))
        .is_ok();
    TRAY_READY.store(tray_ok, Ordering::SeqCst);

    let settings = services::config::get_settings()?;
    services::queue::init_queue(app.clone(), settings.download.max_concurrent_downloads);

    spawn_binary_check(app.clone());

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

/// Log whether ffmpeg/yt-dlp are available, off the startup path.
///
/// PERF: probing runs each tool (and `where`/`which`), which can take several
/// seconds; doing it inline in `setup` kept the window hidden that long. The
/// result is only logged — the frontend asks via the `check_binaries` command.
fn spawn_binary_check<R: Runtime>(app: AppHandle<R>) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn_blocking(move || {
        log_binary_status(&services::binary::check_binaries(&app))
    })
}

fn log_binary_status(status: &error::Result<models::settings::BinaryStatus>) {
    match status {
        Ok(status) if !status.ffmpeg_installed || !status.ytdlp_installed => {
            info!("Some binaries not found, will prompt for download on first use");
        }
        Ok(_) => {}
        Err(e) => info!("Failed to check binaries: {}", e),
    }
}

/// Hide the main window instead of closing it when close-to-tray is on and a
/// tray exists. Returns whether the close should be prevented.
fn hide_on_close<R: Runtime>(window: &tauri::Window<R>) -> bool {
    let close_to_tray = services::config::get_settings()
        .map(|s| s.general.close_to_tray)
        .unwrap_or(false);
    let hide =
        close_action(close_to_tray, TRAY_READY.load(Ordering::SeqCst)) == CloseAction::HideToTray;
    if hide {
        let _ = window.hide();
    }
    hide
}

/// Window-event hook: a close request may become hide-to-tray.
fn on_window_event<R: Runtime>(window: &tauri::Window<R>, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if hide_on_close(window) {
            api.prevent_close();
        }
    }
}

/// Add the app minus its plugins to `builder`: media protocol, setup hook,
/// close-to-tray handling and every IPC command. Generic so tests can drive it
/// on the mock runtime.
fn app_builder<R: Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .register_asynchronous_uri_scheme_protocol(media_protocol::SCHEME, media_protocol::handle)
        .setup(|app| setup(app.handle()))
        .on_window_event(on_window_event)
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
            commands::system::app_ready,
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
}

/// Initialize and run the Tauri application
// NOTE: logging setup, plugin registration and the real event loop need the
// Wry runtime and a display, so this function is the untested remainder;
// everything it wires up lives in `app_builder` and `setup`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let debug_mode = utils::logger::read_debug_mode_from_config();
    utils::logger::init_logging(debug_mode);
    utils::logger::print_banner(env!("CARGO_PKG_VERSION"), debug_mode);
    info!("Starting Clipy v{}", env!("CARGO_PKG_VERSION"));

    let app = app_builder(tauri::Builder::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        // Updates are minisign-verified against the pubkey in tauri.conf.json;
        // the process plugin relaunches into the new version.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(on_run_event);
}

/// Event-loop hook: every exit path stops background work first.
fn on_run_event<R: Runtime>(_app: &AppHandle<R>, event: RunEvent) {
    if is_exit_event(&event) {
        shutdown_background_work();
    }
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
        mock_builder().build(mock_context_in_tempdir()).unwrap()
    }

    /// A mock context whose app paths all live in a fresh temp directory
    /// (see [`mock_app_in_tempdir`]).
    pub fn mock_context_in_tempdir() -> tauri::Context<MockRuntime> {
        let dir = tempfile::tempdir().unwrap().keep();
        let mut context = mock_context(noop_assets());
        context.config_mut().identifier = dir.to_string_lossy().into_owned();
        context
    }

    /// A canned HTTP response served by [`TestServer`].
    #[derive(Debug, Clone)]
    pub struct Route {
        status: u16,
        headers: Vec<(String, String)>,
        body: Vec<u8>,
        content_length: bool,
    }

    impl Route {
        /// `200 OK` with `body`.
        pub fn ok(body: impl Into<Vec<u8>>) -> Self {
            Self {
                status: 200,
                headers: Vec::new(),
                body: body.into(),
                content_length: true,
            }
        }

        /// An empty response with `status`.
        pub fn status(status: u16) -> Self {
            Self {
                status,
                ..Self::ok(Vec::new())
            }
        }

        /// `302 Found` pointing at `location`.
        pub fn redirect(location: &str) -> Self {
            Self::status(302).header("Location", location)
        }

        /// Add a response header.
        pub fn header(mut self, name: &str, value: &str) -> Self {
            self.headers.push((name.into(), value.into()));
            self
        }

        /// Omit `Content-Length`, so the body is delimited by connection close
        /// and only a streaming size check can catch an oversized body.
        pub fn without_length(mut self) -> Self {
            self.content_length = false;
            self
        }
    }

    /// Minimal in-process HTTP/1.1 server for download tests: one request per
    /// connection, routes matched on the exact request path.
    pub struct TestServer {
        /// `http://127.0.0.1:<port>` (no trailing slash).
        pub base: String,
        routes: std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Route>>>,
        hits: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
    }

    impl TestServer {
        /// Bind an ephemeral port and serve on the current Tokio runtime.
        pub async fn start() -> Self {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", listener.local_addr().unwrap());
            let routes = std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::<
                String,
                Route,
            >::new()));
            let hits = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
            let (r, h) = (routes.clone(), hits.clone());
            tokio::spawn(async move {
                while let Ok((mut sock, _)) = listener.accept().await {
                    let (routes, hits) = (r.clone(), h.clone());
                    tokio::spawn(async move {
                        let mut req = Vec::new();
                        let mut buf = [0u8; 1024];
                        while !req.windows(4).any(|w| w == b"\r\n\r\n") {
                            let n = sock.read(&mut buf).await.unwrap_or(0);
                            assert!(n > 0, "client closed before a full request");
                            req.extend_from_slice(&buf[..n]);
                        }
                        let head = String::from_utf8_lossy(&req).into_owned();
                        let path = head.split_whitespace().nth(1).unwrap_or("/").to_string();
                        hits.lock().unwrap().push(path.clone());
                        let route = routes
                            .lock()
                            .unwrap()
                            .get(&path)
                            .cloned()
                            .unwrap_or_else(|| Route::status(404));
                        let mut resp =
                            format!("HTTP/1.1 {} X\r\nConnection: close\r\n", route.status);
                        for (k, v) in &route.headers {
                            resp += &format!("{k}: {v}\r\n");
                        }
                        if route.content_length {
                            resp += &format!("Content-Length: {}\r\n", route.body.len());
                        }
                        resp += "\r\n";
                        let _ = sock.write_all(resp.as_bytes()).await;
                        let _ = sock.write_all(&route.body).await;
                        let _ = sock.shutdown().await;
                    });
                }
            });
            Self { base, routes, hits }
        }

        /// Serve `route` at `path` (e.g. `/a/b.zip`).
        pub fn route(&self, path: &str, route: Route) -> &Self {
            self.routes.lock().unwrap().insert(path.into(), route);
            self
        }

        /// Absolute URL for `path`.
        pub fn url(&self, path: &str) -> String {
            format!("{}{}", self.base, path)
        }

        /// Paths requested so far, in order.
        pub fn hits(&self) -> Vec<String> {
            self.hits.lock().unwrap().clone()
        }
    }

    /// An in-memory zip with `entries` (names ending in `/` become
    /// directories) plus an optional `(name, target)` symlink entry.
    pub fn build_zip(entries: &[(&str, &[u8])], symlink: Option<(&str, &str)>) -> Vec<u8> {
        use std::io::Write;
        use zip::write::SimpleFileOptions;
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, data) in entries {
            if name.ends_with('/') {
                w.add_directory(*name, SimpleFileOptions::default())
                    .unwrap();
            } else {
                w.start_file(*name, SimpleFileOptions::default()).unwrap();
                w.write_all(data).unwrap();
            }
        }
        if let Some((name, target)) = symlink {
            w.add_symlink(name, target, SimpleFileOptions::default())
                .unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    /// Lowercase hex SHA-256 of `bytes`.
    pub fn sha256_hex(bytes: &[u8]) -> String {
        use sha2::Digest;
        hex::encode(sha2::Sha256::digest(bytes))
    }

    /// Behaviour of a [`fake_tool`] script, applied in field order.
    #[derive(Debug, Default, Clone)]
    pub struct Script {
        /// Seconds to wait before doing anything else.
        pub sleep_secs: u32,
        /// Copy `from` to `to` (stands in for files the real tool writes).
        pub copy: Option<(std::path::PathBuf, std::path::PathBuf)>,
        /// Bytes written to stdout.
        pub stdout: String,
        /// Bytes written to stderr.
        pub stderr: String,
        /// Process exit code.
        pub exit_code: i32,
    }

    /// Write a scripted stand-in for the external tool `stem` into `dir` and
    /// return its path.
    ///
    /// The script is `<stem>` (POSIX sh) on Unix and `<stem>.cmd` on Windows;
    /// see [`crate::services::binary::platform_exe`] for how a `.cmd` fixture
    /// stands in for `<stem>.exe` in Windows tests. Output comes from data
    /// files next to the script, so arbitrary text replays byte for byte.
    pub fn fake_tool(dir: &std::path::Path, stem: &str, script: &Script) -> std::path::PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let out = dir.join(format!("{stem}.stdout.txt"));
        let err = dir.join(format!("{stem}.stderr.txt"));
        std::fs::write(&out, &script.stdout).unwrap();
        std::fs::write(&err, &script.stderr).unwrap();
        let q = |p: &std::path::Path| p.display().to_string();

        #[cfg(windows)]
        let (path, body) = {
            let mut body = String::from("@echo off\r\n");
            if script.sleep_secs > 0 {
                body += &format!("ping -n {} 127.0.0.1 >nul\r\n", script.sleep_secs + 1);
            }
            if let Some((from, to)) = &script.copy {
                body += &format!("copy /y \"{}\" \"{}\" >nul\r\n", q(from), q(to));
            }
            body += &format!("type \"{}\"\r\n", q(&out));
            body += &format!("type \"{}\" 1>&2\r\n", q(&err));
            body += &format!("exit /b {}\r\n", script.exit_code);
            (dir.join(format!("{stem}.cmd")), body)
        };

        #[cfg(not(windows))]
        let (path, body) = {
            let mut body = String::from("#!/bin/sh\n[ -n \"$CLIPY_FAKE_TOOL_PROBE\" ] && exit 0\n");
            if script.sleep_secs > 0 {
                body += &format!("sleep {}\n", script.sleep_secs);
            }
            if let Some((from, to)) = &script.copy {
                body += &format!("cp '{}' '{}'\n", q(from), q(to));
            }
            body += &format!("cat '{}'\n", q(&out));
            body += &format!("cat '{}' >&2\n", q(&err));
            body += &format!("exit {}\n", script.exit_code);
            (dir.join(stem), body)
        };

        std::fs::write(&path, body).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
            wait_until_executable(&path);
        }
        path
    }

    /// Block until `path` can be exec'd without ETXTBSY.
    ///
    /// NOTE: while we held the script open for writing, another test thread
    /// may have forked a child that inherited that fd; until the child execs,
    /// Linux refuses to exec the script ("Text file busy"). Our fd is already
    /// closed, so once one probe run succeeds no process can still hold it.
    #[cfg(unix)]
    fn wait_until_executable(path: &std::path::Path) {
        for _ in 0..200 {
            match std::process::Command::new(path)
                .env("CLIPY_FAKE_TOOL_PROBE", "1")
                .status()
            {
                Ok(_) => return,
                Err(e) if e.raw_os_error() == Some(libc::ETXTBSY) => {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                Err(e) => panic!("fake tool {} cannot run: {e}", path.display()),
            }
        }
        panic!("fake tool {} stayed busy", path.display());
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
    fn setup_returns_before_a_slow_binary_probe_finishes() {
        use crate::test_support::{fake_tool, mock_app_in_tempdir, Script};
        let _guard = crate::test_support::lock_globals();
        let app = mock_app_in_tempdir();
        let bin = utils::paths::get_binaries_dir(app.handle()).unwrap();
        let slow = Script {
            sleep_secs: 4,
            stdout: "ffmpeg version 9.9 test\n".into(),
            ..Default::default()
        };
        fake_tool(&bin, "ffmpeg", &slow);
        let _window = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .unwrap();

        let start = std::time::Instant::now();
        setup(app.handle()).unwrap();
        let setup_took = start.elapsed();
        assert!(setup_took < Duration::from_secs(3), "{setup_took:?}");
        assert!(services::database::global().is_ok());
        assert!(services::queue::get_queue().is_ok());
        assert!(utils::paths::get_temp_dir(app.handle()).unwrap().is_dir());
        // The mock app has no window icon, so no tray and no hide-to-tray.
        assert!(!TRAY_READY.load(Ordering::SeqCst));

        // Start-minimized without a tray falls back to showing the window.
        let mut settings = services::config::get_settings().unwrap();
        settings.general.minimize_to_tray = true;
        services::config::update_settings(settings).unwrap();
        setup(app.handle()).unwrap();
        log_binary_status(&Err(error::ClipyError::Other("probe failed".into())));
        log_binary_status(&Ok(models::settings::BinaryStatus {
            ffmpeg_installed: true,
            ytdlp_installed: true,
            ..Default::default()
        }));

        // The probe itself really is slow: a second one takes the full sleep.
        let probe = spawn_binary_check(app.handle().clone());
        tauri::async_runtime::block_on(probe).unwrap();
        assert!(start.elapsed() >= Duration::from_secs(4));
    }

    /// Origin the mock webview's IPC requests come from.
    #[cfg(windows)]
    const IPC_ORIGIN: &str = "http://tauri.localhost";
    #[cfg(not(windows))]
    const IPC_ORIGIN: &str = "tauri://localhost";

    /// Invoke `cmd` with JSON `args` through the real IPC handler.
    fn invoke(
        webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
        cmd: &str,
        args: serde_json::Value,
    ) -> Result<serde_json::Value, serde_json::Value> {
        tauri::test::get_ipc_response(
            webview,
            tauri::webview::InvokeRequest {
                cmd: cmd.into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: IPC_ORIGIN.parse().unwrap(),
                body: tauri::ipc::InvokeBody::Json(args),
                headers: Default::default(),
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }

    #[test]
    fn every_command_is_reachable_over_ipc_with_its_argument_names() {
        use serde_json::json;
        let _guard = crate::test_support::lock_globals();
        let _export = services::ffmpeg::EXPORT_TEST_LOCK.blocking_lock();
        let app = app_builder(tauri::test::mock_builder())
            .build(crate::test_support::mock_context_in_tempdir())
            .unwrap();
        // The setup hook only runs once an event loop starts, so run it here.
        setup(app.handle()).unwrap();
        // Setup installed the real queue; swap in a scripted downloader.
        let h = services::queue::testing::harness(1);
        services::queue::install_queue(h.queue.clone());
        let bin = utils::paths::get_binaries_dir(app.handle()).unwrap();
        let ytdlp = crate::test_support::Script {
            stdout: "up to date\n".into(),
            ..Default::default()
        };
        crate::test_support::fake_tool(&bin, "yt-dlp", &ytdlp);
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();

        let video_info = serde_json::to_value(models::video::VideoInfo::default()).unwrap();
        let options = serde_json::to_value(models::download::DownloadOptions::default()).unwrap();
        let project = invoke(
            &webview,
            "create_project",
            json!({"name": "P", "width": 640, "height": 360, "fps": 30}),
        )
        .unwrap();
        let export_settings = serde_json::to_value(models::project::ExportSettings {
            output_path: "relative.mp4".into(),
            ..Default::default()
        })
        .unwrap();
        let settings = invoke(&webview, "get_settings", json!({})).unwrap();
        let entry = serde_json::to_value(models::library::LibraryVideo::new(
            "id".into(),
            "t".into(),
            String::new(),
            0,
            "c".into(),
            "relative.mp4".into(),
            0,
            "mp4".into(),
            "720p".into(),
            String::new(),
        ))
        .unwrap();

        let cases: Vec<(&str, serde_json::Value, bool)> = vec![
            ("get_system_info", json!({}), true),
            ("check_binaries", json!({}), true),
            ("update_ytdlp", json!({}), true),
            ("get_cache_stats", json!({}), true),
            ("clear_cache", json!({}), true),
            ("clear_temp", json!({}), true),
            ("open_folder", json!({"path": "relative"}), false),
            ("open_file", json!({"path": "relative.mp4"}), false),
            ("show_in_folder", json!({"path": "http://x"}), false),
            ("get_default_download_path", json!({}), true),
            ("media_url", json!({"path": "/a.mp4"}), true),
            ("is_admin", json!({}), true),
            ("app_ready", json!({}), true),
            ("fetch_video_info", json!({"url": "ftp://x"}), false),
            (
                "get_available_qualities",
                json!({"videoInfo": video_info}),
                true,
            ),
            (
                "start_download",
                json!({"url": "https://youtu.be/x", "videoInfo": video_info, "options": options}),
                true,
            ),
            ("pause_download", json!({"id": "missing"}), false),
            ("resume_download", json!({"id": "missing"}), false),
            ("cancel_download", json!({"id": "missing"}), false),
            ("retry_download", json!({"id": "missing"}), false),
            ("get_downloads", json!({}), true),
            ("get_active_downloads", json!({}), true),
            ("clear_completed_downloads", json!({}), true),
            ("set_max_concurrent_downloads", json!({"max": 2}), true),
            ("validate_url", json!({"url": "https://x.y"}), true),
            (
                "extract_video_id",
                json!({"url": "https://youtu.be/abc"}),
                true,
            ),
            ("get_library_videos", json!({}), true),
            ("add_library_video", json!({"video": entry}), false),
            (
                "delete_library_video",
                json!({"id": "x", "deleteFile": false}),
                true,
            ),
            ("search_library", json!({"query": "a"}), true),
            ("import_video", json!({"filePath": "relative.mp4"}), false),
            (
                "check_video_exists",
                json!({"filePath": "relative.mp4"}),
                true,
            ),
            (
                "get_video_file_size",
                json!({"filePath": "relative.mp4"}),
                false,
            ),
            (
                "rename_library_video",
                json!({"id": "x", "newTitle": "y"}),
                false,
            ),
            ("get_library_stats", json!({}), true),
            (
                "bulk_delete_library_videos",
                json!({"ids": [], "deleteFiles": false}),
                true,
            ),
            ("export_library_json", json!({}), true),
            ("export_library_to_file", json!({"path": "lib.txt"}), false),
            ("get_video_metadata", json!({"path": "x.mp4"}), false),
            (
                "generate_thumbnail",
                json!({"videoPath": "x.mp4", "outputPath": "y.jpg", "timeOffset": 0.0}),
                false,
            ),
            (
                "generate_timeline_thumbnails",
                json!({"videoPath": "x.mp4", "outputDir": "d", "count": 1, "width": 10}),
                false,
            ),
            (
                "extract_waveform",
                json!({"videoPath": "x.mp4", "samples": 10}),
                false,
            ),
            (
                "export_project",
                json!({"project": project, "settings": export_settings}),
                false,
            ),
            ("cancel_export", json!({}), true),
            ("get_export_status", json!({}), true),
            (
                "save_project",
                json!({"project": project, "path": "p.txt"}),
                false,
            ),
            ("load_project", json!({"path": "p.clipy"}), false),
            (
                "transcode_for_editing",
                json!({"inputPath": "x.mp4", "outputPath": "y.mp4"}),
                false,
            ),
            ("get_export_formats", json!({}), true),
            ("get_export_resolutions", json!({}), true),
            (
                "generate_captions",
                json!({"sourcePath": "x.mp4", "model": "nope"}),
                false,
            ),
            ("update_settings", json!({"settings": settings}), true),
            ("reset_settings", json!({}), true),
            (
                "update_setting",
                json!({"key": "general.language", "value": "fr"}),
                true,
            ),
            ("get_setting", json!({"key": "general.language"}), true),
            ("export_settings", json!({}), true),
            ("import_settings", json!({"json": "not json"}), false),
        ];
        for (cmd, args, ok) in cases {
            let result = invoke(&webview, cmd, args);
            assert_eq!(result.is_ok(), ok, "{cmd}: {result:?}");
        }
        assert_eq!(
            invoke(&webview, "get_setting", json!({"key": "general.language"})).unwrap(),
            "fr"
        );
        assert!(invoke(&webview, "no_such_command", json!({})).is_err());
        // Missing arguments are rejected before a command body runs.
        let with_args = [
            "open_folder",
            "open_file",
            "show_in_folder",
            "media_url",
            "fetch_video_info",
            "get_available_qualities",
            "start_download",
            "pause_download",
            "resume_download",
            "cancel_download",
            "retry_download",
            "set_max_concurrent_downloads",
            "validate_url",
            "extract_video_id",
            "add_library_video",
            "delete_library_video",
            "search_library",
            "import_video",
            "check_video_exists",
            "get_video_file_size",
            "rename_library_video",
            "bulk_delete_library_videos",
            "export_library_to_file",
            "get_video_metadata",
            "generate_thumbnail",
            "generate_timeline_thumbnails",
            "extract_waveform",
            "export_project",
            "save_project",
            "load_project",
            "create_project",
            "transcode_for_editing",
            "generate_captions",
            "update_settings",
            "update_setting",
            "get_setting",
            "import_settings",
        ];
        for cmd in with_args {
            let err = invoke(&webview, cmd, json!({})).unwrap_err();
            assert!(
                err.to_string().contains("missing required key"),
                "{cmd}: {err}"
            );
        }
    }

    #[test]
    fn close_hides_to_tray_only_when_configured_and_available() {
        let _guard = crate::test_support::lock_globals();
        let app = crate::test_support::mock_app_in_tempdir();
        services::config::init_config(app.handle()).unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let w = window.as_ref().window();
        let mut settings = services::config::get_settings().unwrap();
        settings.general.close_to_tray = true;
        services::config::update_settings(settings).unwrap();

        TRAY_READY.store(false, Ordering::SeqCst);
        // Events other than a close request are ignored.
        on_window_event(&w, &tauri::WindowEvent::Focused(true));
        assert!(!hide_on_close(&w));
        TRAY_READY.store(true, Ordering::SeqCst);
        assert!(hide_on_close(&w));
        TRAY_READY.store(false, Ordering::SeqCst);
    }

    #[test]
    fn exit_events_run_the_shutdown_path_once() {
        let _guard = crate::test_support::lock_globals();
        let _export = services::ffmpeg::EXPORT_TEST_LOCK.blocking_lock();
        let app = crate::test_support::mock_app_in_tempdir();
        let h = services::queue::testing::harness(1);
        services::queue::install_queue(h.queue.clone());
        tauri::async_runtime::block_on(async {
            h.add("running").await;
            h.wait_running("running").await;
        });

        on_run_event(app.handle(), RunEvent::Ready);
        assert!(h.dl.cancels().is_empty());
        on_run_event(app.handle(), RunEvent::Exit);
        assert_eq!(h.dl.cancels(), ["running"]);
        assert!(!shutdown_background_work(), "shutdown must run only once");
        services::ffmpeg::reset_export_cancel();
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
