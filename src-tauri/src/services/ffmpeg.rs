//! FFmpeg service for video processing and encoding.
//!
//! Responsibilities:
//! - Probing media (`ffprobe`), thumbnails, waveforms and transcodes.
//! - Building the export filter graph and encoder arguments from a project.
//! - Running and cancelling the export process.
//!
//! ## Input/output safety
//!
//! Every path handed to ffmpeg comes from the webview, so:
//! - inputs must be existing local media files and are passed as `file:<path>`
//!   so ffmpeg never interprets them as protocols (`http:`, `concat:`,
//!   `subfile:`) or options;
//! - outputs must be local paths with an expected extension and are also
//!   passed as `file:<path>`;
//! - every user string that reaches `-filter_complex` (drawtext content,
//!   colors) is escaped or allowlisted.

use crate::error::{ClipyError, Result};
use crate::models::project::{
    ClipType, ExportProgress, ExportSettings, ExportStatus, Filter, Project, TextAlign, TrackType,
    Transform, VerticalAlign,
};
use crate::services::binary;
use crate::utils::path_policy;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, OnceLock};
use tauri::{AppHandle, Runtime};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, Notify};
use tracing::{debug, info, warn};

/// Tracks whether an export has been asked to cancel. `cancel_export` sets this,
/// the export loop observes it, kills ffmpeg, and reports `Cancelled` (not `Failed`).
static EXPORT_CANCEL: AtomicBool = AtomicBool::new(false);

/// Wakes the export loop when a cancel is requested, so cancellation does not
/// wait for ffmpeg's next progress line.
static EXPORT_CANCEL_NOTIFY: LazyLock<Notify> = LazyLock::new(Notify::new);

/// Serializes tests that touch the process-wide cancel flag.
#[cfg(test)]
pub(crate) static EXPORT_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Request cancellation of the in-flight export.
pub fn request_export_cancel() {
    EXPORT_CANCEL.store(true, Ordering::SeqCst);
    EXPORT_CANCEL_NOTIFY.notify_one();
}

/// Clear any pending cancel flag. Called by the export command while it holds
/// the export slot, before the export starts.
pub fn reset_export_cancel() {
    EXPORT_CANCEL.store(false, Ordering::SeqCst);
}

fn export_cancelled() -> bool {
    EXPORT_CANCEL.load(Ordering::SeqCst)
}

/// Format a local path as an explicit `file:` URL-less input/output for ffmpeg.
///
/// The `file:` protocol prefix stops ffmpeg from treating the string as another
/// protocol (`concat:`, `http:`, ...) or, for outputs, as an option.
pub fn file_arg(path: &Path) -> String {
    format!("file:{}", path.display())
}

/// Validate an ffmpeg input path (audio, video or image) and return the
/// canonical path.
pub fn validate_input(path: &str) -> Result<PathBuf> {
    path_policy::ensure_editor_source(path)
}

/// Video metadata from FFprobe
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    /// Duration in seconds.
    pub duration: f64,
    /// Width of the first video stream in pixels.
    pub width: u32,
    /// Height of the first video stream in pixels.
    pub height: u32,
    /// Frame rate of the first video stream.
    pub fps: f64,
    /// Codec name of the first video stream.
    pub video_codec: String,
    /// Codec name of the first audio stream.
    pub audio_codec: String,
    /// Container bitrate in bits per second.
    pub bitrate: u64,
    /// Whether any audio stream exists.
    pub has_audio: bool,
}

/// Path of the ffprobe binary that ships next to `ffmpeg_path`.
fn ffprobe_beside(ffmpeg_path: &Path) -> PathBuf {
    let name = if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    binary::platform_exe(
        ffmpeg_path
            .parent()
            .map(|p| p.join(name))
            .unwrap_or_else(|| PathBuf::from(name)),
    )
}

/// Arguments for `ffprobe` to dump format + streams of `input` as JSON.
fn build_probe_args(input: &Path) -> Vec<String> {
    vec![
        "-v".into(),
        "quiet".into(),
        "-print_format".into(),
        "json".into(),
        "-show_format".into(),
        "-show_streams".into(),
        file_arg(input),
    ]
}

/// Get video metadata using FFprobe
pub async fn get_video_metadata<R: Runtime>(
    app: &AppHandle<R>,
    path: &str,
) -> Result<VideoMetadata> {
    let input = validate_input(path)?;
    let ffprobe_path = ffprobe_beside(&binary::get_ffmpeg_path(app)?);
    probe_with(&ffprobe_path, &input).await
}

/// Run `ffprobe` at `ffprobe_path` on an already-validated input.
async fn probe_with(ffprobe_path: &Path, input: &Path) -> Result<VideoMetadata> {
    let output = Command::new(ffprobe_path)
        .args(build_probe_args(input))
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

    if let Some(format) = json["format"].as_object() {
        if let Some(duration) = format.get("duration").and_then(|d| d.as_str()) {
            metadata.duration = duration.parse().unwrap_or(0.0);
        }
        if let Some(bitrate) = format.get("bit_rate").and_then(|b| b.as_str()) {
            metadata.bitrate = bitrate.parse().unwrap_or(0);
        }
    }

    for stream in streams {
        let codec_type = stream["codec_type"].as_str().unwrap_or("");

        if codec_type == "video" && metadata.video_codec.is_empty() {
            metadata.width = stream["width"].as_u64().unwrap_or(0) as u32;
            metadata.height = stream["height"].as_u64().unwrap_or(0) as u32;
            metadata.video_codec = stream["codec_name"].as_str().unwrap_or("").to_string();

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

/// Arguments to grab one frame of `input` at `time` seconds into `output`,
/// optionally scaled to `width` pixels wide.
fn build_thumbnail_args(input: &Path, output: &Path, time: f64, width: Option<u32>) -> Vec<String> {
    let time = if time.is_finite() { time.max(0.0) } else { 0.0 };
    let mut args = vec![
        "-y".to_string(),
        "-ss".to_string(),
        time.to_string(),
        "-i".to_string(),
        file_arg(input),
        "-vframes".to_string(),
        "1".to_string(),
    ];
    if let Some(w) = width {
        args.push("-vf".into());
        args.push(format!("scale={}:-1", w.max(2)));
    }
    args.extend([
        "-q:v".to_string(),
        if width.is_some() { "3" } else { "2" }.to_string(),
        "-update".to_string(),
        "1".to_string(),
        file_arg(output),
    ]);
    args
}

/// Run ffmpeg with `args`, mapping a non-zero exit to `ClipyError::FFmpeg`
/// prefixed with `what`.
async fn run_ffmpeg(ffmpeg_path: &Path, args: &[String], what: &str) -> Result<Vec<u8>> {
    let output = Command::new(ffmpeg_path)
        .args(args)
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("{what}: failed to run ffmpeg: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(ClipyError::FFmpeg(format!("{what} failed: {stderr}")));
    }
    Ok(output.stdout)
}

/// Generate a thumbnail from a video
pub async fn generate_thumbnail<R: Runtime>(
    app: &AppHandle<R>,
    video_path: &str,
    output_path: &str,
    time_offset: f64,
) -> Result<()> {
    let input = validate_input(video_path)?;
    let output = path_policy::ensure_output_path(output_path, path_policy::IMAGE_EXTENSIONS)?;
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    run_ffmpeg(
        &ffmpeg_path,
        &build_thumbnail_args(&input, &output, time_offset, None),
        "Thumbnail generation",
    )
    .await
    .map(|_| ())
}

/// Evenly spaced thumbnail timestamps and output paths for a timeline strip.
fn timeline_thumbnail_plan(duration: f64, count: u32, dir: &Path) -> Vec<(f64, PathBuf)> {
    if count == 0 {
        return Vec::new();
    }
    let duration = if duration.is_finite() {
        duration.max(0.0)
    } else {
        0.0
    };
    let interval = duration / count as f64;
    (0..count)
        .map(|i| (i as f64 * interval, dir.join(format!("thumb_{:04}.jpg", i))))
        .collect()
}

/// Upper bound on timeline thumbnails per request, so the webview cannot ask
/// for millions of ffmpeg invocations.
const MAX_TIMELINE_THUMBNAILS: u32 = 500;

/// Generate multiple thumbnails for timeline
pub async fn generate_timeline_thumbnails<R: Runtime>(
    app: &AppHandle<R>,
    video_path: &str,
    output_dir: &str,
    count: u32,
    width: u32,
) -> Result<Vec<String>> {
    let input = validate_input(video_path)?;
    let dir = path_policy::ensure_local_dir(output_dir)?;
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let metadata = probe_with(&ffprobe_beside(&ffmpeg_path), &input).await?;

    let mut thumbnails = Vec::new();
    for (time, out) in
        timeline_thumbnail_plan(metadata.duration, count.min(MAX_TIMELINE_THUMBNAILS), &dir)
    {
        run_ffmpeg(
            &ffmpeg_path,
            &build_thumbnail_args(&input, &out, time, Some(width)),
            "Thumbnail generation",
        )
        .await?;
        thumbnails.push(out.to_string_lossy().into_owned());
    }
    Ok(thumbnails)
}

/// Arguments to decode `input`'s audio to mono little-endian f32 on stdout.
fn build_waveform_args(input: &Path, samples: u32) -> Vec<String> {
    vec![
        "-i".into(),
        file_arg(input),
        "-ac".into(),
        "1".into(),
        "-filter:a".into(),
        format!("aresample={}", samples.max(1)),
        "-map".into(),
        "0:a".into(),
        "-c:a".into(),
        "pcm_f32le".into(),
        "-f".into(),
        "f32le".into(),
        "-".into(),
    ]
}

/// Convert raw f32le bytes to absolute amplitudes normalized to 0..=1.
fn normalize_waveform(raw: &[u8]) -> Vec<f32> {
    let samples: Vec<f32> = raw
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]).abs())
        .map(|s| if s.is_finite() { s } else { 0.0 })
        .collect();
    let max = samples.iter().copied().fold(0.0f32, f32::max);
    if max > 0.0 {
        samples.iter().map(|s| s / max).collect()
    } else {
        samples
    }
}

