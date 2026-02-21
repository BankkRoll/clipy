//! FFmpeg service for video processing and encoding

use crate::error::{ClipyError, Result};
use crate::models::project::{ExportProgress, ExportSettings, ExportStatus, Project};
use crate::services::binary;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, info};

/// Video metadata from FFprobe
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub bitrate: u64,
    pub has_audio: bool,
}

/// Get video metadata using FFprobe
pub async fn get_video_metadata(app: &AppHandle, path: &str) -> Result<VideoMetadata> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let ffprobe_path = ffmpeg_path.parent()
        .map(|p| p.join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" }))
        .unwrap_or_else(|| PathBuf::from(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" }));

    let output = Command::new(&ffprobe_path)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to run ffprobe: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!("ffprobe failed: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_ffprobe_output(&stdout)
}

/// Parse FFprobe JSON output
fn parse_ffprobe_output(output: &str) -> Result<VideoMetadata> {
    let json: serde_json::Value = serde_json::from_str(output)
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to parse ffprobe output: {}", e)))?;

    let streams = json["streams"].as_array()
        .ok_or_else(|| ClipyError::FFmpeg("No streams found".into()))?;

    let mut metadata = VideoMetadata {
        duration: 0.0,
        width: 0,
        height: 0,
        fps: 0.0,
        video_codec: String::new(),
        audio_codec: String::new(),
        bitrate: 0,
        has_audio: false,
    };

    // Parse format info
    if let Some(format) = json["format"].as_object() {
        if let Some(duration) = format.get("duration").and_then(|d| d.as_str()) {
            metadata.duration = duration.parse().unwrap_or(0.0);
        }
        if let Some(bitrate) = format.get("bit_rate").and_then(|b| b.as_str()) {
            metadata.bitrate = bitrate.parse().unwrap_or(0);
        }
    }

    // Parse stream info
    for stream in streams {
        let codec_type = stream["codec_type"].as_str().unwrap_or("");

        if codec_type == "video" && metadata.video_codec.is_empty() {
            metadata.width = stream["width"].as_u64().unwrap_or(0) as u32;
            metadata.height = stream["height"].as_u64().unwrap_or(0) as u32;
            metadata.video_codec = stream["codec_name"].as_str().unwrap_or("").to_string();

            // Parse frame rate
            if let Some(fps_str) = stream["r_frame_rate"].as_str() {
                if let Some((num, den)) = fps_str.split_once('/') {
                    let num: f64 = num.parse().unwrap_or(0.0);
                    let den: f64 = den.parse().unwrap_or(1.0);
                    if den > 0.0 {
                        metadata.fps = num / den;
                    }
                }
            }
        } else if codec_type == "audio" && metadata.audio_codec.is_empty() {
            metadata.audio_codec = stream["codec_name"].as_str().unwrap_or("").to_string();
            metadata.has_audio = true;
        }
    }

    Ok(metadata)
}

/// Generate a thumbnail from a video
pub async fn generate_thumbnail(
    app: &AppHandle,
    video_path: &str,
    output_path: &str,
    time_offset: f64,
) -> Result<()> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    let output = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-ss", &time_offset.to_string(),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            output_path,
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to generate thumbnail: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!("Thumbnail generation failed: {}", stderr)));
    }

    Ok(())
}

/// Generate multiple thumbnails for timeline
pub async fn generate_timeline_thumbnails(
    app: &AppHandle,
    video_path: &str,
    output_dir: &str,
    count: u32,
    width: u32,
) -> Result<Vec<String>> {
    let metadata = get_video_metadata(app, video_path).await?;
    let interval = metadata.duration / count as f64;

    let mut thumbnails = Vec::new();

    for i in 0..count {
        let time = i as f64 * interval;
        let output_path = format!("{}/thumb_{:04}.jpg", output_dir, i);

        generate_thumbnail_at_time(app, video_path, &output_path, time, width).await?;
        thumbnails.push(output_path);
    }

    Ok(thumbnails)
}

