//! System tray functionality

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    AppHandle, Emitter, Manager, Runtime,
};
use tracing::info;

/// Setup the system tray
pub fn setup_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, tauri::Error> {
    // Build the tray menu
    let menu = build_tray_menu(app)?;

    // Create the tray icon
    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Clipy - Video Downloader & Editor")
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
                // Show main window on left click
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(tray)
}

/// Build the tray context menu
fn build_tray_menu<R: Runtime>(app: &AppHandle<R>) -> Result<Menu<R>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Clipy", true, None::<&str>)?;
    let downloads = MenuItem::with_id(app, "downloads", "Downloads", true, None::<&str>)?;
    let library = MenuItem::with_id(app, "library", "Library", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Clipy", true, None::<&str>)?;

    Menu::with_items(app, &[
        &show,
        &separator,
        &downloads,
        &library,
        &settings,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])
}

/// Handle tray menu events
fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    info!("Tray menu event: {}", id);

    match id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "downloads" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("navigate", "/downloads");
            }
        }
        "library" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("navigate", "/library");
            }
        }
        "settings" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("navigate", "/settings");
            }
        }
        "quit" => {
            info!("Quitting application from tray");
            app.exit(0);
        }
        _ => {}
    }
}

/// Update tray icon for download progress
pub fn update_tray_download_progress<R: Runtime>(
    app: &AppHandle<R>,
    active_downloads: u32,
) {
    // Update tooltip to show download count
    if let Some(tray) = app.tray_by_id("main") {
        let tooltip = if active_downloads > 0 {
            format!("Clipy - {} download(s) in progress", active_downloads)
        } else {
            "Clipy - Video Downloader & Editor".to_string()
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}
