//! System tray functionality

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};
use tracing::info;

const DEFAULT_TOOLTIP: &str = "Clipy - Video Downloader & Editor";

/// Setup the system tray.
///
/// Fails when the app has no default window icon: an icon-less tray entry is
/// invisible on most desktops, and callers rely on this error to avoid hiding
/// the window into a tray the user cannot see.
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, tauri::Error> {
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;
    let menu = build_tray_menu(app)?;

    // id "main" so update_tray_download_progress can find it
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(DEFAULT_TOOLTIP)
        .on_menu_event(|app, event| {
            handle_menu_event(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)
}

/// Build the tray context menu
fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Clipy", true, None::<&str>)?;
    let downloads = MenuItem::with_id(app, "downloads", "Downloads", true, None::<&str>)?;
    let library = MenuItem::with_id(app, "library", "Library", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Clipy", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &show,
            &PredefinedMenuItem::separator(app)?,
            &downloads,
            &library,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )
}

/// What a tray menu item does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrayAction {
    /// Show and focus the main window.
    Show,
    /// Show the main window and navigate the frontend to this route.
    Navigate(&'static str),
    /// Quit the app (through the normal exit path, which stops downloads).
    Quit,
}

/// Map a tray menu id to its action; `None` for unknown ids.
pub fn tray_action(id: &str) -> Option<TrayAction> {
    match id {
        "show" => Some(TrayAction::Show),
        "downloads" => Some(TrayAction::Navigate("/downloads")),
        "library" => Some(TrayAction::Navigate("/library")),
        "settings" => Some(TrayAction::Navigate("/settings")),
        "quit" => Some(TrayAction::Quit),
        _ => None,
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    let window = app.get_webview_window("main")?;
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

/// Handle tray menu events
fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    info!("Tray menu event: {}", id);
    match tray_action(id) {
        Some(TrayAction::Show) => {
            show_main_window(app);
        }
        Some(TrayAction::Navigate(route)) => {
            if let Some(window) = show_main_window(app) {
                let _ = window.emit("navigate", route);
            }
        }
        Some(TrayAction::Quit) => {
            info!("Quitting application from tray");
            // NOTE: exit() raises RunEvent::ExitRequested, where lib.rs stops
            // downloads/exports, so no child processes are orphaned.
            app.exit(0);
        }
        None => {}
    }
}

/// Tray tooltip for a number of active downloads.
pub fn tooltip_for(active_downloads: u32) -> String {
    if active_downloads > 0 {
        format!("Clipy - {} download(s) in progress", active_downloads)
    } else {
        DEFAULT_TOOLTIP.to_string()
    }
}

/// Update tray icon for download progress
pub fn update_tray_download_progress<R: Runtime>(app: &AppHandle<R>, active_downloads: u32) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip_for(active_downloads)));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tauri::test::mock_app;
    use tauri::Listener;

    #[test]
    fn menu_ids_map_to_actions() {
        assert_eq!(tray_action("show"), Some(TrayAction::Show));
        assert_eq!(
            tray_action("downloads"),
            Some(TrayAction::Navigate("/downloads"))
        );
        assert_eq!(
            tray_action("library"),
            Some(TrayAction::Navigate("/library"))
        );
        assert_eq!(
            tray_action("settings"),
            Some(TrayAction::Navigate("/settings"))
        );
        assert_eq!(tray_action("quit"), Some(TrayAction::Quit));
        assert_eq!(tray_action("bogus"), None);
    }

    #[test]
    fn tooltip_reflects_download_count() {
        assert_eq!(tooltip_for(0), DEFAULT_TOOLTIP);
        assert_eq!(tooltip_for(2), "Clipy - 2 download(s) in progress");
    }

    #[test]
    fn setup_without_icon_fails_instead_of_creating_invisible_tray() {
        let app = mock_app();
        let err = setup_tray(app.handle()).err().unwrap();
        assert!(err.to_string().contains("default window icon"));
        update_tray_download_progress(app.handle(), 3);
    }

    #[test]
    fn menu_events_show_window_and_navigate() {
        let app = mock_app();
        let _window = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .unwrap();
        let routes = Arc::new(Mutex::new(Vec::<String>::new()));
        let sink = routes.clone();
        app.listen_any("navigate", move |e| {
            sink.lock().unwrap().push(e.payload().to_string());
        });

        for id in ["show", "downloads", "library", "settings", "bogus"] {
            handle_menu_event(app.handle(), id);
        }
        assert_eq!(
            *routes.lock().unwrap(),
            ["\"/downloads\"", "\"/library\"", "\"/settings\""]
        );
        assert!(build_tray_menu(app.handle()).is_ok());
    }

    #[test]
    fn navigation_without_main_window_is_a_noop() {
        let app = mock_app();
        handle_menu_event(app.handle(), "downloads");
        handle_menu_event(app.handle(), "show");
    }
}
