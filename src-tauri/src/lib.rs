//! Clipy - YouTube Video Downloader and Editor
//!
//! This is the main library for the Clipy Tauri application.
//! It provides all the backend functionality for downloading and editing videos.

pub mod commands;
pub mod error;
pub mod models;
pub mod services;
pub mod utils;

use tracing::info;

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Read debug mode from config before initializing logging
    let debug_mode = utils::logger::read_debug_mode_from_config();

    // Initialize logging with appropriate level based on debug mode
    utils::logger::init_logging(debug_mode);

    // Print startup banner
    utils::logger::print_banner(env!("CARGO_PKG_VERSION"), debug_mode);

    info!("Starting Clipy v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        // TODO: Enable updater plugin when update server is configured
        // .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Initialize application directories
            let app_handle = app.handle().clone();
            utils::paths::ensure_app_dirs(&app_handle)?;

            // Initialize database
            services::database::init_database(&app_handle)?;

            // Initialize config
            services::config::init_config(&app_handle)?;

            // Initialize process registry for download management
            services::process_registry::init_registry();

            // Initialize download queue
            let settings = services::config::get_settings()?;
            services::queue::init_queue(app_handle.clone(), settings.download.max_concurrent_downloads);

            // Check for required binaries
            match services::binary::check_binaries(&app_handle) {
                Ok(status) => {
                    if !status.ffmpeg_installed || !status.ytdlp_installed {
                        info!("Some binaries not found, will prompt for download on first use");
                    }
                }
                Err(e) => {
                    info!("Failed to check binaries: {}", e);
                }
            }

            info!("Clipy initialized successfully");
            Ok(())
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
            // Settings commands
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::settings::reset_settings,
            commands::settings::update_setting,
            commands::settings::get_setting,
            commands::settings::export_settings,
            commands::settings::import_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
