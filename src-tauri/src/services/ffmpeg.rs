//! FFmpeg service for video processing and encoding

use crate::error::{ClipyError, Result};
use crate::models::project::{
    ClipType, ExportProgress, ExportSettings, ExportStatus, Project, TextAlign, TrackType,
    VerticalAlign,
};
use crate::services::binary;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

/// Tracks whether an export has been asked to cancel. `cancel_export` sets this,
/// the export loop observes it, kills ffmpeg, and reports `Cancelled` (not `Failed`).
static EXPORT_CANCEL: AtomicBool = AtomicBool::new(false);

/// Request cancellation of the in-flight export.
pub fn request_export_cancel() {
    EXPORT_CANCEL.store(true, Ordering::SeqCst);
}

/// Clear any pending cancel flag (called at the start of a new export).
fn clear_export_cancel() {
    EXPORT_CANCEL.store(false, Ordering::SeqCst);
}

fn export_cancelled() -> bool {
    EXPORT_CANCEL.load(Ordering::SeqCst)
}

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
    let ffprobe_path = ffmpeg_path
        .parent()
        .map(|p| {
            p.join(if cfg!(windows) {
                "ffprobe.exe"
            } else {
                "ffprobe"
            })
        })
        .unwrap_or_else(|| {
            PathBuf::from(if cfg!(windows) {
                "ffprobe.exe"
            } else {
                "ffprobe"
            })
        });

    let output = Command::new(&ffprobe_path)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
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

    let streams = json["streams"]
        .as_array()
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
            "-ss",
            &time_offset.to_string(),
            "-i",
            video_path,
            "-vframes",
            "1",
            "-q:v",
            "2",
            output_path,
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to generate thumbnail: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!(
            "Thumbnail generation failed: {}",
            stderr
        )));
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
            "-ss",
            &time.to_string(),
            "-i",
            video_path,
            "-vframes",
            "1",
            "-vf",
            &scale_filter,
            "-q:v",
            "3",
            output_path,
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to generate thumbnail: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!(
            "Thumbnail generation failed: {}",
            stderr
        )));
    }

    Ok(())
}

/// Extract audio waveform data
pub async fn extract_waveform(app: &AppHandle, video_path: &str, samples: u32) -> Result<Vec<f32>> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    // Extract raw audio samples
    let output = Command::new(&ffmpeg_path)
        .args([
            "-i",
            video_path,
            "-ac",
            "1",
            "-filter:a",
            &format!("aresample={}", samples),
            "-map",
            "0:a",
            "-c:a",
            "pcm_f32le",
            "-f",
            "f32le",
            "-",
        ])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to extract waveform: {}", e)))?;

    if !output.status.success() {
        return Ok(Vec::new()); // Return empty waveform if no audio
    }

    // Parse raw f32 samples
    let samples: Vec<f32> = output
        .stdout
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

/// Resolution of the export canvas in pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Canvas {
    width: u32,
    height: u32,
}

/// Resolve the output canvas from settings/project. Accepts "WxH", named ids
/// ("1080p"), or "original" (falls back to the project settings).
fn resolve_canvas(project: &Project, settings: &ExportSettings) -> Canvas {
    let from_project = Canvas {
        width: project.settings.width.max(2),
        height: project.settings.height.max(2),
    };

    let res = settings.resolution.trim().to_lowercase();
    if res.is_empty() || res == "original" || res == "source" {
        return from_project;
    }

    // "WxH"
    if let Some((w, h)) = res.split_once('x') {
        if let (Ok(w), Ok(h)) = (w.trim().parse::<u32>(), h.trim().parse::<u32>()) {
            if w >= 2 && h >= 2 {
                return Canvas {
                    width: w,
                    height: h,
                };
            }
        }
    }

    // Named presets
    match res.as_str() {
        "2160p" | "4k" => Canvas {
            width: 3840,
            height: 2160,
        },
        "1440p" | "2k" => Canvas {
            width: 2560,
            height: 1440,
        },
        "1080p" | "fhd" => Canvas {
            width: 1920,
            height: 1080,
        },
        "720p" | "hd" => Canvas {
            width: 1280,
            height: 720,
        },
        "480p" | "sd" => Canvas {
            width: 854,
            height: 480,
        },
        _ => from_project,
    }
}

/// A flattened, in-order list of the clips ffmpeg will consume, paired with the
/// 0-based ffmpeg input index assigned to each.
struct PlannedClip<'a> {
    input_idx: usize,
    clip: &'a crate::models::project::Clip,
    is_video_track: bool,
    is_audio_track: bool,
    track_muted: bool,
    track_volume: f64,
}