/// Extract audio waveform data
pub async fn extract_waveform<R: Runtime>(
    app: &AppHandle<R>,
    video_path: &str,
    samples: u32,
) -> Result<Vec<f32>> {
    let input = validate_input(video_path)?;
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    match run_ffmpeg(
        &ffmpeg_path,
        &build_waveform_args(&input, samples),
        "Waveform",
    )
    .await
    {
        Ok(raw) => Ok(normalize_waveform(&raw)),
        // A file without an audio stream simply has no waveform.
        Err(_) => Ok(Vec::new()),
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

/// Flatten the project's non-text clips into ffmpeg input order: tracks
/// top-to-bottom, clips in order.
fn plan_clips(project: &Project) -> Vec<PlannedClip<'_>> {
    let mut planned = Vec::new();
    for track in &project.tracks {
        let is_video_track = matches!(track.track_type, TrackType::Video | TrackType::Effect);
        let is_audio_track = matches!(track.track_type, TrackType::Audio);
        for clip in &track.clips {
            // Text clips have no source file; they are overlays, not inputs.
            if clip.clip_type == ClipType::Text {
                continue;
            }
            planned.push(PlannedClip {
                input_idx: planned.len(),
                clip,
                is_video_track,
                is_audio_track,
                track_muted: track.muted,
                track_volume: track.volume,
            });
        }
    }
    planned
}

/// Assemble the full ffmpeg argv for an export.
///
/// `inputs` are the validated, canonical source paths in the same order as
/// `planned`; `output` is the validated output path.
fn build_export_args(
    project: &Project,
    settings: &ExportSettings,
    planned: &[PlannedClip],
    inputs: &[PathBuf],
    output: &Path,
    encoder: &EncoderChoice,
) -> Vec<String> {
    let canvas = resolve_canvas(project, settings);
    let graph = build_filter_graph(project, planned, canvas);

    let mut args: Vec<String> = vec!["-y".to_string()];
    for input in inputs {
        args.push("-i".to_string());
        args.push(file_arg(input));
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
            settings.fps.max(1),
            finite_or(project.duration, 0.1).max(0.1)
        ));
    }

    if !graph.filter.is_empty() {
        args.push("-filter_complex".to_string());
        args.push(graph.filter.clone());
    }

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

    args.extend(build_output_args(
        settings,
        encoder,
        graph.audio_label.is_some(),
    ));
    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
    args.push("-nostats".to_string());
    args.push(file_arg(output));
    args
}

