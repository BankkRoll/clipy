//! Editor-related commands

use crate::error::{ClipyError, Result};
use crate::models::project::{ExportProgress, ExportSettings, ExportStatus, Project};
use crate::services::ffmpeg::{self, VideoMetadata};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, info};

/// Active export state
static ACTIVE_EXPORT: Mutex<Option<String>> = Mutex::const_new(None);

/// Get video metadata
#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<VideoMetadata> {
    debug!("Getting video metadata for: {}", path);
    let result = ffmpeg::get_video_metadata(&app, &path).await;
    if let Ok(ref metadata) = result {
        debug!("Video metadata: {}x{}, {} fps, duration: {}s", metadata.width, metadata.height, metadata.fps, metadata.duration);
    }
    result
}

/// Generate a thumbnail at specific time
#[tauri::command]
pub async fn generate_thumbnail(
    app: AppHandle,
    video_path: String,
    output_path: String,
    time_offset: f64,
) -> Result<()> {
    debug!("Generating thumbnail: video={}, output={}, time={}s", video_path, output_path, time_offset);
    let result = ffmpeg::generate_thumbnail(&app, &video_path, &output_path, time_offset).await;
    debug!("Thumbnail generation result: {:?}", result.is_ok());
    result
}

/// Generate timeline thumbnails
#[tauri::command]
pub async fn generate_timeline_thumbnails(
    app: AppHandle,
    video_path: String,
    output_dir: String,
    count: u32,
    width: u32,
) -> Result<Vec<String>> {
    debug!("Generating {} timeline thumbnails for {} (width: {}px, output: {})", count, video_path, width, output_dir);
    let result = ffmpeg::generate_timeline_thumbnails(&app, &video_path, &output_dir, count, width).await;
    if let Ok(ref paths) = result {
        debug!("Generated {} timeline thumbnails", paths.len());
    }
    result
}

/// Extract audio waveform data
#[tauri::command]
pub async fn extract_waveform(
    app: AppHandle,
    video_path: String,
    samples: u32,
) -> Result<Vec<f32>> {
    debug!("Extracting waveform from {} ({} samples)", video_path, samples);
    let result = ffmpeg::extract_waveform(&app, &video_path, samples).await;
    if let Ok(ref data) = result {
        debug!("Extracted {} waveform samples", data.len());
    }
    result
}

/// Export a project
#[tauri::command]
pub async fn export_project(
    app: AppHandle,
    project: Project,
    settings: ExportSettings,
) -> Result<String> {
    info!("Starting export for project: {}", project.name);
    debug!("Export settings: format={}, quality={}, resolution={}, fps={}",
        settings.format, settings.quality, settings.resolution, settings.fps);
    debug!("Export output path: {}", settings.output_path);
    debug!("Project has {} tracks, duration: {}s", project.tracks.len(), project.duration);

    // Check if an export is already running
    {
        let active = ACTIVE_EXPORT.lock().await;
        if active.is_some() {
            debug!("Export already in progress, rejecting request");
            return Err(ClipyError::ExportFailed("An export is already in progress".into()));
        }
    }

    // Set active export
    {
        let mut active = ACTIVE_EXPORT.lock().await;
        *active = Some(project.id.clone());
    }

    // Create progress channel
    let (progress_tx, mut progress_rx) = mpsc::channel::<ExportProgress>(100);

    // Forward progress to frontend
    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_clone.emit("export-progress", &progress);
        }
    });

    // Run export
    let result = ffmpeg::export_project(&app, &project, &settings, progress_tx).await;

    // Clear active export
    {
        let mut active = ACTIVE_EXPORT.lock().await;
        *active = None;
    }

    match result {
        Ok(path) => {
            debug!("Export completed successfully: {:?}", path);
            Ok(path.to_string_lossy().to_string())
        }
        Err(e) => {
            debug!("Export failed: {:?}", e);
            Err(e)
        }
    }
}

/// Cancel current export
#[tauri::command]
pub async fn cancel_export(app: AppHandle) -> Result<()> {
    info!("Cancelling export");

    let project_id = {
        let mut active = ACTIVE_EXPORT.lock().await;
        active.take()
    };

    if let Some(ref id) = project_id {
        debug!("Cancelling export for project: {}", id);
    }

    if let Some(id) = project_id {
        // Emit cancelled status
        let _ = app.emit("export-progress", ExportProgress {
            project_id: id,
            progress: 0.0,
            current_frame: 0,
            total_frames: 0,
            elapsed_time: 0,
            estimated_time: 0,
            status: ExportStatus::Cancelled,
            error: None,
        });
    }

    Ok(())
}

/// Get export status
#[tauri::command]
pub async fn get_export_status() -> Option<String> {
    let active = ACTIVE_EXPORT.lock().await;
    debug!("Export status check: {:?}", active.as_ref());
    active.clone()
}