/// Generate a thumbnail at a specific time with specific width
async fn generate_thumbnail_at_time(
    app: &AppHandle,
    video_path: &str,
    output_path: &str,
    time: f64,
    width: u32,
) -> Result<()> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    let scale_filter = format!("scale={}:-1", width);

    let output = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-ss", &time.to_string(),
            "-i", video_path,
            "-vframes", "1",
            "-vf", &scale_filter,
            "-q:v", "3",
            output_path,
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to generate thumbnail: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!("Thumbnail generation failed: {}", stderr)));
    }

    Ok(())
}

/// Extract audio waveform data
pub async fn extract_waveform(
    app: &AppHandle,
    video_path: &str,
    samples: u32,
) -> Result<Vec<f32>> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    // Extract raw audio samples
    let output = Command::new(&ffmpeg_path)
        .args([
            "-i", video_path,
            "-ac", "1",
            "-filter:a", &format!("aresample={}", samples),
            "-map", "0:a",
            "-c:a", "pcm_f32le",
            "-f", "f32le",
            "-",
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to extract waveform: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new()); // Return empty waveform if no audio
    }

    // Parse raw f32 samples
    let samples: Vec<f32> = output.stdout
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    // Normalize to 0-1 range
    let max = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    if max > 0.0 {
        Ok(samples.iter().map(|s| s.abs() / max).collect())
    } else {
        Ok(samples)
    }
}

/// Export a project to video file
pub async fn export_project(
    app: &AppHandle,
    project: &Project,
    settings: &ExportSettings,
    progress_tx: mpsc::Sender<ExportProgress>,
) -> Result<PathBuf> {
    info!("Starting project export: {}", project.name);
    debug!("Export settings: resolution={}, fps={}, bitrate={}",
           settings.resolution, settings.fps, settings.video_bitrate);

    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    debug!("Using FFmpeg executable: {:?}", ffmpeg_path);

    // Build FFmpeg filter complex for the project
    let filter_complex = build_filter_complex(project)?;
    debug!("Filter complex: {}", if filter_complex.is_empty() { "<none>" } else { &filter_complex });

    // Build output args
    let mut args = vec![
        "-y".to_string(),
    ];

    // Add inputs
    for track in &project.tracks {
        for clip in &track.clips {
            args.push("-i".to_string());
            args.push(clip.source_path.clone());
        }
    }

    // Add filter complex
    if !filter_complex.is_empty() {
        args.push("-filter_complex".to_string());
        args.push(filter_complex);
    }

    // Add output settings
    args.extend(build_output_args(settings));
    args.push(settings.output_path.clone());

    debug!("FFmpeg export args: {:?}", args);

    // Send initial progress
    let _ = progress_tx.send(ExportProgress {
        project_id: project.id.clone(),
        progress: 0.0,
        current_frame: 0,
        total_frames: (project.duration * settings.fps as f64) as u64,
        elapsed_time: 0,
        estimated_time: 0,
        status: ExportStatus::Preparing,
        error: None,
    }).await;

    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to spawn ffmpeg: {}", e)))?;

    let stderr = child.stderr.take()
        .ok_or_else(|| ClipyError::FFmpeg("Failed to capture stderr".into()))?;

    let mut reader = BufReader::new(stderr).lines();
    let total_frames = (project.duration * settings.fps as f64) as u64;
    let start_time = std::time::Instant::now();

    // Update status to exporting
    let _ = progress_tx.send(ExportProgress {
        project_id: project.id.clone(),
        progress: 0.0,
        current_frame: 0,
        total_frames,
        elapsed_time: 0,
        estimated_time: 0,
        status: ExportStatus::Exporting,
        error: None,
    }).await;

    // Parse progress from FFmpeg output
    while let Ok(Some(line)) = reader.next_line().await {
        if let Some(frame) = parse_ffmpeg_progress(&line) {
            let progress = (frame as f64 / total_frames as f64 * 100.0).min(100.0);
            let elapsed = start_time.elapsed().as_secs();
            let estimated = if progress > 0.0 {
                ((elapsed as f64 / progress) * 100.0) as u64 - elapsed
            } else {
                0
            };

            let _ = progress_tx.send(ExportProgress {
                project_id: project.id.clone(),
                progress,
                current_frame: frame,
                total_frames,
                elapsed_time: elapsed,
                estimated_time: estimated,
                status: ExportStatus::Exporting,
                error: None,
            }).await;
        }
    }

    let status = child.wait()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to wait for ffmpeg: {}", e)))?;

    if !status.success() {
        let _ = progress_tx.send(ExportProgress {
            project_id: project.id.clone(),
            progress: 0.0,
            current_frame: 0,
            total_frames,
            elapsed_time: start_time.elapsed().as_secs(),
            estimated_time: 0,
            status: ExportStatus::Failed,
            error: Some("Export failed".into()),
        }).await;

        return Err(ClipyError::FFmpeg("Export failed".into()));
    }

    // Send completion
    let _ = progress_tx.send(ExportProgress {
        project_id: project.id.clone(),
        progress: 100.0,
        current_frame: total_frames,
        total_frames,
        elapsed_time: start_time.elapsed().as_secs(),
        estimated_time: 0,
        status: ExportStatus::Completed,
        error: None,
    }).await;

    info!("Export completed: {}", settings.output_path);
    Ok(PathBuf::from(&settings.output_path))
}