/// `value` if finite, else `fallback`. Keeps `NaN`/`inf` from a malformed
/// project out of the filter graph.
fn finite_or(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

/// Export a project to a video file.
///
/// Builds a real filter graph: every visual clip is trimmed, scaled+padded to
/// the canvas, opacity/transform applied, then concatenated in timeline order;
/// audio clips are trimmed, volume-adjusted and mixed; text clips are drawn with
/// `drawtext`. Encoder is chosen by hardware-accel detection with a software
/// fallback. Progress is read from `-progress pipe:1` for reliability.
///
/// The caller owns cancel-flag reset (see [`reset_export_cancel`]) so a cancel
/// issued between claiming the export slot and reaching this function is not
/// lost.
pub async fn export_project<R: Runtime>(
    app: &AppHandle<R>,
    project: &Project,
    settings: &ExportSettings,
    progress_tx: mpsc::Sender<ExportProgress>,
) -> Result<PathBuf> {
    info!("Starting project export: {}", project.name);
    // Validate before probing encoders so bad input fails fast.
    validate_export_paths(project, settings)?;
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    debug!("Using FFmpeg executable: {:?}", ffmpeg_path);
    let encoder = select_video_encoder(app, settings.use_hardware_acceleration).await;
    run_export(&ffmpeg_path, &encoder, project, settings, progress_tx).await
}

/// Validate the export output path and every clip source. Returns the
/// canonical output path and the canonical inputs in [`plan_clips`] order.
fn validate_export_paths(
    project: &Project,
    settings: &ExportSettings,
) -> Result<(PathBuf, Vec<PathBuf>)> {
    let output =
        path_policy::ensure_output_path(&settings.output_path, path_policy::EXPORT_EXTENSIONS)?;
    let inputs = plan_clips(project)
        .iter()
        .map(|p| validate_input(&p.clip.source_path))
        .collect::<Result<Vec<_>>>()?;
    Ok((output, inputs))
}

/// Run an export with an explicit ffmpeg binary and encoder (no `AppHandle`
/// needed, so it is directly testable).
async fn run_export(
    ffmpeg_path: &Path,
    encoder: &EncoderChoice,
    project: &Project,
    settings: &ExportSettings,
    progress_tx: mpsc::Sender<ExportProgress>,
) -> Result<PathBuf> {
    let (output, inputs) = validate_export_paths(project, settings)?;
    let planned = plan_clips(project);

    let fps = settings.fps.max(1) as f64;
    let total_frames = (finite_or(project.duration, 0.0).max(0.0) * fps).ceil() as u64;

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

    let args = build_export_args(project, settings, &planned, &inputs, &output, encoder);
    debug!("FFmpeg export args: {:?}", args);

    let mut child = Command::new(ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
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
        if export_cancelled() {
            cancelled = true;
            let _ = child.start_kill();
            break;
        }

        let line = tokio::select! {
            line = reader.next_line() => line,
            _ = EXPORT_CANCEL_NOTIFY.notified() => continue,
        };

        match line {
            Ok(Some(line)) => match parse_progress_kv(&line) {
                Some(ProgressLine::Frame(frame)) => {
                    last_frame = frame;
                    let (progress, elapsed, estimated) =
                        progress_estimate(frame, total_frames, start_time.elapsed().as_secs());
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
                Some(ProgressLine::End) => break,
                None => {}
            },
            Ok(None) | Err(_) => break,
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
        reset_export_cancel();
        let _ = std::fs::remove_file(&output);
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

    info!("Export completed: {}", output.display());
    Ok(output)
}

/// A meaningful key from ffmpeg's `-progress` output.
#[derive(Debug, PartialEq, Eq)]
enum ProgressLine {
    /// `frame=N`
    Frame(u64),
    /// `progress=end`
    End,
}

/// Parse one `key=value` line of ffmpeg `-progress` output.
fn parse_progress_kv(line: &str) -> Option<ProgressLine> {
    let (key, value) = line.split_once('=')?;
    match (key.trim(), value.trim()) {
        ("frame", v) => v.parse().ok().map(ProgressLine::Frame),
        ("progress", "end") => Some(ProgressLine::End),
        _ => None,
    }
}

/// Percent complete (capped below 100 until ffmpeg reports `end`), elapsed
/// seconds and estimated remaining seconds.
fn progress_estimate(frame: u64, total_frames: u64, elapsed: u64) -> (f64, u64, u64) {
    let progress = if total_frames > 0 {
        (frame as f64 / total_frames as f64 * 100.0).min(99.9)
    } else {
        0.0
    };
    let estimated = if progress > 0.0 {
        (((elapsed as f64 / progress) * 100.0) as u64).saturating_sub(elapsed)
    } else {
        0
    };
    (progress, elapsed, estimated)
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

            // Transform scale is applied to the source before fitting to canvas so
            // that scaling >1 zooms in and <1 shrinks within the frame.
            let t = &clip.properties.transform;
            let sx = if t.scale_x > 0.0 { t.scale_x } else { 1.0 };
            let sy = if t.scale_y > 0.0 { t.scale_y } else { 1.0 };
            if (sx - 1.0).abs() > f64::EPSILON || (sy - 1.0).abs() > f64::EPSILON {
                chain.push_str(&format!("scale=iw*{sx}:ih*{sy},"));
            }

            chain.push_str(&format!(
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps={fps},format=yuv420p",
                w = canvas.width,
                h = canvas.height,
                fps = project.settings.fps
            ));

            // Rotation (degrees -> radians). Applied after fit so the whole frame rotates.
            if let Some(rot) = build_rotate(t) {
                chain.push_str(&format!(",{rot}"));
            }

            // Color/effect filters (eq/hue/blur/unsharp) from the clip.
            let fstr = build_filters_string(&clip.properties.filters);
            if !fstr.is_empty() {
                chain.push(',');
                chain.push_str(&fstr);
            }

            // Fade in/out timed to the clip's on-timeline duration.
            let clip_dur = (clip.end_time - clip.start_time).max(0.0);
            if let Some(fade) =
                build_fade(clip.properties.fade_in, clip.properties.fade_out, clip_dur)
            {
                chain.push(',');
                chain.push_str(&fade);
            }

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

/// Read a numeric param from a filter's params map, accepting both raw numbers
/// and numeric strings. Returns `default` when missing/unparseable.
fn filter_param(filter: &Filter, key: &str, default: f64) -> f64 {
    match filter.params.get(key) {
        Some(serde_json::Value::Number(n)) => n.as_f64().unwrap_or(default),
        Some(serde_json::Value::String(s)) => s.parse().unwrap_or(default),
        _ => default,
    }
}

/// Convert a single frontend `Filter` into an ffmpeg filter string.
///
/// The frontend stores the slider value under `params.value`. Mapping:
/// - brightness: `eq=brightness=(value-1)` (ffmpeg brightness is -1..1, UI is 0..2)
/// - contrast/saturation: `eq=contrast=value` / `eq=saturation=value` (UI 0..2 == ffmpeg)
/// - hue: `hue=h=value` (degrees)
/// - blur: `gblur=sigma=value`
/// - sharpen: `unsharp=5:5:value:5:5:0.0`
///
/// Returns `None` for unknown/disabled filters or no-op values.
fn build_filter(filter: &Filter) -> Option<String> {
    if !filter.enabled {
        return None;
    }
    let v = filter_param(filter, "value", f64::NAN);
    match filter.filter_type.as_str() {
        "brightness" => {
            let b = if v.is_nan() { 0.0 } else { v - 1.0 };
            if b.abs() < f64::EPSILON {
                None
            } else {
                Some(format!("eq=brightness={b}"))
            }
        }
        "contrast" => {
            let c = if v.is_nan() { 1.0 } else { v };
            Some(format!("eq=contrast={c}"))
        }
        "saturation" => {
            let s = if v.is_nan() { 1.0 } else { v };
            Some(format!("eq=saturation={s}"))
        }
        "hue" => {
            let h = if v.is_nan() { 0.0 } else { v };
            if h.abs() < f64::EPSILON {
                None
            } else {
                Some(format!("hue=h={h}"))
            }
        }
        "blur" => {
            let sigma = if v.is_nan() { 0.0 } else { v };
            if sigma <= 0.0 {
                None
            } else {
                Some(format!("gblur=sigma={sigma}"))
            }
        }
        "sharpen" => {
            let amount = if v.is_nan() { 0.0 } else { v };
            if amount <= 0.0 {
                None
            } else {
                Some(format!("unsharp=5:5:{amount}:5:5:0.0"))
            }
        }
        "grayscale" => Some("hue=s=0".to_string()),
        "sepia" => {
            Some("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131".to_string())
        }
        "invert" => Some("negate".to_string()),
        _ => None,
    }
}

/// Join all enabled clip filters into a comma-separated ffmpeg filter fragment.
fn build_filters_string(filters: &[Filter]) -> String {
    filters
        .iter()
        .filter_map(build_filter)
        .collect::<Vec<_>>()
        .join(",")
}

/// Build a `rotate` filter from a transform, or `None` if there is no rotation.
/// The UI stores rotation in degrees; ffmpeg `rotate` expects radians.
fn build_rotate(transform: &Transform) -> Option<String> {
    if transform.rotation.abs() < f64::EPSILON {
        return None;
    }
    let rad = transform.rotation.to_radians();
    Some(format!(
        "rotate={rad}:ow=rotw({rad}):oh=roth({rad}):c=black@0"
    ))
}

/// Build a fade-in/fade-out filter fragment for a clip of `duration` seconds.
fn build_fade(fade_in: f64, fade_out: f64, duration: f64) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    if fade_in > 0.0 {
        parts.push(format!("fade=t=in:st=0:d={fade_in}"));
    }
    if fade_out > 0.0 && duration > 0.0 {
        let start = (duration - fade_out).max(0.0);
        parts.push(format!("fade=t=out:st={start}:d={fade_out}"));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(","))
    }
}

/// Escape user text for `drawtext=text='...'` inside `-filter_complex`.
///
/// The value passes through two ffmpeg parsers:
/// 1. the filtergraph parser, which treats `'...'` as a literal span, so only
///    `'` itself could break out — it is replaced by a typographic apostrophe;
/// 2. the filter option parser, where `\` and `:` are special and are
///    backslash-escaped.
///
/// The filter is emitted with `expansion=none`, so drawtext's own `%{...}`
/// expansion (which can call functions such as `%{eif:...}` or read metadata)
/// never sees the text. Control characters other than newline are dropped.
fn escape_drawtext(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            ':' => out.push_str("\\:"),
            '\'' => out.push('\u{2019}'),
            '\n' => out.push('\n'),
            c if c.is_control() => {}
            c => out.push(c),
        }
    }
    out
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
    // NOTE: `font_family` is deliberately not forwarded. drawtext's `font=`
    // goes through fontconfig and `fontfile=` would read an arbitrary path;
    // the default font keeps exports reproducible and the graph free of
    // another user-controlled string.
    let color = normalize_color(&text.color, DEFAULT_TEXT_COLOR);
    let font_size = text.font_size.clamp(1, 1000);
    let mut d = format!(
        "drawtext=expansion=none:text='{}':fontcolor={}:fontsize={}:x={}:y={}",
        content, color, font_size, x, y
    );
    let bg = text.background_color.trim();
    if !bg.is_empty() && !bg.eq_ignore_ascii_case("transparent") && !bg.eq_ignore_ascii_case("none")
    {
        d.push_str(&format!(
            ":box=1:boxcolor={}:boxborderw=10",
            normalize_color(bg, DEFAULT_BOX_COLOR)
        ));
    }
    d.push_str(&format!(
        ":enable='between(t,{},{})'",
        finite_or(start, 0.0),
        finite_or(end, 0.0)
    ));
    d
}

/// Fallback text color when the project carries an unusable value.
const DEFAULT_TEXT_COLOR: &str = "white";
/// Fallback box color when the project carries an unusable value.
const DEFAULT_BOX_COLOR: &str = "black";

/// Named colors accepted verbatim (all are valid ffmpeg color names).
const NAMED_COLORS: &[&str] = &[
    "white", "black", "red", "green", "blue", "yellow", "cyan", "magenta", "gray", "grey",
    "orange", "purple", "pink", "brown", "silver", "gold", "navy", "teal", "lime", "maroon",
    "olive",
];

/// Map a CSS-style color to an ffmpeg color, or `fallback` if it is not one of
/// the allowlisted forms.
///
/// SECURITY: the result is spliced into `-filter_complex`, so anything other
/// than `#RGB`, `#RRGGBB`, `#RRGGBBAA` (or the `0x` forms) and a fixed set of
/// names is replaced — a crafted "color" could otherwise close the option and
/// inject arbitrary filters.
fn normalize_color(c: &str, fallback: &str) -> String {
    let c = c.trim();
    let hex = c
        .strip_prefix('#')
        .or_else(|| c.strip_prefix("0x"))
        .or_else(|| c.strip_prefix("0X"));
    if let Some(hex) = hex {
        if hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
            match hex.len() {
                3 => {
                    let expanded: String = hex.chars().flat_map(|ch| [ch, ch]).collect();
                    return format!("0x{}", expanded.to_ascii_lowercase());
                }
                6 | 8 => return format!("0x{}", hex.to_ascii_lowercase()),
                _ => {}
            }
        }
        return fallback.to_string();
    }
    let lower = c.to_ascii_lowercase();
    if NAMED_COLORS.contains(&lower.as_str()) {
        lower
    } else {
        fallback.to_string()
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
async fn select_video_encoder<R: Runtime>(app: &AppHandle<R>, want_hw: bool) -> EncoderChoice {
    if !want_hw {
        return EncoderChoice {
            name: "libx264".to_string(),
            hardware: false,
        };
    }

    let available = list_ffmpeg_encoders(app).await.unwrap_or_default();
    pick_encoder(&available, HW_ENCODER_PREFERENCE)
}

/// Hardware H.264 encoders to try, in this platform's preference order.
const HW_ENCODER_PREFERENCE: &[&str] = if cfg!(target_os = "macos") {
    &["h264_videotoolbox", "h264_nvenc", "h264_qsv"]
} else if cfg!(target_os = "windows") {
    &["h264_nvenc", "h264_qsv", "h264_amf"]
} else {
    &["h264_nvenc", "h264_vaapi", "h264_qsv"]
};

/// The first of `candidates` that ffmpeg reports in `available`, else libx264.
fn pick_encoder(available: &[String], candidates: &[&str]) -> EncoderChoice {
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
async fn list_ffmpeg_encoders<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<String>> {
    if let Some(cached) = ENCODER_CACHE.get() {
        return Ok(cached.clone());
    }
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let output = Command::new(&ffmpeg_path)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to list encoders: {}", e)))?;
    let names = parse_encoder_list(&String::from_utf8_lossy(&output.stdout));
    let _ = ENCODER_CACHE.set(names.clone());
    Ok(names)
}

/// Parse `ffmpeg -encoders` output into encoder names.
///
/// Encoder rows look like ` V....D h264_nvenc   NVIDIA NVENC ...`: a
/// six-character capability field starting with `V`, `A` or `S`, then the
/// name. The legend above the `------` separator uses the same shape
/// (` V..... = Video`), so only rows after the separator are considered.
fn parse_encoder_list(output: &str) -> Vec<String> {
    let body = match output.find("------") {
        Some(i) => &output[i..],
        None => output,
    };
    body.lines()
        .filter_map(|line| {
            let mut parts = line.split_whitespace();
            let flags = parts.next()?;
            let name = parts.next()?;
            let is_row = flags.len() == 6
                && matches!(flags.as_bytes()[0], b'V' | b'A' | b'S')
                && name != "=";
            is_row.then(|| name.to_string())
        })
        .collect()
}

/// Whether an encoder name refers to a hardware encoder (nvenc/qsv/amf/vaapi/videotoolbox).
fn is_hardware_encoder(name: &str) -> bool {
    name.ends_with("nvenc")
        || name.ends_with("qsv")
        || name.ends_with("amf")
        || name.ends_with("vaapi")
        || name.ends_with("videotoolbox")
}

/// Resolve the concrete ffmpeg encoder name from the requested codec family,
/// the container format, and the HW-detected H.264 `encoder`.
///
/// - h264 -> the detected encoder (libx264 or a HW h264_* variant)
/// - h265/hevc -> HW hevc variant matching the detected family, else libx265
/// - vp9 -> libvpx-vp9
/// - av1 -> libaom-av1 (software)
/// - WebM container always forces VP9 regardless of requested codec.
fn select_codec_name(settings: &ExportSettings, encoder: &EncoderChoice) -> String {
    if settings.format.eq_ignore_ascii_case("webm") {
        return "libvpx-vp9".to_string();
    }

    match settings.video_codec.to_lowercase().as_str() {
        "h265" | "hevc" => {
            // Try to reuse the detected HW family (e.g. h264_nvenc -> hevc_nvenc).
            if encoder.hardware {
                if let Some(family) = encoder.name.strip_prefix("h264_") {
                    return format!("hevc_{family}");
                }
            }
            "libx265".to_string()
        }
        "vp9" => "libvpx-vp9".to_string(),
        "av1" => "libaom-av1".to_string(),
        // h264 (and unknown/empty) -> the detected encoder.
        _ => encoder.name.clone(),
    }
}

/// Resolve the encoder preset string: explicit `encoding_preset` wins, otherwise
/// map the coarse `quality` field to an x264-style preset.
fn resolve_preset(settings: &ExportSettings) -> String {
    const PRESETS: &[&str] = &[
        "ultrafast",
        "superfast",
        "veryfast",
        "faster",
        "fast",
        "medium",
        "slow",
        "slower",
        "veryslow",
    ];
    let explicit = settings.encoding_preset.trim().to_ascii_lowercase();
    if PRESETS.contains(&explicit.as_str()) {
        return explicit;
    }
    match settings.quality.as_str() {
        "low" => "veryfast",
        "high" | "ultra" => "slow",
        _ => "medium",
    }
    .to_string()
}

/// Map a named x264-style preset to an SVT-AV1 numeric preset (0=slowest, 13=fastest).
fn svtav1_preset(preset: &str) -> String {
    match preset {
        "ultrafast" | "superfast" => "12",
        "veryfast" | "faster" => "10",
        "fast" => "8",
        "medium" => "6",
        "slow" => "4",
        "slower" | "veryslow" => "2",
        _ => "6",
    }
    .to_string()
}

/// Build FFmpeg output arguments from export settings and the chosen encoder.
fn build_output_args(
    settings: &ExportSettings,
    encoder: &EncoderChoice,
    has_audio: bool,
) -> Vec<String> {
    let mut args = Vec::new();

    // Resolve the actual encoder name from the requested codec family. WebM
    // formats force VP9. The H.264 family honors the HW-detected `encoder`.
    let codec_name = select_codec_name(settings, encoder);
    let is_software = !is_hardware_encoder(&codec_name);

    args.push("-c:v".to_string());
    args.push(codec_name.clone());

    // CRF for software encoders that support it (x264/x265/vp9/av1). Falls back
    // to the bitrate path when CRF is absent or the encoder is hardware.
    let crf_applied = if is_software {
        if let Some(crf) = settings.crf {
            args.push("-crf".to_string());
            args.push(crf.to_string());
            // VP9 in CRF mode also wants -b:v 0 to be truly constant-quality.
            if codec_name == "libvpx-vp9" {
                args.push("-b:v".to_string());
                args.push("0".to_string());
            }
            true
        } else {
            false
        }
    } else {
        false
    };

    if !crf_applied {
        args.push("-b:v".to_string());
        args.push(format!("{}k", settings.video_bitrate));
    }

    // Preset: software x26x/av1 use named presets; HW encoders use their own.
    let preset = resolve_preset(settings);
    if codec_name == "libx264" || codec_name == "libx265" || codec_name == "libaom-av1" {
        args.push("-preset".to_string());
        args.push(preset);
    } else if codec_name == "libsvtav1" {
        // SVT-AV1 uses numeric presets; map named presets to a speed level.
        args.push("-preset".to_string());
        args.push(svtav1_preset(&preset));
    } else if encoder.hardware && codec_name.ends_with("nvenc") {
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
pub async fn transcode_video<R: Runtime>(
    app: &AppHandle<R>,
    input_path: &str,
    output_path: &str,
    settings: &ExportSettings,
) -> Result<()> {
    let input = validate_input(input_path)?;
    let output = path_policy::ensure_output_path(output_path, path_policy::VIDEO_EXTENSIONS)?;
    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    // Transcode preserves both streams; detect encoder with software fallback.
    let encoder = select_video_encoder(app, settings.use_hardware_acceleration).await;
    let args = build_transcode_args(&input, &output, settings, &encoder);
    run_ffmpeg(&ffmpeg_path, &args, "Transcode")
        .await
        .map(|_| ())
}

/// Arguments to re-encode `input` into `output` with `settings`.
fn build_transcode_args(
    input: &Path,
    output: &Path,
    settings: &ExportSettings,
    encoder: &EncoderChoice,
) -> Vec<String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), file_arg(input)];
    args.extend(build_output_args(settings, encoder, true));
    args.push(file_arg(output));
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::project::{
        Clip, ClipProperties, ClipType, Filter, ProjectSettings, TextAlign, TextProperties, Track,
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
        // `%` stays literal because drawtext runs with expansion=none.
        assert_eq!(escape_drawtext("50%"), "50%");
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
        assert_eq!(normalize_color("#ffffff", "white"), "0xffffff");
        assert_eq!(normalize_color("#000", "white"), "0x000000");
        assert_eq!(normalize_color("#AbC", "white"), "0xaabbcc");
        assert_eq!(normalize_color("#11223344", "white"), "0x11223344");
        assert_eq!(normalize_color("0xFF0000", "white"), "0xff0000");
        assert_eq!(normalize_color("0X00ff00", "white"), "0x00ff00");
        assert_eq!(normalize_color("white", "black"), "white");
        assert_eq!(normalize_color(" Red ", "white"), "red");
    }

    #[test]
    fn normalize_color_rejects_injection_and_junk() {
        for bad in [
            "red:box=1",
            "white[out];movie=/etc/passwd[x]",
            "#ff0000:fontfile=/etc/passwd",
            "#12345",
            "#gggggg",
            "#",
            "0x",
            "rgb(1,2,3)",
            "transparent",
            "",
            "white'",
            "red,drawbox",
        ] {
            assert_eq!(normalize_color(bad, "white"), "white", "{bad:?}");
        }
    }

    #[test]
    fn escape_drawtext_neutralizes_graph_syntax() {
        let evil = "a';movie=/etc/passwd[x];[x]overlay='";
        let esc = escape_drawtext(evil);
        assert!(!esc.contains('\''), "{esc}");
        // Graph separators are harmless inside the quoted span; colons are
        // escaped for the option parser.
        assert_eq!(escape_drawtext("x:y"), "x\\:y");
        assert_eq!(escape_drawtext("a\u{0}b\u{7}c\nd"), "abc\nd");
        assert_eq!(escape_drawtext("%{eif:1:d}"), "%{eif\\:1\\:d}");
    }

    #[test]
    fn drawtext_uses_allowlisted_colors_and_no_expansion() {
        let text = TextProperties {
            content: "Hi: 100%".into(),
            font_family: "Evil'Font:fontfile=/etc/passwd".into(),
            font_size: 0,
            font_weight: 400,
            color: "red:box=1".into(),
            background_color: "#000000:x".into(),
            align: TextAlign::Left,
            vertical_align: VerticalAlign::Bottom,
            ..Default::default()
        };
        let canvas = Canvas {
            width: 1000,
            height: 500,
        };
        let d = build_drawtext(&text, f64::NAN, 2.0, canvas);
        assert!(
            d.starts_with("drawtext=expansion=none:text='Hi\\: 100%'"),
            "{d}"
        );
        assert!(d.contains(":fontcolor=white:"), "{d}");
        assert!(d.contains(":fontsize=1:"), "{d}");
        assert!(d.contains(":box=1:boxcolor=black:"), "{d}");
        assert!(d.contains(":x=50:y=h-text_h-25"), "{d}");
        assert!(d.ends_with(":enable='between(t,0,2)'"), "{d}");
        assert!(!d.contains("fontfile"), "{d}");
        assert!(!d.contains("Evil"), "{d}");

        let mut right = text.clone();
        right.align = TextAlign::Right;
        right.vertical_align = VerticalAlign::Top;
        right.background_color = "none".into();
        let d = build_drawtext(&right, 0.0, 1.0, canvas);
        assert!(d.contains(":x=w-text_w-50:y=25"), "{d}");
        assert!(!d.contains("box=1"), "{d}");
    }

    // ---- input/output handling ----

    #[test]
    fn file_arg_prefixes_protocol() {
        assert_eq!(file_arg(Path::new("/a/b.mp4")), "file:/a/b.mp4");
        assert_eq!(file_arg(Path::new("-y.mp4")), "file:-y.mp4");
    }

    #[test]
    fn validate_input_rejects_protocols_and_non_media() {
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path().join("v.mp4");
        std::fs::write(&v, b"x").unwrap();
        let exe = dir.path().join("v.exe");
        std::fs::write(&exe, b"x").unwrap();
        assert!(validate_input(&v.to_string_lossy()).is_ok());
        for bad in [
            "concat:/a.mp4|/b.mp4".to_string(),
            "http://evil/x.mp4".to_string(),
            "subfile,,start,0,end,0,,:/etc/passwd".to_string(),
            "-i".to_string(),
            exe.to_string_lossy().into_owned(),
        ] {
            assert!(validate_input(&bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn probe_and_waveform_args_use_file_prefix() {
        let p = Path::new("/v/a.mp4");
        let probe = build_probe_args(p);
        assert_eq!(probe.last().unwrap(), "file:/v/a.mp4");
        let wave = build_waveform_args(p, 0);
        assert!(wave.windows(2).any(|w| w == ["-i", "file:/v/a.mp4"]));
        assert!(wave.contains(&"aresample=1".to_string()));
        assert_eq!(wave.last().unwrap(), "-");
        assert_eq!(
            ffprobe_beside(Path::new("/bin/ffmpeg")).parent(),
            Some(Path::new("/bin"))
        );
        assert!(ffprobe_beside(Path::new("ffmpeg"))
            .to_string_lossy()
            .starts_with("ffprobe"));
    }

    #[test]
    fn thumbnail_args() {
        let a = build_thumbnail_args(Path::new("/i.mp4"), Path::new("/o.jpg"), 1.5, None);
        assert_eq!(a[..3], ["-y", "-ss", "1.5"]);
        assert!(a.windows(2).any(|w| w == ["-i", "file:/i.mp4"]));
        assert!(a.windows(2).any(|w| w == ["-q:v", "2"]));
        assert_eq!(a.last().unwrap(), "file:/o.jpg");
        assert!(!a.contains(&"-vf".to_string()));

        let a = build_thumbnail_args(Path::new("/i.mp4"), Path::new("/o.jpg"), f64::NAN, Some(1));
        assert_eq!(a[2], "0");
        assert!(a.windows(2).any(|w| w == ["-vf", "scale=2:-1"]));
        assert!(a.windows(2).any(|w| w == ["-q:v", "3"]));
        let a = build_thumbnail_args(Path::new("/i.mp4"), Path::new("/o.jpg"), -4.0, None);
        assert_eq!(a[2], "0");
    }

    #[test]
    fn timeline_plan_spacing() {
        let dir = Path::new("/thumbs");
        assert!(timeline_thumbnail_plan(10.0, 0, dir).is_empty());
        let plan = timeline_thumbnail_plan(10.0, 4, dir);
        assert_eq!(plan.len(), 4);
        assert_eq!(plan[1].0, 2.5);
        assert_eq!(plan[3].1, dir.join("thumb_0003.jpg"));
        let plan = timeline_thumbnail_plan(f64::INFINITY, 2, dir);
        assert_eq!(plan[1].0, 0.0);
    }

    #[test]
    fn waveform_normalization() {
        let raw: Vec<u8> = [0.5f32, -1.0, 0.25, f32::NAN]
            .iter()
            .flat_map(|f| f.to_le_bytes())
            .chain([1u8, 2])
            .collect();
        assert_eq!(normalize_waveform(&raw), vec![0.5, 1.0, 0.25, 0.0]);
        let silent: Vec<u8> = 0f32.to_le_bytes().repeat(3);
        assert_eq!(normalize_waveform(&silent), vec![0.0, 0.0, 0.0]);
        assert!(normalize_waveform(&[]).is_empty());
    }

    #[test]
    fn transcode_args_wrap_paths() {
        let s = base_settings();
        let a = build_transcode_args(
            Path::new("/in.mov"),
            Path::new("/out.mp4"),
            &s,
            &enc("libx264", false),
        );
        assert_eq!(a[..3], ["-y", "-i", "file:/in.mov"]);
        assert_eq!(a.last().unwrap(), "file:/out.mp4");
        assert!(a.windows(2).any(|w| w == ["-c:a", "aac"]));
    }

    #[test]
    fn export_args_wrap_inputs_and_output() {
        let mut p = base_project();
        p.tracks = vec![track(
            TrackType::Video,
            vec![
                clip(ClipType::Video, "a.mp4"),
                clip(ClipType::Video, "b.mp4"),
            ],
        )];
        let planned = plan(&p);
        let inputs = vec![PathBuf::from("/m/a.mp4"), PathBuf::from("/m/b.mp4")];
        let args = build_export_args(
            &p,
            &base_settings(),
            &planned,
            &inputs,
            Path::new("/out/x.mp4"),
            &enc("libx264", false),
        );
        assert_eq!(args[0], "-y");
        assert!(args.windows(2).any(|w| w == ["-i", "file:/m/a.mp4"]));
        assert!(args.windows(2).any(|w| w == ["-i", "file:/m/b.mp4"]));
        assert!(args.windows(2).any(|w| w == ["-map", "[vcat]"]));
        assert!(args.windows(2).any(|w| w == ["-map", "[amix]"]));
        assert!(args.windows(2).any(|w| w == ["-progress", "pipe:1"]));
        assert_eq!(args.last().unwrap(), "file:/out/x.mp4");
        assert!(!args.iter().any(|a| a == "a.mp4"));
    }

    #[test]
    fn export_args_blank_canvas_for_text_only_project() {
        let mut p = base_project();
        p.duration = f64::NAN;
        let mut t = clip(ClipType::Text, "");
        t.properties.text = Some(TextProperties {
            content: "x".into(),
            font_family: String::new(),
            font_size: 20,
            font_weight: 400,
            color: "#fff".into(),
            background_color: String::new(),
            align: TextAlign::Center,
            vertical_align: VerticalAlign::Middle,
            ..Default::default()
        });
        p.tracks = vec![track(TrackType::Text, vec![t])];
        let planned = plan(&p);
        assert!(planned.is_empty());
        let args = build_export_args(
            &p,
            &base_settings(),
            &planned,
            &[],
            Path::new("/o.mp4"),
            &enc("libx264", false),
        );
        assert!(args.windows(2).any(|w| w == ["-f", "lavfi"]));
        assert!(args
            .iter()
            .any(|a| a.starts_with("color=c=black:s=") && a.ends_with(":d=0.1")));
        assert!(args.windows(2).any(|w| w == ["-map", "0:v"]));
    }

    #[test]
    fn progress_parsing() {
        assert_eq!(parse_progress_kv("frame=42"), Some(ProgressLine::Frame(42)));
        assert_eq!(
            parse_progress_kv(" frame = 7 "),
            Some(ProgressLine::Frame(7))
        );
        assert_eq!(parse_progress_kv("progress=end"), Some(ProgressLine::End));
        assert_eq!(parse_progress_kv("progress=continue"), None);
        assert_eq!(parse_progress_kv("frame=abc"), None);
        assert_eq!(parse_progress_kv("fps=30"), None);
        assert_eq!(parse_progress_kv("garbage"), None);

        assert_eq!(progress_estimate(0, 0, 5), (0.0, 5, 0));
        let (p, e, eta) = progress_estimate(50, 100, 10);
        assert_eq!((p, e, eta), (50.0, 10, 10));
        assert_eq!(progress_estimate(200, 100, 10).0, 99.9);
    }

    #[test]
    fn encoder_list_parsing() {
        let out = "Encoders:\n V..... = Video\n A..... = Audio\n S..... = Subtitle\n .F.... = Frame-level multithreading\n ------\n V....D libx264              libx264 H.264\n V....D h264_nvenc           NVIDIA NVENC\n A....D aac                  AAC\n S..... srt                  SubRip\n garbage\n";
        assert_eq!(
            parse_encoder_list(out),
            vec!["libx264", "h264_nvenc", "aac", "srt"]
        );
        // Without a separator every well-formed row still parses.
        assert_eq!(parse_encoder_list(" V....D libx265 x"), vec!["libx265"]);
        assert!(parse_encoder_list("").is_empty());
    }

    #[test]
    fn hardware_encoder_detection() {
        for hw in [
            "h264_nvenc",
            "h264_qsv",
            "h264_amf",
            "h264_vaapi",
            "h264_videotoolbox",
        ] {
            assert!(is_hardware_encoder(hw));
        }
        assert!(!is_hardware_encoder("libx264"));
    }

    #[test]
    fn preset_allowlist() {
        let mut s = base_settings();
        s.encoding_preset = "-x264-params".into();
        s.quality = "low".into();
        assert_eq!(resolve_preset(&s), "veryfast");
        s.encoding_preset = " SLOW ".into();
        assert_eq!(resolve_preset(&s), "slow");
        for (p, n) in [
            ("ultrafast", "12"),
            ("veryfast", "10"),
            ("fast", "8"),
            ("medium", "6"),
            ("slow", "4"),
            ("veryslow", "2"),
            ("x", "6"),
        ] {
            assert_eq!(svtav1_preset(p), n);
        }
    }

    #[test]
    fn cancel_flag_round_trip() {
        let _guard = EXPORT_TEST_LOCK.blocking_lock();
        reset_export_cancel();
        assert!(!export_cancelled());
        request_export_cancel();
        assert!(export_cancelled());
        reset_export_cancel();
        assert!(!export_cancelled());
    }

    #[test]
    fn filter_types_and_params() {
        assert_eq!(
            build_filter(&mk_filter("grayscale", 0.0, true)).as_deref(),
            Some("hue=s=0")
        );
        assert!(build_filter(&mk_filter("sepia", 0.0, true))
            .unwrap()
            .starts_with("colorchannelmixer"));
        assert_eq!(
            build_filter(&mk_filter("invert", 0.0, true)).as_deref(),
            Some("negate")
        );
        assert!(build_filter(&mk_filter("unknown", 1.0, true)).is_none());
        let f = Filter {
            id: "f".into(),
            filter_type: "saturation".into(),
            enabled: true,
            params: std::collections::HashMap::new(),
        };
        assert_eq!(build_filter(&f).as_deref(), Some("eq=saturation=1"));
        assert_eq!(finite_or(f64::NAN, 3.0), 3.0);
        assert_eq!(finite_or(2.0, 3.0), 2.0);
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
    // build_filter_graph consumes the same planning export_project uses.

    fn plan(project: &Project) -> Vec<PlannedClip<'_>> {
        plan_clips(project)
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
            ..Default::default()
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
        assert!(g.filter.contains("drawtext=expansion=none:text='Hello'"));
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

    // ---- filter mapping ----

    fn mk_filter(filter_type: &str, value: f64, enabled: bool) -> Filter {
        let mut params = std::collections::HashMap::new();
        params.insert("value".to_string(), serde_json::Value::from(value));
        Filter {
            id: "f".into(),
            filter_type: filter_type.into(),
            enabled,
            params,
        }
    }

    #[test]
    fn build_filter_brightness_offsets_by_one() {
        // UI brightness 1.5 -> ffmpeg eq=brightness=0.5
        let f = mk_filter("brightness", 1.5, true);
        assert_eq!(build_filter(&f).as_deref(), Some("eq=brightness=0.5"));
    }

    #[test]
    fn build_filter_brightness_one_is_noop() {
        let f = mk_filter("brightness", 1.0, true);
        assert!(build_filter(&f).is_none());
    }

    #[test]
    fn build_filter_contrast_and_saturation() {
        assert_eq!(
            build_filter(&mk_filter("contrast", 1.3, true)).as_deref(),
            Some("eq=contrast=1.3")
        );
        assert_eq!(
            build_filter(&mk_filter("saturation", 0.7, true)).as_deref(),
            Some("eq=saturation=0.7")
        );
    }

    #[test]
    fn build_filter_hue_blur_sharpen() {
        assert_eq!(
            build_filter(&mk_filter("hue", 90.0, true)).as_deref(),
            Some("hue=h=90")
        );
        assert_eq!(
            build_filter(&mk_filter("blur", 4.0, true)).as_deref(),
            Some("gblur=sigma=4")
        );
        assert_eq!(
            build_filter(&mk_filter("sharpen", 2.0, true)).as_deref(),
            Some("unsharp=5:5:2:5:5:0.0")
        );
    }

    #[test]
    fn build_filter_disabled_or_zero_is_none() {
        assert!(build_filter(&mk_filter("brightness", 1.5, false)).is_none());
        assert!(build_filter(&mk_filter("blur", 0.0, true)).is_none());
        assert!(build_filter(&mk_filter("hue", 0.0, true)).is_none());
        assert!(build_filter(&mk_filter("sharpen", 0.0, true)).is_none());
    }

    #[test]
    fn build_filter_param_accepts_string() {
        let mut params = std::collections::HashMap::new();
        params.insert("value".to_string(), serde_json::Value::from("1.5"));
        let f = Filter {
            id: "f".into(),
            filter_type: "contrast".into(),
            enabled: true,
            params,
        };
        assert_eq!(build_filter(&f).as_deref(), Some("eq=contrast=1.5"));
    }

    #[test]
    fn build_filters_string_joins_enabled() {
        let filters = vec![
            mk_filter("contrast", 1.2, true),
            mk_filter("brightness", 1.0, true), // no-op, dropped
            mk_filter("blur", 3.0, true),
        ];
        assert_eq!(
            build_filters_string(&filters),
            "eq=contrast=1.2,gblur=sigma=3"
        );
    }

    // ---- fade ----

    #[test]
    fn build_fade_in_and_out() {
        let f = build_fade(1.0, 2.0, 10.0).unwrap();
        assert!(f.contains("fade=t=in:st=0:d=1"));
        assert!(f.contains("fade=t=out:st=8:d=2"));
    }

    #[test]
    fn build_fade_in_only() {
        let f = build_fade(1.5, 0.0, 10.0).unwrap();
        assert_eq!(f, "fade=t=in:st=0:d=1.5");
    }

    #[test]
    fn build_fade_none_when_zero() {
        assert!(build_fade(0.0, 0.0, 10.0).is_none());
    }

    // ---- rotate ----

    #[test]
    fn build_rotate_none_for_zero() {
        assert!(build_rotate(&Transform::default()).is_none());
    }

    #[test]
    fn build_rotate_converts_degrees_to_radians() {
        let t = Transform {
            rotation: 90.0,
            ..Transform::default()
        };
        let r = build_rotate(&t).unwrap();
        assert!(r.starts_with("rotate="));
        // 90 degrees ~= 1.5708 rad
        assert!(r.contains("1.5707"));
    }

    // ---- filter graph integration ----

    #[test]
    fn filter_graph_applies_clip_filters_and_fade() {
        let mut p = base_project();
        let mut c = clip(ClipType::Video, "a.mp4");
        c.properties.fade_in = 1.0;
        c.properties.fade_out = 1.0;
        c.properties.filters = vec![mk_filter("contrast", 1.4, true)];
        c.properties.transform.rotation = 45.0;
        c.properties.transform.scale_x = 1.5;
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
        assert!(g.filter.contains("eq=contrast=1.4"));
        assert!(g.filter.contains("fade=t=in"));
        assert!(g.filter.contains("fade=t=out"));
        assert!(g.filter.contains("rotate="));
        assert!(g.filter.contains("scale=iw*1.5"));
    }

    // ---- codec selection ----

    #[test]
    fn select_codec_h264_uses_detected_encoder() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "h264".into();
        assert_eq!(select_codec_name(&s, &enc("libx264", false)), "libx264");
        assert_eq!(
            select_codec_name(&s, &enc("h264_nvenc", true)),
            "h264_nvenc"
        );
    }

    #[test]
    fn select_codec_h265_software_and_hardware() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "h265".into();
        assert_eq!(select_codec_name(&s, &enc("libx264", false)), "libx265");
        assert_eq!(
            select_codec_name(&s, &enc("h264_nvenc", true)),
            "hevc_nvenc"
        );
    }

    #[test]
    fn select_codec_vp9_and_av1() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "vp9".into();
        assert_eq!(select_codec_name(&s, &enc("libx264", false)), "libvpx-vp9");
        s.video_codec = "av1".into();
        assert_eq!(select_codec_name(&s, &enc("libx264", false)), "libaom-av1");
    }

    #[test]
    fn select_codec_webm_forces_vp9() {
        let mut s = base_settings();
        s.format = "webm".into();
        s.video_codec = "h264".into();
        assert_eq!(select_codec_name(&s, &enc("libx264", false)), "libvpx-vp9");
    }

    #[test]
    fn build_output_args_uses_crf_for_software() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "h264".into();
        s.crf = Some(20);
        let args = build_output_args(&s, &enc("libx264", false), false);
        assert!(args.windows(2).any(|w| w == ["-crf", "20"]));
        // CRF mode omits explicit bitrate.
        assert!(!args.iter().any(|a| a == "-b:v"));
    }

    #[test]
    fn build_output_args_crf_ignored_for_hardware() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.crf = Some(20);
        let args = build_output_args(&s, &enc("h264_nvenc", true), false);
        assert!(!args.iter().any(|a| a == "-crf"));
        // Hardware falls back to bitrate.
        assert!(args.iter().any(|a| a == "-b:v"));
    }

    #[test]
    fn build_output_args_explicit_preset_wins() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "h264".into();
        s.quality = "low".into();
        s.encoding_preset = "veryslow".into();
        let args = build_output_args(&s, &enc("libx264", false), false);
        assert!(args.windows(2).any(|w| w == ["-preset", "veryslow"]));
    }

    #[test]
    fn build_output_args_h265_uses_libx265() {
        let mut s = base_settings();
        s.format = "mp4".into();
        s.video_codec = "h265".into();
        let args = build_output_args(&s, &enc("libx264", false), false);
        assert!(args.windows(2).any(|w| w == ["-c:v", "libx265"]));
    }

    // ---- run_export (no real ffmpeg needed) ----

    fn export_fixture(dir: &Path) -> (Project, ExportSettings) {
        let src = dir.join("src.mp4");
        std::fs::write(&src, b"not really a video").unwrap();
        let mut p = base_project();
        p.tracks = vec![track(
            TrackType::Video,
            vec![clip(ClipType::Video, &src.to_string_lossy())],
        )];
        let mut s = base_settings();
        s.output_path = dir.join("out.mp4").to_string_lossy().into_owned();
        (p, s)
    }

    #[tokio::test]
    async fn run_export_rejects_bad_paths() {
        let dir = tempfile::tempdir().unwrap();
        let (mut p, mut s) = export_fixture(dir.path());
        let (tx, _rx) = mpsc::channel(8);
        s.output_path = dir.path().join("out.exe").to_string_lossy().into_owned();
        let err = run_export(
            Path::new("ffmpeg"),
            &enc("libx264", false),
            &p,
            &s,
            tx.clone(),
        )
        .await
        .unwrap_err();
        assert!(matches!(err, ClipyError::InvalidPath(_)), "{err:?}");

        let (_, good) = export_fixture(dir.path());
        p.tracks[0].clips[0].source_path = "concat:/a.mp4|/b.mp4".into();
        let err = run_export(Path::new("ffmpeg"), &enc("libx264", false), &p, &good, tx)
            .await
            .unwrap_err();
        assert!(matches!(err, ClipyError::InvalidPath(_)), "{err:?}");
    }

    #[tokio::test]
    async fn run_export_reports_spawn_failure() {
        let dir = tempfile::tempdir().unwrap();
        let (p, s) = export_fixture(dir.path());
        let (tx, mut rx) = mpsc::channel(8);
        let missing = dir.path().join("no-such-ffmpeg");
        let err = run_export(&missing, &enc("libx264", false), &p, &s, tx)
            .await
            .unwrap_err();
        assert!(matches!(err, ClipyError::FFmpeg(_)), "{err:?}");
        assert_eq!(rx.recv().await.unwrap().status, ExportStatus::Preparing);
    }

    #[tokio::test]
    async fn run_ffmpeg_and_probe_report_spawn_failure() {
        let missing = Path::new("/definitely/missing/ffmpeg");
        assert!(run_ffmpeg(missing, &[], "x").await.is_err());
        assert!(probe_with(missing, Path::new("/a.mp4")).await.is_err());
    }

    // ---- scripted ffmpeg/ffprobe (see test_support::fake_tool) ----

    use crate::test_support::{fake_tool, mock_app_in_tempdir, Script};

    const PROBE_JSON: &str = r#"{"format":{"duration":"3.5","bit_rate":"1000"},
        "streams":[{"codec_type":"video","codec_name":"h264","width":320,"height":240,
        "r_frame_rate":"25/1"},{"codec_type":"audio","codec_name":"aac"}]}"#;

    fn ok_with(stdout: &str) -> Script {
        Script {
            stdout: stdout.into(),
            ..Default::default()
        }
    }

    fn failing(stderr: &str) -> Script {
        Script {
            stderr: stderr.into(),
            exit_code: 1,
            ..Default::default()
        }
    }

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    /// A mock app whose binaries dir holds scripted ffmpeg/ffprobe, plus a
    /// media file to feed them.
    fn app_with_tools(
        ffmpeg: &Script,
        ffprobe: &Script,
    ) -> (tauri::App<tauri::test::MockRuntime>, PathBuf) {
        let app = mock_app_in_tempdir();
        let bin = crate::utils::paths::get_binaries_dir(app.handle()).unwrap();
        fake_tool(&bin, "ffmpeg", ffmpeg);
        fake_tool(&bin, "ffprobe", ffprobe);
        let media = bin.parent().unwrap().join("in.mp4");
        std::fs::write(&media, b"media").unwrap();
        (app, media)
    }

    #[tokio::test]
    async fn app_wrappers_run_the_resolved_tools() {
        let (app, media) = app_with_tools(&ok_with("ABCDEFGH"), &ok_with(PROBE_JSON));
        let app = app.handle();
        let dir = media.parent().unwrap();

        let meta = get_video_metadata(app, &s(&media)).await.unwrap();
        assert_eq!((meta.width, meta.height, meta.fps), (320, 240, 25.0));
        assert_eq!((meta.duration, meta.bitrate), (3.5, 1000));
        assert!(meta.has_audio);

        generate_thumbnail(app, &s(&media), &s(&dir.join("t.jpg")), 1.0)
            .await
            .unwrap();
        let thumbs = generate_timeline_thumbnails(app, &s(&media), &s(dir), 3, 160)
            .await
            .unwrap();
        assert_eq!(thumbs.len(), 3);
        assert!(thumbs[2].ends_with("thumb_0002.jpg"), "{thumbs:?}");

        // "ABCDEFGH" is two little-endian f32 samples.
        let wave = extract_waveform(app, &s(&media), 2).await.unwrap();
        assert_eq!(wave.len(), 2);
        assert!(wave.contains(&1.0) && wave.iter().all(|v| (0.0..=1.0).contains(v)));

        let settings = ExportSettings {
            use_hardware_acceleration: false,
            ..Default::default()
        };
        transcode_video(app, &s(&media), &s(&dir.join("t.mkv")), &settings)
            .await
            .unwrap();

        // Outputs and inputs are still validated before anything runs.
        assert!(
            generate_thumbnail(app, &s(&media), &s(&dir.join("t.exe")), 0.0)
                .await
                .is_err()
        );
        assert!(get_video_metadata(app, "concat:/a|/b").await.is_err());
    }

    #[tokio::test]
    async fn app_wrappers_surface_tool_failures() {
        let (app, media) = app_with_tools(&failing("boom: bad input"), &failing("no probe"));
        let app = app.handle();
        let dir = media.parent().unwrap();

        let err = get_video_metadata(app, &s(&media)).await.unwrap_err();
        assert!(
            err.to_string().contains("ffprobe failed: no probe"),
            "{err}"
        );
        let err = generate_thumbnail(app, &s(&media), &s(&dir.join("t.png")), 0.0)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("boom: bad input"), "{err}");
        assert!(
            generate_timeline_thumbnails(app, &s(&media), &s(dir), 2, 90)
                .await
                .is_err()
        );
        // A file without an audio stream simply has no waveform.
        assert!(extract_waveform(app, &s(&media), 10)
            .await
            .unwrap()
            .is_empty());
        let settings = ExportSettings {
            use_hardware_acceleration: false,
            ..Default::default()
        };
        let err = transcode_video(app, &s(&media), &s(&dir.join("o.mp4")), &settings)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Transcode failed"), "{err}");
    }

    #[test]
    fn encoder_preference_picks_first_reported_hardware_encoder() {
        let list = |names: &[&str]| names.iter().map(|n| n.to_string()).collect::<Vec<_>>();
        let cands = ["h264_nvenc", "h264_qsv"];
        let pick = pick_encoder(&list(&["aac", "h264_qsv", "h264_nvenc"]), &cands);
        assert_eq!((pick.name.as_str(), pick.hardware), ("h264_nvenc", true));
        let pick = pick_encoder(&list(&["h264_qsv"]), &cands);
        assert_eq!(pick.name, "h264_qsv");
        let pick = pick_encoder(&list(&["libx264"]), &cands);
        assert_eq!((pick.name.as_str(), pick.hardware), ("libx264", false));
        assert!(!HW_ENCODER_PREFERENCE.is_empty());
    }

    #[tokio::test]
    async fn hardware_request_probes_the_encoder_list() {
        let listing = " V..... = Video\n ------\n V....D h264_nvenc  NVENC\n A....D aac  AAC\n";
        let (app, media) = app_with_tools(&ok_with(listing), &ok_with(PROBE_JSON));
        let choice = select_video_encoder(app.handle(), true).await;
        // The encoder list is cached process-wide, so only check consistency.
        let cached = list_ffmpeg_encoders(app.handle()).await.unwrap();
        assert_eq!(
            choice.hardware,
            HW_ENCODER_PREFERENCE
                .iter()
                .any(|c| cached.iter().any(|e| e == c))
        );
        let soft = select_video_encoder(app.handle(), false).await;
        assert_eq!((soft.name.as_str(), soft.hardware), ("libx264", false));
        let settings = ExportSettings {
            use_hardware_acceleration: true,
            ..Default::default()
        };
        let out = media.with_extension("mkv");
        transcode_video(app.handle(), &s(&media), &s(&out), &settings)
            .await
            .unwrap();
    }

    fn drain(rx: &mut mpsc::Receiver<ExportProgress>) -> Vec<ExportProgress> {
        let mut all = Vec::new();
        while let Ok(p) = rx.try_recv() {
            all.push(p);
        }
        all
    }

    #[tokio::test]
    async fn export_reports_progress_until_end() {
        let _guard = EXPORT_TEST_LOCK.lock().await;
        reset_export_cancel();
        let progress = "frame=150\nfps=30\nprogress=continue\nframe=300\nprogress=end\n";
        let (app, _) = app_with_tools(&ok_with(progress), &Script::default());
        let dir = tempfile::tempdir().unwrap();
        let (p, mut settings) = export_fixture(dir.path());
        settings.use_hardware_acceleration = false;
        let (tx, mut rx) = mpsc::channel(64);

        let out = export_project(app.handle(), &p, &settings, tx)
            .await
            .unwrap();
        assert!(out.ends_with("out.mp4"), "{out:?}");
        let all = drain(&mut rx);
        let statuses: Vec<_> = all.iter().map(|p| p.status).collect();
        assert_eq!(statuses.first(), Some(&ExportStatus::Preparing));
        assert_eq!(statuses.last(), Some(&ExportStatus::Completed));
        let frame150 = all.iter().find(|p| p.current_frame == 150).unwrap();
        assert_eq!(frame150.total_frames, 300);
        assert!((frame150.progress - 50.0).abs() < 1e-9);
        // 100% is only reported once ffmpeg says `progress=end`.
        let frame300: Vec<f64> = all
            .iter()
            .filter(|p| p.current_frame == 300)
            .map(|p| p.progress)
            .collect();
        assert_eq!(frame300, [99.9, 100.0]);
    }

    #[tokio::test]
    async fn export_failure_carries_the_stderr_tail() {
        let _guard = EXPORT_TEST_LOCK.lock().await;
        reset_export_cancel();
        let dir = tempfile::tempdir().unwrap();
        let (p, s) = export_fixture(dir.path());
        let stderr: String = (0..30).map(|i| format!("line {i}\n")).collect();
        let ffmpeg = fake_tool(&dir.path().join("bin"), "ffmpeg", &failing(&stderr));

        let (tx, mut rx) = mpsc::channel(64);
        let err = run_export(&ffmpeg, &enc("libx264", false), &p, &s, tx)
            .await
            .unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("line 29") && !msg.contains("line 9\n"),
            "{msg}"
        );
        let last = drain(&mut rx).pop().unwrap();
        assert_eq!(last.status, ExportStatus::Failed);
        assert!(last.error.unwrap().contains("line 29"));

        let silent = fake_tool(&dir.path().join("bin2"), "ffmpeg", &failing(""));
        let (tx, mut rx) = mpsc::channel(64);
        let err = run_export(&silent, &enc("libx264", false), &p, &s, tx)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("unknown error"), "{err}");
        assert_eq!(
            drain(&mut rx).pop().unwrap().error.as_deref(),
            Some("Export failed")
        );
    }

    #[tokio::test]
    async fn pending_cancel_stops_export_and_removes_output() {
        let _guard = EXPORT_TEST_LOCK.lock().await;
        let dir = tempfile::tempdir().unwrap();
        let (p, s) = export_fixture(dir.path());
        std::fs::write(&s.output_path, b"partial").unwrap();
        let ffmpeg = fake_tool(&dir.path().join("bin"), "ffmpeg", &ok_with("frame=1\n"));

        request_export_cancel();
        let (tx, mut rx) = mpsc::channel(64);
        let err = run_export(&ffmpeg, &enc("libx264", false), &p, &s, tx)
            .await
            .unwrap_err();
        assert!(matches!(err, ClipyError::ExportFailed(_)), "{err:?}");
        assert!(!Path::new(&s.output_path).exists());
        assert!(!export_cancelled());
        assert_eq!(
            drain(&mut rx).pop().unwrap().status,
            ExportStatus::Cancelled
        );
    }

    #[tokio::test]
    async fn cancel_wakes_an_export_waiting_on_ffmpeg() {
        let _guard = EXPORT_TEST_LOCK.lock().await;
        reset_export_cancel();
        let dir = tempfile::tempdir().unwrap();
        let (p, s) = export_fixture(dir.path());
        let slow = Script {
            sleep_secs: 2,
            stdout: "frame=1\nprogress=end\n".into(),
            ..Default::default()
        };
        let ffmpeg = fake_tool(&dir.path().join("bin"), "ffmpeg", &slow);

        let (tx, mut rx) = mpsc::channel(64);
        let task =
            tokio::spawn(
                async move { run_export(&ffmpeg, &enc("libx264", false), &p, &s, tx).await },
            );
        while let Some(p) = rx.recv().await {
            if p.status == ExportStatus::Exporting {
                break;
            }
        }
        request_export_cancel();
        let err = task.await.unwrap().unwrap_err();
        assert!(matches!(err, ClipyError::ExportFailed(_)), "{err:?}");
        assert!(!export_cancelled());
    }
}

/// Tests that drive a real ffmpeg/ffprobe from PATH. Run with
/// `cargo test -- --ignored`.
// NOTE: the file lives under tests/live/ (no top-level .rs, so not its own
// Cargo test target) because these opt-in tests need external tools and are
// not part of the unit-coverage baseline.
#[cfg(test)]
#[path = "../../tests/live/ffmpeg.rs"]
mod ffmpeg_integration;