/// Save project to file
#[tauri::command]
pub async fn save_project(project: Project, path: String) -> Result<()> {
    info!("Saving project to: {}", path);
    debug!("Project: {} ({} tracks, duration: {}s)", project.name, project.tracks.len(), project.duration);

    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| ClipyError::Other(format!("Failed to serialize project: {}", e)))?;

    debug!("Serialized project JSON: {} bytes", json.len());

    std::fs::write(&path, json)
        .map_err(|e| ClipyError::Other(format!("Failed to write project file: {}", e)))?;

    debug!("Project saved successfully");
    Ok(())
}

/// Load project from file
#[tauri::command]
pub async fn load_project(path: String) -> Result<Project> {
    info!("Loading project from: {}", path);

    let content = std::fs::read_to_string(&path)
        .map_err(|e| ClipyError::Other(format!("Failed to read project file: {}", e)))?;

    debug!("Read project file: {} bytes", content.len());

    let project: Project = serde_json::from_str(&content)
        .map_err(|e| ClipyError::Other(format!("Failed to parse project: {}", e)))?;

    debug!("Loaded project: {} ({} tracks, duration: {}s)", project.name, project.tracks.len(), project.duration);
    Ok(project)
}

/// Create a new project
#[tauri::command]
pub fn create_project(name: String, width: u32, height: u32, fps: u32) -> Project {
    use crate::models::project::{ProjectSettings, Track, TrackType};

    debug!("Creating new project: {} ({}x{} @ {} fps)", name, width, height, fps);

    let now = chrono::Utc::now().to_rfc3339();

    Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        created_at: now.clone(),
        modified_at: now,
        duration: 0.0,
        tracks: vec![
            Track {
                id: uuid::Uuid::new_v4().to_string(),
                track_type: TrackType::Video,
                name: "Video 1".to_string(),
                clips: Vec::new(),
                muted: false,
                locked: false,
                volume: 1.0,
                height: 100,
            },
            Track {
                id: uuid::Uuid::new_v4().to_string(),
                track_type: TrackType::Audio,
                name: "Audio 1".to_string(),
                clips: Vec::new(),
                muted: false,
                locked: false,
                volume: 1.0,
                height: 60,
            },
        ],
        settings: ProjectSettings {
            width,
            height,
            fps,
            sample_rate: 48000,
        },
    }
}

/// Transcode video to edit-friendly format
#[tauri::command]
pub async fn transcode_for_editing(
    app: AppHandle,
    input_path: String,
    output_path: String,
) -> Result<()> {
    info!("Transcoding {} for editing", input_path);
    debug!("Transcode input: {}", input_path);
    debug!("Transcode output: {}", output_path);

    let settings = ExportSettings {
        format: "mp4".to_string(),
        quality: "medium".to_string(),
        resolution: "original".to_string(),
        fps: 30,
        video_bitrate: 8000,
        audio_bitrate: 192,
        use_hardware_acceleration: true,
        output_path: output_path.clone(),
    };

    debug!("Transcode settings: format={}, quality={}, hw_accel={}", settings.format, settings.quality, settings.use_hardware_acceleration);
    let result = ffmpeg::transcode_video(&app, &input_path, &output_path, &settings).await;
    debug!("Transcode result: {:?}", result.is_ok());
    result
}

/// Get supported export formats
#[tauri::command]
pub fn get_export_formats() -> Vec<ExportFormat> {
    debug!("Getting export formats");
    vec![
        ExportFormat {
            id: "mp4".to_string(),
            name: "MP4 (H.264)".to_string(),
            extension: "mp4".to_string(),
            description: "Most compatible format".to_string(),
        },
        ExportFormat {
            id: "webm".to_string(),
            name: "WebM (VP9)".to_string(),
            extension: "webm".to_string(),
            description: "Best for web".to_string(),
        },
        ExportFormat {
            id: "mov".to_string(),
            name: "QuickTime (ProRes)".to_string(),
            extension: "mov".to_string(),
            description: "High quality, large file".to_string(),
        },
        ExportFormat {
            id: "mkv".to_string(),
            name: "Matroska (MKV)".to_string(),
            extension: "mkv".to_string(),
            description: "Flexible container".to_string(),
        },
        ExportFormat {
            id: "gif".to_string(),
            name: "GIF".to_string(),
            extension: "gif".to_string(),
            description: "Animated image".to_string(),
        },
    ]
}

/// Export format info
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFormat {
    pub id: String,
    pub name: String,
    pub extension: String,
    pub description: String,
}

/// Get supported resolutions
#[tauri::command]
pub fn get_export_resolutions() -> Vec<ExportResolution> {
    debug!("Getting export resolutions");
    vec![
        ExportResolution {
            id: "2160p".to_string(),
            name: "4K UHD".to_string(),
            width: 3840,
            height: 2160,
        },
        ExportResolution {
            id: "1440p".to_string(),
            name: "2K QHD".to_string(),
            width: 2560,
            height: 1440,
        },
        ExportResolution {
            id: "1080p".to_string(),
            name: "Full HD".to_string(),
            width: 1920,
            height: 1080,
        },
        ExportResolution {
            id: "720p".to_string(),
            name: "HD".to_string(),
            width: 1280,
            height: 720,
        },
        ExportResolution {
            id: "480p".to_string(),
            name: "SD".to_string(),
            width: 854,
            height: 480,
        },
    ]
}

/// Export resolution info
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResolution {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}
