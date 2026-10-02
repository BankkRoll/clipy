//! Editor-related commands

use crate::error::{ClipyError, Result};
use crate::media_protocol;
use crate::models::project::{ExportProgress, ExportSettings, Project};
use crate::services::ffmpeg::{self, VideoMetadata};
use crate::utils::path_policy;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use tracing::{debug, info};

/// Project id of the export currently running, if any.
///
/// NOTE: a std mutex (never held across an await) so the slot can be released
/// from `Drop` on every exit path, including panics and early returns.
static ACTIVE_EXPORT: Mutex<Option<String>> = Mutex::new(None);

/// Largest project file `load_project` will read.
const MAX_PROJECT_BYTES: u64 = 64 * 1024 * 1024;

/// Exclusive claim on the single export slot; releases it when dropped.
struct ExportSlot;

impl ExportSlot {
    /// Atomically claim the slot for `project_id`, or fail if another export
    /// holds it. Also clears any stale cancel request while the slot is held,
    /// so a cancel that arrives after this point is never lost.
    fn claim(project_id: &str) -> Result<Self> {
        let mut active = ACTIVE_EXPORT.lock().unwrap_or_else(|e| e.into_inner());
        if active.is_some() {
            return Err(ClipyError::ExportFailed(
                "An export is already in progress".into(),
            ));
        }
        *active = Some(project_id.to_string());
        ffmpeg::reset_export_cancel();
        Ok(ExportSlot)
    }
}

impl Drop for ExportSlot {
    fn drop(&mut self) {
        *ACTIVE_EXPORT.lock().unwrap_or_else(|e| e.into_inner()) = None;
    }
}