/// Export a project to a video file.
///
/// Builds a real filter graph: every visual clip is trimmed, scaled+padded to
/// the canvas, opacity/transform applied, then concatenated in timeline order;
/// audio clips are trimmed, volume-adjusted and mixed; text clips are drawn with
/// `drawtext`. Encoder is chosen by hardware-accel detection with a software
/// fallback. Progress is read from `-progress pipe:1` for reliability.
pub async fn export_project(
    app: &AppHandle,
    project: &Project,
    settings: &ExportSettings,
    progress_tx: mpsc::Sender<ExportProgress>,
) -> Result<PathBuf> {
    info!("Starting project export: {}", project.name);
    clear_export_cancel();

    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    debug!("Using FFmpeg executable: {:?}", ffmpeg_path);

    let canvas = resolve_canvas(project, settings);
    let total_frames = ((project.duration.max(0.0)) * settings.fps as f64).ceil() as u64;

    let _ = progress_tx
        .send(make_progress(
            project,
            0.0,
            0,
            total_frames,
            0,
            0,
            ExportStatus::Preparing,
        ))
        .await;

    // Plan inputs in deterministic order: tracks top-to-bottom, clips in order.
    let mut planned: Vec<PlannedClip> = Vec::new();
    let mut input_idx = 0usize;
    for track in &project.tracks {
        let is_video_track = matches!(track.track_type, TrackType::Video | TrackType::Effect);
        let is_audio_track = matches!(track.track_type, TrackType::Audio);
        for clip in &track.clips {
            // Text clips have no source file; they are overlays, not inputs.
            if clip.clip_type == ClipType::Text {
                continue;
            }
            planned.push(PlannedClip {
                input_idx,
                clip,
                is_video_track,
                is_audio_track,
                track_muted: track.muted,
                track_volume: track.volume,
            });
            input_idx += 1;
        }
    }

    // Build the filter graph + the labels we will map.
    let graph = build_filter_graph(project, &planned, canvas);

    // Assemble args.
    let mut args: Vec<String> = vec!["-y".to_string()];
    for p in &planned {
        args.push("-i".to_string());
        args.push(p.clip.source_path.clone());
    }

    // If there are no real inputs (e.g. a text-only/empty project) we synthesize
    // a blank canvas so the export still produces a valid file.
    let synthesize_blank = planned.is_empty();
    if synthesize_blank {
        args.push("-f".to_string());
        args.push("lavfi".to_string());
        args.push("-i".to_string());
        args.push(format!(
            "color=c=black:s={}x{}:r={}:d={}",
            canvas.width,
            canvas.height,
            settings.fps,
            project.duration.max(0.1)
        ));
    }

    if !graph.filter.is_empty() {
        args.push("-filter_complex".to_string());
        args.push(graph.filter.clone());
    }

    // Map the produced video/audio (or fall back to the blank input).
    if let Some(ref v) = graph.video_label {
        args.push("-map".to_string());
        args.push(format!("[{}]", v));
    } else if synthesize_blank {
        args.push("-map".to_string());
        args.push("0:v".to_string());
    }
    if let Some(ref a) = graph.audio_label {
        args.push("-map".to_string());
        args.push(format!("[{}]", a));
    }

    let has_audio = graph.audio_label.is_some();
    let encoder = select_video_encoder(app, settings.use_hardware_acceleration).await;
    args.extend(build_output_args(settings, &encoder, has_audio));
    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
    args.push("-nostats".to_string());
    args.push(settings.output_path.clone());

    debug!("FFmpeg export args: {:?}", args);

    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to spawn ffmpeg: {}", e)))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ClipyError::FFmpeg("Failed to capture stdout".into()))?;
    // Drain stderr so the pipe never fills and blocks ffmpeg; keep the tail for errors.
    let stderr = child.stderr.take();
    let stderr_handle = stderr.map(|s| {
        tokio::spawn(async move {
            let mut lines = BufReader::new(s).lines();
            let mut tail: Vec<String> = Vec::new();
            while let Ok(Some(line)) = lines.next_line().await {
                tail.push(line);
                if tail.len() > 20 {
                    tail.remove(0);
                }
            }
            tail.join("\n")
        })
    });

    let start_time = std::time::Instant::now();
    let _ = progress_tx
        .send(make_progress(
            project,
            0.0,
            0,
            total_frames,
            0,
            0,
            ExportStatus::Exporting,
        ))
        .await;

    let mut reader = BufReader::new(stdout).lines();
    let mut last_frame: u64 = 0;
    let mut cancelled = false;

    loop {
        // Honor cancellation requests promptly.
        if export_cancelled() {
            cancelled = true;
            let _ = child.start_kill();
            break;
        }

        match reader.next_line().await {
            Ok(Some(line)) => {
                if let Some((key, value)) = line.split_once('=') {
                    match key.trim() {
                        "frame" => {
                            if let Ok(frame) = value.trim().parse::<u64>() {
                                last_frame = frame;
                                let progress = if total_frames > 0 {
                                    (frame as f64 / total_frames as f64 * 100.0).min(99.9)
                                } else {
                                    0.0
                                };
                                let elapsed = start_time.elapsed().as_secs();
                                let estimated = if progress > 0.0 {
                                    (((elapsed as f64 / progress) * 100.0) as u64)
                                        .saturating_sub(elapsed)
                                } else {
                                    0
                                };
                                let _ = progress_tx
                                    .send(make_progress(
                                        project,
                                        progress,
                                        frame,
                                        total_frames,
                                        elapsed,
                                        estimated,
                                        ExportStatus::Exporting,
                                    ))
                                    .await;
                            }
                        }
                        "progress" if value.trim() == "end" => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Ok(None) => break,
            Err(_) => break,
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to wait for ffmpeg: {}", e)))?;

    let stderr_tail = match stderr_handle {
        Some(h) => h.await.unwrap_or_default(),
        None => String::new(),
    };

    if cancelled || export_cancelled() {
        clear_export_cancel();
        let _ = std::fs::remove_file(&settings.output_path);
        let _ = progress_tx
            .send(make_progress(
                project,
                0.0,
                last_frame,
                total_frames,
                start_time.elapsed().as_secs(),
                0,
                ExportStatus::Cancelled,
            ))
            .await;
        return Err(ClipyError::ExportFailed("Export cancelled".into()));
    }

    if !status.success() {
        warn!("ffmpeg export failed: {}", stderr_tail);
        let _ = progress_tx
            .send(ExportProgress {
                error: Some(if stderr_tail.is_empty() {
                    "Export failed".into()
                } else {
                    stderr_tail.clone()
                }),
                ..make_progress(
                    project,
                    0.0,
                    last_frame,
                    total_frames,
                    start_time.elapsed().as_secs(),
                    0,
                    ExportStatus::Failed,
                )
            })
            .await;
        return Err(ClipyError::FFmpeg(format!(
            "Export failed: {}",
            if stderr_tail.is_empty() {
                "unknown error"
            } else {
                &stderr_tail
            }
        )));
    }

    let _ = progress_tx
        .send(make_progress(
            project,
            100.0,
            total_frames,
            total_frames,
            start_time.elapsed().as_secs(),
            0,
            ExportStatus::Completed,
        ))
        .await;

    info!("Export completed: {}", settings.output_path);
    Ok(PathBuf::from(&settings.output_path))
}

/// Helper to construct an `ExportProgress` with the common fields filled in.
fn make_progress(
    project: &Project,
    progress: f64,
    current_frame: u64,
    total_frames: u64,
    elapsed_time: u64,
    estimated_time: u64,
    status: ExportStatus,
) -> ExportProgress {
    ExportProgress {
        project_id: project.id.clone(),
        progress,
        current_frame,
        total_frames,
        elapsed_time,
        estimated_time,
        status,
        error: None,
    }
}

/// The result of building a filter graph: the filter string plus the labels to
/// map for video and audio (None means that stream type is absent).
struct FilterGraph {
    filter: String,
    video_label: Option<String>,
    audio_label: Option<String>,
}

/// Build a real ffmpeg `-filter_complex` graph from the project timeline.
fn build_filter_graph(project: &Project, planned: &[PlannedClip], canvas: Canvas) -> FilterGraph {
    let mut parts: Vec<String> = Vec::new();
    let mut video_labels: Vec<String> = Vec::new();
    let mut audio_labels: Vec<String> = Vec::new();

    for p in planned {
        let clip = p.clip;
        let speed = if clip.properties.speed > 0.0 {
            clip.properties.speed
        } else {
            1.0
        };

        // Video / image clips on a visual track -> trim, scale, pad, opacity.
        if p.is_video_track && matches!(clip.clip_type, ClipType::Video | ClipType::Image) {
            let label = format!("v{}", p.input_idx);
            let mut chain = format!("[{}:v]", p.input_idx);

            if clip.clip_type == ClipType::Image {
                // Images have no timeline; just scale/pad.
            } else {
                chain.push_str(&format!(
                    "trim=start={}:end={},setpts=PTS-STARTPTS,",
                    clip.source_start, clip.source_end
                ));
                if (speed - 1.0).abs() > f64::EPSILON {
                    chain.push_str(&format!("setpts={}*PTS,", 1.0 / speed));
                }
            }

            chain.push_str(&format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p",
                w = canvas.width,
                h = canvas.height,
                fps = project.settings.fps
            ));

            let opacity = clip.properties.opacity.clamp(0.0, 1.0);
            if opacity < 1.0 {
                chain.push_str(&format!(",format=yuva420p,colorchannelmixer=aa={opacity}"));
            }

            chain.push_str(&format!("[{}]", label));
            parts.push(chain);
            video_labels.push(label);
        }

        // Audio: from audio-track clips, or the audio of video clips on a video track.
        let wants_audio = (p.is_audio_track && matches!(clip.clip_type, ClipType::Audio))
            || (p.is_video_track && clip.clip_type == ClipType::Video);
        if wants_audio && !p.track_muted {
            let label = format!("a{}", p.input_idx);
            let vol = (clip.properties.volume * p.track_volume).max(0.0);
            let mut chain = format!(
                "[{}:a]atrim=start={}:end={},asetpts=PTS-STARTPTS",
                p.input_idx, clip.source_start, clip.source_end
            );
            if (speed - 1.0).abs() > f64::EPSILON {
                chain.push_str(&format!(",atempo={}", clamp_atempo(speed)));
            }
            if (vol - 1.0).abs() > f64::EPSILON {
                chain.push_str(&format!(",volume={vol}"));
            }
            chain.push_str(&format!(",aresample=async=1:first_pts=0[{}]", label));
            parts.push(chain);
            audio_labels.push(label);
        }
    }

    // Concatenate video clips in order.
    let mut final_video: Option<String> = None;
    if !video_labels.is_empty() {
        let inputs: String = video_labels.iter().map(|l| format!("[{}]", l)).collect();
        if video_labels.len() == 1 {
            final_video = Some(video_labels[0].clone());
        } else {
            parts.push(format!(
                "{}concat=n={}:v=1:a=0[vcat]",
                inputs,
                video_labels.len()
            ));
            final_video = Some("vcat".to_string());
        }
    }

    // Overlay text clips with drawtext on top of the concatenated video.
    if let Some(base) = final_video.clone() {
        let mut current = base;
        let mut text_idx = 0;
        for track in &project.tracks {
            for clip in &track.clips {
                if clip.clip_type != ClipType::Text {
                    continue;
                }
                if let Some(text) = &clip.properties.text {
                    let out = format!("vtxt{}", text_idx);
                    let draw = build_drawtext(text, clip.start_time, clip.end_time, canvas);
                    parts.push(format!("[{}]{}[{}]", current, draw, out));
                    current = out;
                    text_idx += 1;
                }
            }
        }
        final_video = Some(current);
    }

    // Mix audio tracks together.
    let mut final_audio: Option<String> = None;
    if audio_labels.len() == 1 {
        final_audio = Some(audio_labels[0].clone());
    } else if audio_labels.len() > 1 {
        let inputs: String = audio_labels.iter().map(|l| format!("[{}]", l)).collect();
        parts.push(format!(
            "{}amix=inputs={}:normalize=0[amix]",
            inputs,
            audio_labels.len()
        ));
        final_audio = Some("amix".to_string());
    }

    FilterGraph {
        filter: parts.join(";"),
        video_label: final_video,
        audio_label: final_audio,
    }
}

/// `atempo` only accepts 0.5..=2.0 per stage; clamp to the valid single-stage range.
fn clamp_atempo(speed: f64) -> f64 {
    speed.clamp(0.5, 2.0)
}

/// Escape a string for use inside ffmpeg drawtext `text='...'`.
fn escape_drawtext(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\u{2019}") // curly apostrophe avoids quote-escaping hell
        .replace('%', "\\%")
}

/// Build a `drawtext` filter for a text clip, timed to [start,end].
fn build_drawtext(
    text: &crate::models::project::TextProperties,
    start: f64,
    end: f64,
    canvas: Canvas,
) -> String {
    let content = escape_drawtext(&text.content);
    let x = match text.align {
        TextAlign::Left => format!("{}", canvas.width / 20),
        TextAlign::Center => "(w-text_w)/2".to_string(),
        TextAlign::Right => format!("w-text_w-{}", canvas.width / 20),
    };
    let y = match text.vertical_align {
        VerticalAlign::Top => format!("{}", canvas.height / 20),
        VerticalAlign::Middle => "(h-text_h)/2".to_string(),
        VerticalAlign::Bottom => format!("h-text_h-{}", canvas.height / 20),
    };
    let color = normalize_color(&text.color);
    let mut d = format!(
        "drawtext=text='{}':fontcolor={}:fontsize={}:x={}:y={}",
        content, color, text.font_size, x, y
    );
    // Background box when a non-transparent background color is provided.
    let bg = text.background_color.trim();
    if !bg.is_empty() && bg.to_lowercase() != "transparent" && bg.to_lowercase() != "none" {
        d.push_str(&format!(
            ":box=1:boxcolor={}:boxborderw=10",
            normalize_color(bg)
        ));
    }
    d.push_str(&format!(":enable='between(t,{},{})'", start, end));
    d
}

/// Normalize a CSS-ish color to something ffmpeg accepts (`#rrggbb` -> `0xrrggbb`).
fn normalize_color(c: &str) -> String {
    let c = c.trim();
    if let Some(hex) = c.strip_prefix('#') {
        format!("0x{}", hex)
    } else {
        c.to_string()
    }
}

/// Chosen video encoder plus whether it is hardware-accelerated.
#[derive(Debug, Clone)]
struct EncoderChoice {
    name: String,
    hardware: bool,
}

/// Pick an encoder. When hardware accel is requested, probe ffmpeg's encoder
/// list and pick the first available platform HW encoder; otherwise fall back
/// to libx264 (software) so export never hard-fails on machines without NVENC.
async fn select_video_encoder(app: &AppHandle, want_hw: bool) -> EncoderChoice {
    if !want_hw {
        return EncoderChoice {
            name: "libx264".to_string(),
            hardware: false,
        };
    }

    let available = list_ffmpeg_encoders(app).await.unwrap_or_default();
    // Preference order varies by platform; only pick ones ffmpeg reports.
    let candidates: &[&str] = if cfg!(target_os = "macos") {
        &["h264_videotoolbox", "h264_nvenc", "h264_qsv"]
    } else if cfg!(target_os = "windows") {
        &["h264_nvenc", "h264_qsv", "h264_amf"]
    } else {
        &["h264_nvenc", "h264_vaapi", "h264_qsv"]
    };

    for cand in candidates {
        if available.iter().any(|e| e == cand) {
            debug!("Selected hardware encoder: {}", cand);
            return EncoderChoice {
                name: (*cand).to_string(),
                hardware: true,
            };
        }
    }

    warn!("No hardware H.264 encoder available; falling back to libx264");
    EncoderChoice {
        name: "libx264".to_string(),
        hardware: false,
    }
}

/// Cache of ffmpeg-reported encoder names (probing is relatively expensive).
static ENCODER_CACHE: OnceLock<Vec<String>> = OnceLock::new();

/// Query `ffmpeg -encoders` and return the list of encoder names.
async fn list_ffmpeg_encoders(app: &AppHandle) -> Result<Vec<String>> {
    if let Some(cached) = ENCODER_CACHE.get() {
        return Ok(cached.clone());
    }
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let output = Command::new(&ffmpeg_path)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to list encoders: {}", e)))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut names = Vec::new();
    for line in stdout.lines() {
        // Lines look like: " V....D h264_nvenc           NVIDIA NVENC ..."
        let trimmed = line.trim_start();
        if trimmed.starts_with('V') || trimmed.starts_with('A') {
            if let Some(name) = trimmed.split_whitespace().nth(1) {
                names.push(name.to_string());
            }
        }
    }
    let _ = ENCODER_CACHE.set(names.clone());
    Ok(names)
}

/// Build FFmpeg output arguments from export settings and the chosen encoder.
fn build_output_args(
    settings: &ExportSettings,
    encoder: &EncoderChoice,
    has_audio: bool,
) -> Vec<String> {
    let mut args = Vec::new();

    // Video codec (chosen by format, then encoder selection for H.264 family).
    args.push("-c:v".to_string());
    match settings.format.to_lowercase().as_str() {
        "webm" => args.push("libvpx-vp9".to_string()),
        // mp4/mov/mkv all use the selected H.264 encoder.
        _ => args.push(encoder.name.clone()),
    }

    // Bitrate (skip for GIF which has its own pipeline; we keep mp4/webm/mov/mkv here).
    args.push("-b:v".to_string());
    args.push(format!("{}k", settings.video_bitrate));

    // Preset: software x264/vp9 use named presets; HW encoders use their own.
    if encoder.name == "libx264" {
        args.push("-preset".to_string());
        args.push(
            match settings.quality.as_str() {
                "low" => "veryfast",
                "high" => "slow",
                _ => "medium",
            }
            .to_string(),
        );
    } else if encoder.hardware && encoder.name == "h264_nvenc" {
        args.push("-preset".to_string());
        args.push("p4".to_string());
    }

    // Audio.
    if has_audio {
        args.push("-c:a".to_string());
        if settings.format.eq_ignore_ascii_case("webm") {
            args.push("libopus".to_string());
        } else {
            args.push("aac".to_string());
        }
        args.push("-b:a".to_string());
        args.push(format!("{}k", settings.audio_bitrate));
    }

    // Frame rate.
    args.push("-r".to_string());
    args.push(settings.fps.to_string());

    // mp4/mov: enable streaming-friendly moov atom.
    if matches!(settings.format.to_lowercase().as_str(), "mp4" | "mov") {
        args.push("-movflags".to_string());
        args.push("+faststart".to_string());
    }

    args.push("-pix_fmt".to_string());
    args.push("yuv420p".to_string());

    args
}

/// Transcode a video file
pub async fn transcode_video(
    app: &AppHandle,
    input_path: &str,
    output_path: &str,
    settings: &ExportSettings,
) -> Result<()> {
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;

    let mut args = vec!["-y".to_string(), "-i".to_string(), input_path.to_string()];

    // Transcode preserves both streams; detect encoder with software fallback.
    let encoder = select_video_encoder(app, settings.use_hardware_acceleration).await;
    args.extend(build_output_args(settings, &encoder, true));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::project::{
        Clip, ClipProperties, ClipType, ProjectSettings, TextAlign, TextProperties, Track,
        TrackType, Transform, VerticalAlign,
    };

    fn base_project() -> Project {
        Project {
            id: "p1".into(),
            name: "Test".into(),
            created_at: "2024-01-01T00:00:00Z".into(),
            modified_at: "2024-01-01T00:00:00Z".into(),
            duration: 10.0,
            tracks: Vec::new(),
            settings: ProjectSettings {
                width: 1280,
                height: 720,
                fps: 30,
                sample_rate: 48000,
            },
        }
    }

    fn base_settings() -> ExportSettings {
        ExportSettings::default()
    }

    fn clip(clip_type: ClipType, source_path: &str) -> Clip {
        Clip {
            id: "c".into(),
            track_id: "t".into(),
            clip_type,
            name: "clip".into(),
            start_time: 0.0,
            end_time: 5.0,
            source_start: 1.0,
            source_end: 4.0,
            source_path: source_path.into(),
            thumbnails: Vec::new(),
            properties: ClipProperties::default(),
        }
    }

    fn track(track_type: TrackType, clips: Vec<Clip>) -> Track {
        Track {
            id: "tr".into(),
            track_type,
            name: "track".into(),
            clips,
            muted: false,
            locked: false,
            volume: 1.0,
            height: 80,
        }
    }

    // ---- resolve_canvas ----

    #[test]
    fn resolve_canvas_wxh() {
        let p = base_project();
        let mut s = base_settings();
        s.resolution = "640x480".into();
        assert_eq!(
            resolve_canvas(&p, &s),
            Canvas {
                width: 640,
                height: 480
            }
        );
    }

    #[test]
    fn resolve_canvas_named_presets() {
        let p = base_project();
        let cases = [
            ("1080p", 1920, 1080),
            ("fhd", 1920, 1080),
            ("4k", 3840, 2160),
            ("2160p", 3840, 2160),
            ("1440p", 2560, 1440),
            ("2k", 2560, 1440),
            ("720p", 1280, 720),
            ("hd", 1280, 720),
            ("480p", 854, 480),
            ("sd", 854, 480),
        ];
        for (res, w, h) in cases {
            let mut s = base_settings();
            s.resolution = res.into();
            assert_eq!(
                resolve_canvas(&p, &s),
                Canvas {
                    width: w,
                    height: h
                },
                "preset {res}"
            );
        }
    }

    #[test]
    fn resolve_canvas_case_insensitive() {
        let p = base_project();
        let mut s = base_settings();
        s.resolution = "1080P".into();
        assert_eq!(
            resolve_canvas(&p, &s),
            Canvas {
                width: 1920,
                height: 1080
            }
        );
    }

    #[test]
    fn resolve_canvas_original_and_empty_use_project() {
        let p = base_project();
        for res in ["", "original", "source", "  "] {
            let mut s = base_settings();
            s.resolution = res.into();
            assert_eq!(
                resolve_canvas(&p, &s),
                Canvas {
                    width: 1280,
                    height: 720
                },
                "res {res:?}"
            );
        }
    }

    #[test]
    fn resolve_canvas_junk_falls_back_to_project() {
        let p = base_project();
        let mut s = base_settings();
        s.resolution = "garbage".into();
        assert_eq!(
            resolve_canvas(&p, &s),
            Canvas {
                width: 1280,
                height: 720
            }
        );
    }

    #[test]
    fn resolve_canvas_invalid_wxh_falls_back() {
        let p = base_project();
        // Too-small dims (< 2) are rejected and fall through to preset match -> project.
        let mut s = base_settings();
        s.resolution = "1x1".into();
        assert_eq!(
            resolve_canvas(&p, &s),
            Canvas {
                width: 1280,
                height: 720
            }
        );
    }

    // ---- parse_ffprobe_output ----

    #[test]
    fn parse_ffprobe_valid_video_and_audio() {
        let json = r#"{
            "format": {"duration": "12.5", "bit_rate": "800000"},
            "streams": [
                {"codec_type": "video", "width": 1920, "height": 1080,
                 "codec_name": "h264", "r_frame_rate": "30000/1001"},
                {"codec_type": "audio", "codec_name": "aac"}
            ]
        }"#;
        let m = parse_ffprobe_output(json).unwrap();
        assert_eq!(m.duration, 12.5);
        assert_eq!(m.bitrate, 800000);
        assert_eq!(m.width, 1920);
        assert_eq!(m.height, 1080);
        assert_eq!(m.video_codec, "h264");
        assert_eq!(m.audio_codec, "aac");
        assert!(m.has_audio);
        // 30000/1001 ~= 29.97
        assert!((m.fps - 29.97).abs() < 0.01);
    }

    #[test]
    fn parse_ffprobe_missing_streams_is_err() {
        let json = r#"{"format": {"duration": "5"}}"#;
        assert!(parse_ffprobe_output(json).is_err());
    }

    #[test]
    fn parse_ffprobe_invalid_json_is_err() {
        assert!(parse_ffprobe_output("not json").is_err());
    }

    #[test]
    fn parse_ffprobe_video_only_has_no_audio() {
        let json = r#"{
            "format": {"duration": "1"},
            "streams": [{"codec_type": "video", "width": 100, "height": 50,
                         "codec_name": "vp9", "r_frame_rate": "25/1"}]
        }"#;
        let m = parse_ffprobe_output(json).unwrap();
        assert!(!m.has_audio);
        assert_eq!(m.fps, 25.0);
        assert_eq!(m.audio_codec, "");
    }

    // ---- clamp_atempo ----

    #[test]
    fn clamp_atempo_range() {
        assert_eq!(clamp_atempo(1.0), 1.0);
        assert_eq!(clamp_atempo(0.1), 0.5);
        assert_eq!(clamp_atempo(5.0), 2.0);
        assert_eq!(clamp_atempo(0.5), 0.5);
        assert_eq!(clamp_atempo(2.0), 2.0);
    }

    // ---- escape_drawtext ----

    #[test]
    fn escape_drawtext_special_chars() {
        assert_eq!(escape_drawtext("a:b"), "a\\:b");
        assert_eq!(escape_drawtext("a\\b"), "a\\\\b");
        assert_eq!(escape_drawtext("50%"), "50\\%");
        // Single quote becomes a curly apostrophe.
        assert_eq!(escape_drawtext("it's"), "it\u{2019}s");
    }

    #[test]
    fn escape_drawtext_backslash_before_colon() {
        // Backslash is escaped first, then colon -> "\\\\\\:"
        assert_eq!(escape_drawtext("\\:"), "\\\\\\:");
    }

    // ---- normalize_color ----

    #[test]
    fn normalize_color_hex_and_named() {
        assert_eq!(normalize_color("#ffffff"), "0xffffff");
        assert_eq!(normalize_color("#000"), "0x000");
        assert_eq!(normalize_color("white"), "white");
        assert_eq!(normalize_color(" red "), "red");
    }

    // ---- build_output_args ----

    fn enc(name: &str, hardware: bool) -> EncoderChoice {
        EncoderChoice {
            name: name.into(),
            hardware,
        }
    }

    #[test]
    fn build_output_args_libx264_has_preset() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.quality = "high".into();
        let args = build_output_args(&s, &enc("libx264", false), true);
        assert!(args.windows(2).any(|w| w == ["-c:v", "libx264"]));
        assert!(args.windows(2).any(|w| w == ["-preset", "slow"]));
        // mp4 -> faststart + yuv420p + aac audio.
        assert!(args.windows(2).any(|w| w == ["-movflags", "+faststart"]));
        assert!(args.windows(2).any(|w| w == ["-pix_fmt", "yuv420p"]));
        assert!(args.windows(2).any(|w| w == ["-c:a", "aac"]));
    }

    #[test]
    fn build_output_args_webm_uses_vp9_and_opus() {
        let mut s = base_settings();
        s.format = "webm".into();
        let args = build_output_args(&s, &enc("libx264", false), true);
        assert!(args.windows(2).any(|w| w == ["-c:v", "libvpx-vp9"]));
        assert!(args.windows(2).any(|w| w == ["-c:a", "libopus"]));
        // webm should NOT add faststart.
        assert!(!args.iter().any(|a| a == "+faststart"));
    }

    #[test]
    fn build_output_args_no_audio_omits_audio_args() {
        let mut s = base_settings();
        s.format = "mp4".into();
        let args = build_output_args(&s, &enc("libx264", false), false);
        assert!(!args.iter().any(|a| a == "-c:a"));
        assert!(!args.iter().any(|a| a == "-b:a"));
    }

    #[test]
    fn build_output_args_quality_presets() {
        for (q, expected) in [("low", "veryfast"), ("high", "slow"), ("medium", "medium")] {
            let mut s = base_settings();
            s.quality = q.into();
            let args = build_output_args(&s, &enc("libx264", false), false);
            assert!(
                args.windows(2).any(|w| w == ["-preset", expected]),
                "quality {q} -> {expected}"
            );
        }
    }

    #[test]
    fn build_output_args_nvenc_uses_p4_preset() {
        let s = base_settings();
        let args = build_output_args(&s, &enc("h264_nvenc", true), false);
        assert!(args.windows(2).any(|w| w == ["-c:v", "h264_nvenc"]));
        assert!(args.windows(2).any(|w| w == ["-preset", "p4"]));
    }

    // ---- build_filter_graph ----
    //
    // build_filter_graph consumes a slice of PlannedClip referencing project
    // clips. We mirror export_project's planning to build them.

    fn plan<'a>(project: &'a Project) -> Vec<PlannedClip<'a>> {
        let mut planned = Vec::new();
        let mut idx = 0usize;
        for tr in &project.tracks {
            let is_video_track = matches!(tr.track_type, TrackType::Video | TrackType::Effect);
            let is_audio_track = matches!(tr.track_type, TrackType::Audio);
            for c in &tr.clips {
                if c.clip_type == ClipType::Text {
                    continue;
                }
                planned.push(PlannedClip {
                    input_idx: idx,
                    clip: c,
                    is_video_track,
                    is_audio_track,
                    track_muted: tr.muted,
                    track_volume: tr.volume,
                });
                idx += 1;
            }
        }
        planned
    }

    #[test]
    fn filter_graph_single_video_clip_not_concatenated() {
        let mut p = base_project();
        p.tracks = vec![track(
            TrackType::Video,
            vec![clip(ClipType::Video, "a.mp4")],
        )];
        let planned = plan(&p);
        let canvas = Canvas {
            width: 1280,
            height: 720,
        };
        let g = build_filter_graph(&p, &planned, canvas);
        assert!(!g.filter.contains("concat"), "single clip must not concat");
        assert_eq!(g.video_label.as_deref(), Some("v0"));
        // Video clip on a video track also produces audio.
        assert_eq!(g.audio_label.as_deref(), Some("a0"));
        assert!(g.filter.contains("trim=start=1:end=4"));
        assert!(g.filter.contains("scale=1280:720"));
    }

    #[test]
    fn filter_graph_two_video_clips_concatenated() {
        let mut p = base_project();
        p.tracks = vec![track(
            TrackType::Video,
            vec![
                clip(ClipType::Video, "a.mp4"),
                clip(ClipType::Video, "b.mp4"),
            ],
        )];
        let planned = plan(&p);
        let canvas = Canvas {
            width: 1280,
            height: 720,
        };
        let g = build_filter_graph(&p, &planned, canvas);
        assert!(g.filter.contains("concat=n=2:v=1:a=0[vcat]"));
        assert_eq!(g.video_label.as_deref(), Some("vcat"));
        // Two audio streams get mixed.
        assert!(g.filter.contains("amix=inputs=2"));
        assert_eq!(g.audio_label.as_deref(), Some("amix"));
    }

    #[test]
    fn filter_graph_audio_clip_has_atrim_and_volume() {
        let mut p = base_project();
        let mut c = clip(ClipType::Audio, "song.mp3");
        c.properties.volume = 0.5;
        let mut tr = track(TrackType::Audio, vec![c]);
        tr.volume = 0.5;
        p.tracks = vec![tr];
        let planned = plan(&p);
        let g = build_filter_graph(
            &p,
            &planned,
            Canvas {
                width: 1280,
                height: 720,
            },
        );
        assert!(g.filter.contains("atrim=start=1:end=4"));
        // 0.5 (clip) * 0.5 (track) = 0.25
        assert!(g.filter.contains("volume=0.25"));
        assert!(g.video_label.is_none());
        assert_eq!(g.audio_label.as_deref(), Some("a0"));
    }

    #[test]
    fn filter_graph_muted_track_omits_audio() {
        let mut p = base_project();
        let mut tr = track(TrackType::Audio, vec![clip(ClipType::Audio, "song.mp3")]);
        tr.muted = true;
        p.tracks = vec![tr];
        let planned = plan(&p);
        let g = build_filter_graph(
            &p,
            &planned,
            Canvas {
                width: 1280,
                height: 720,
            },
        );
        assert!(g.audio_label.is_none());
    }

    #[test]
    fn filter_graph_text_clip_draws_text_over_video() {
        let mut p = base_project();
        let mut text_clip = clip(ClipType::Text, "");
        text_clip.start_time = 1.0;
        text_clip.end_time = 3.0;
        text_clip.properties.text = Some(TextProperties {
            content: "Hello".into(),
            font_family: "Arial".into(),
            font_size: 48,
            font_weight: 400,
            color: "#ffffff".into(),
            background_color: "transparent".into(),
            align: TextAlign::Center,
            vertical_align: VerticalAlign::Middle,
        });
        p.tracks = vec![
            track(TrackType::Video, vec![clip(ClipType::Video, "a.mp4")]),
            track(TrackType::Text, vec![text_clip]),
        ];
        let planned = plan(&p);
        let g = build_filter_graph(
            &p,
            &planned,
            Canvas {
                width: 1280,
                height: 720,
            },
        );
        assert!(g.filter.contains("drawtext=text='Hello'"));
        assert!(g.filter.contains("fontcolor=0xffffff"));
        assert!(g.filter.contains("enable='between(t,1,3)'"));
        // Final video label should be the drawtext output, not the raw clip.
        assert_eq!(g.video_label.as_deref(), Some("vtxt0"));
    }

    #[test]
    fn filter_graph_image_clip_not_trimmed() {
        let mut p = base_project();
        p.tracks = vec![track(
            TrackType::Video,
            vec![clip(ClipType::Image, "a.png")],
        )];
        let planned = plan(&p);
        let g = build_filter_graph(
            &p,
            &planned,
            Canvas {
                width: 1280,
                height: 720,
            },
        );
        // Images are not trimmed (no timeline).
        assert!(!g.filter.contains("trim="));
        assert!(g.filter.contains("scale=1280:720"));
        // Image is not a Video clip, so no audio.
        assert!(g.audio_label.is_none());
    }

    #[test]
    fn filter_graph_opacity_adds_colorchannelmixer() {
        let mut p = base_project();
        let mut c = clip(ClipType::Video, "a.mp4");
        c.properties.opacity = 0.5;
        p.tracks = vec![track(TrackType::Video, vec![c])];
        let planned = plan(&p);
        let g = build_filter_graph(
            &p,
            &planned,
            Canvas {
                width: 1280,
                height: 720,
            },
        );
        assert!(g.filter.contains("colorchannelmixer=aa=0.5"));
    }

    #[test]
    fn transform_default_is_identity() {
        let t = Transform::default();
        assert_eq!(t.scale_x, 1.0);
        assert_eq!(t.scale_y, 1.0);
        assert_eq!(t.rotation, 0.0);
    }
}