/// Build FFmpeg filter complex from project
fn build_filter_complex(project: &Project) -> Result<String> {
    // This is a simplified version - a full implementation would handle
    // all the track/clip operations, transitions, effects, etc.

    let mut filters = Vec::new();
    let mut input_idx = 0;

    for (track_idx, track) in project.tracks.iter().enumerate() {
        for (clip_idx, clip) in track.clips.iter().enumerate() {
            let label = format!("t{}c{}", track_idx, clip_idx);

            // Trim filter
            let trim = format!(
                "[{}:v]trim=start={}:end={},setpts=PTS-STARTPTS[{}]",
                input_idx,
                clip.source_start,
                clip.source_end,
                label
            );
            filters.push(trim);

            input_idx += 1;
        }
    }

    Ok(filters.join(";"))
}

/// Build FFmpeg output arguments from export settings
fn build_output_args(settings: &ExportSettings) -> Vec<String> {
    let mut args = Vec::new();

    // Video codec
    args.push("-c:v".to_string());
    if settings.use_hardware_acceleration {
        args.push("h264_nvenc".to_string()); // NVIDIA, could also use h264_qsv for Intel
    } else {
        args.push("libx264".to_string());
    }

    // Video bitrate
    args.push("-b:v".to_string());
    args.push(format!("{}k", settings.video_bitrate));

    // Audio codec and bitrate
    args.push("-c:a".to_string());
    args.push("aac".to_string());
    args.push("-b:a".to_string());
    args.push(format!("{}k", settings.audio_bitrate));

    // Frame rate
    args.push("-r".to_string());
    args.push(settings.fps.to_string());

    // Preset (balance speed vs quality)
    args.push("-preset".to_string());
    match settings.quality.as_str() {
        "low" => args.push("veryfast".to_string()),
        "medium" => args.push("medium".to_string()),
        "high" => args.push("slow".to_string()),
        _ => args.push("medium".to_string()),
    }

    args
}

/// Parse FFmpeg progress from stderr line
fn parse_ffmpeg_progress(line: &str) -> Option<u64> {
    // FFmpeg progress format: frame=  123 fps=...
    if line.starts_with("frame=") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if let Some(frame_str) = parts.get(0) {
            if let Some(num_str) = frame_str.strip_prefix("frame=") {
                return num_str.parse().ok();
            }
        }
    }
    None
}

/// Transcode a video file
pub async fn transcode_video(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    settings: &ExportSettings,
) -> Result<()> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        input_path.to_string(),
    ];

    args.extend(build_output_args(settings));
    args.push(output_path.to_string());

    let output = Command::new(&ffmpeg_path)
        .args(&args)
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to transcode: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!("Transcode failed: {}", stderr)));
    }

    Ok(())
}