fn active_export() -> Option<String> {
    ACTIVE_EXPORT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

/// Get video metadata
#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<VideoMetadata> {
    debug!("Getting video metadata for: {}", path);
    let result = ffmpeg::get_video_metadata(&app, &path).await;
    if let Ok(ref metadata) = result {
        // The user picked this file (editor import), so the preview player may
        // stream it even when it lives outside the default media roots.
        media_protocol::grant(Path::new(&path));
        debug!(
            "Video metadata: {}x{}, {} fps, duration: {}s",
            metadata.width, metadata.height, metadata.fps, metadata.duration
        );
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
    debug!(
        "Generating thumbnail: video={}, output={}, time={}s",
        video_path, output_path, time_offset
    );
    let result = ffmpeg::generate_thumbnail(&app, &video_path, &output_path, time_offset).await;
    if result.is_ok() {
        media_protocol::grant(Path::new(&output_path));
    }
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
    debug!(
        "Generating {} timeline thumbnails for {} (width: {}px, output: {})",
        count, video_path, width, output_dir
    );
    let result =
        ffmpeg::generate_timeline_thumbnails(&app, &video_path, &output_dir, count, width).await;
    if let Ok(ref paths) = result {
        debug!("Generated {} timeline thumbnails", paths.len());
        for p in paths {
            media_protocol::grant(Path::new(p));
        }
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
    debug!(
        "Extracting waveform from {} ({} samples)",
        video_path, samples
    );
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
    debug!(
        "Export settings: format={}, quality={}, resolution={}, fps={}",
        settings.format, settings.quality, settings.resolution, settings.fps
    );
    debug!("Export output path: {}", settings.output_path);
    debug!(
        "Project has {} tracks, duration: {}s",
        project.tracks.len(),
        project.duration
    );

    let _slot = ExportSlot::claim(&project.id)?;

    let (progress_tx, mut progress_rx) = mpsc::channel::<ExportProgress>(100);

    let app_clone = app.clone();
    tokio::spawn(async move {
        while let Some(progress) = progress_rx.recv().await {
            let _ = app_clone.emit("export-progress", &progress);
        }
    });

    // The slot stays held until ffmpeg has exited (run_export waits on it),
    // so a second export cannot start while the first is still being killed.
    let result = ffmpeg::export_project(&app, &project, &settings, progress_tx).await;
    if let Ok(ref path) = result {
        media_protocol::grant(path);
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
///
/// Only signals ffmpeg; the running `export_project` kills the process, emits
/// the `Cancelled` progress event and releases the export slot once ffmpeg has
/// actually exited.
#[tauri::command]
pub async fn cancel_export() -> Result<()> {
    info!("Cancelling export");
    if let Some(id) = active_export() {
        debug!("Cancelling export for project: {}", id);
        ffmpeg::request_export_cancel();
    }
    Ok(())
}

/// Get export status
#[tauri::command]
pub async fn get_export_status() -> Option<String> {
    let active = active_export();
    debug!("Export status check: {:?}", active.as_ref());
    active
}

/// Save project to file
#[tauri::command]
pub async fn save_project(project: Project, path: String) -> Result<()> {
    info!("Saving project to: {}", path);
    let target = path_policy::ensure_output_path(&path, path_policy::PROJECT_EXTENSIONS)?;
    debug!(
        "Project: {} ({} tracks, duration: {}s)",
        project.name,
        project.tracks.len(),
        project.duration
    );

    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| ClipyError::Other(format!("Failed to serialize project: {}", e)))?;

    debug!("Serialized project JSON: {} bytes", json.len());

    std::fs::write(&target, json)
        .map_err(|e| ClipyError::Other(format!("Failed to write project file: {}", e)))?;

    debug!("Project saved successfully");
    Ok(())
}

/// Load project from file
#[tauri::command]
pub async fn load_project(path: String) -> Result<Project> {
    info!("Loading project from: {}", path);
    let project = read_project_file(&path)?;
    grant_project_media(&project);

    debug!(
        "Loaded project: {} ({} tracks, duration: {}s)",
        project.name,
        project.tracks.len(),
        project.duration
    );
    Ok(project)
}

/// Read and parse a `.clipy`/`.json` project file, refusing other file types
/// and oversized files.
fn read_project_file(path: &str) -> Result<Project> {
    let file = path_policy::ensure_local_file(path, path_policy::PROJECT_EXTENSIONS)?;
    let len = std::fs::metadata(&file)
        .map_err(|e| ClipyError::Other(format!("Failed to read project file: {}", e)))?
        .len();
    if len > MAX_PROJECT_BYTES {
        return Err(ClipyError::Other(format!(
            "Project file is too large ({} bytes)",
            len
        )));
    }
    let content = std::fs::read_to_string(&file)
        .map_err(|e| ClipyError::Other(format!("Failed to read project file: {}", e)))?;
    debug!("Read project file: {} bytes", content.len());
    serde_json::from_str(&content)
        .map_err(|e| ClipyError::Other(format!("Failed to parse project: {}", e)))
}

/// Let the preview player stream every media file a loaded project references.
/// Each path is still type-checked by [`media_protocol::grant`].
fn grant_project_media(project: &Project) {
    for clip in project.tracks.iter().flat_map(|t| &t.clips) {
        if !clip.source_path.is_empty() {
            if let Ok(p) = path_policy::ensure_editor_source(&clip.source_path) {
                media_protocol::grant(&p);
            }
        }
    }
}

/// Create a new project
#[tauri::command]
pub fn create_project(name: String, width: u32, height: u32, fps: u32) -> Project {
    use crate::models::project::{ProjectSettings, Track, TrackType};

    debug!(
        "Creating new project: {} ({}x{} @ {} fps)",
        name, width, height, fps
    );

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
        video_codec: String::new(),
        crf: None,
        encoding_preset: String::new(),
    };

    debug!(
        "Transcode settings: format={}, quality={}, hw_accel={}",
        settings.format, settings.quality, settings.use_hardware_acceleration
    );
    let result = ffmpeg::transcode_video(&app, &input_path, &output_path, &settings).await;
    if result.is_ok() {
        media_protocol::grant(Path::new(&output_path));
    }
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

/// Generate auto-captions for a source media file via on-device whisper.cpp.
/// Downloads the whisper binary + model on first use. Returns word-level timing.
#[tauri::command]
pub async fn generate_captions(
    app: AppHandle,
    source_path: String,
    model: String,
) -> Result<crate::services::captions::CaptionResult> {
    info!("Generating captions for {} (model {})", source_path, model);
    crate::services::captions::generate_captions(&app, &source_path, &model).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    #[tokio::test]
    async fn export_slot_is_exclusive_and_released_on_drop() {
        let _guard = ffmpeg::EXPORT_TEST_LOCK.lock().await;
        assert!(get_export_status().await.is_none());
        let slot = ExportSlot::claim("p1").unwrap();
        assert_eq!(get_export_status().await.as_deref(), Some("p1"));
        assert!(matches!(
            ExportSlot::claim("p2"),
            Err(ClipyError::ExportFailed(_))
        ));
        // Cancelling signals ffmpeg but must NOT free the slot: only the
        // running export may release it once ffmpeg has exited.
        cancel_export().await.unwrap();
        assert_eq!(get_export_status().await.as_deref(), Some("p1"));
        drop(slot);
        assert!(get_export_status().await.is_none());
        // Claiming clears the stale cancel request.
        let slot = ExportSlot::claim("p3").unwrap();
        drop(slot);
        cancel_export().await.unwrap();
    }

    #[tokio::test]
    async fn save_and_load_project_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let media = dir.path().join("clip.mp4");
        fs::write(&media, b"x").unwrap();
        let mut project = create_project("Demo".into(), 1280, 720, 30);
        project.tracks[0].clips.push(crate::models::project::Clip {
            id: "c".into(),
            track_id: "t".into(),
            clip_type: crate::models::project::ClipType::Video,
            name: "clip".into(),
            start_time: 0.0,
            end_time: 1.0,
            source_start: 0.0,
            source_end: 1.0,
            source_path: s(&media),
            thumbnails: Vec::new(),
            properties: Default::default(),
        });
        let path = dir.path().join("demo.clipy");
        save_project(project.clone(), s(&path)).await.unwrap();
        let loaded = load_project(s(&path)).await.unwrap();
        assert_eq!(loaded.id, project.id);
        assert_eq!(loaded.tracks.len(), 2);
        assert_eq!((loaded.settings.width, loaded.settings.fps), (1280, 30));
    }

    #[tokio::test]
    async fn save_and_load_reject_wrong_types() {
        let dir = tempfile::tempdir().unwrap();
        let project = create_project("x".into(), 640, 480, 24);
        for bad in ["evil.bat", "evil.exe", "notes.txt", "x.lnk"] {
            assert!(
                save_project(project.clone(), s(&dir.path().join(bad)))
                    .await
                    .is_err(),
                "{bad}"
            );
        }
        let secret = dir.path().join("id_rsa");
        fs::write(&secret, b"KEY").unwrap();
        assert!(load_project(s(&secret)).await.is_err());
        assert!(load_project("https://evil/p.clipy".into()).await.is_err());

        let broken = dir.path().join("broken.json");
        fs::write(&broken, b"{not json").unwrap();
        assert!(load_project(s(&broken)).await.is_err());
    }

    #[test]
    fn load_rejects_oversized_project() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.clipy");
        let f = fs::File::create(&big).unwrap();
        f.set_len(MAX_PROJECT_BYTES + 1).unwrap();
        drop(f);
        let err = read_project_file(&s(&big)).unwrap_err();
        assert!(err.to_string().contains("too large"), "{err}");
    }

    #[test]
    fn grant_project_media_skips_invalid_paths() {
        let mut project = create_project("g".into(), 2, 2, 1);
        project.tracks[0].clips.push(crate::models::project::Clip {
            id: "c".into(),
            track_id: "t".into(),
            clip_type: crate::models::project::ClipType::Video,
            name: "n".into(),
            start_time: 0.0,
            end_time: 1.0,
            source_start: 0.0,
            source_end: 1.0,
            source_path: "concat:/a|/b".into(),
            thumbnails: Vec::new(),
            properties: Default::default(),
        });
        grant_project_media(&project);
    }

    #[test]
    fn static_catalogs() {
        let formats = get_export_formats();
        assert!(formats.iter().any(|f| f.id == "mp4"));
        for f in &formats {
            assert!(path_policy::EXPORT_EXTENSIONS.contains(&f.extension.as_str()));
        }
        let res = get_export_resolutions();
        assert_eq!(res[0].width, 3840);
        let p = create_project("n".into(), 1920, 1080, 60);
        assert_eq!(p.tracks.len(), 2);
        assert_eq!(p.settings.sample_rate, 48000);
    }
}
