//! yt-dlp service for video information extraction and downloading

use crate::error::{ClipyError, Result};
use crate::models::download::{DownloadOptions, DownloadProgress, DownloadStatus};
use crate::models::video::{VideoFormat, VideoInfo};
use crate::services::binary;
use crate::utils::{path_policy, validators};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Runtime};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Raw video info from yt-dlp JSON output
#[derive(Debug, Deserialize)]
struct YtdlpVideoInfo {
    id: String,
    title: String,
    description: Option<String>,
    thumbnail: Option<String>,
    duration: Option<f64>,
    channel: Option<String>,
    channel_id: Option<String>,
    upload_date: Option<String>,
    view_count: Option<u64>,
    like_count: Option<u64>,
    formats: Option<Vec<YtdlpFormat>>,
    is_live: Option<bool>,
    #[serde(default)]
    availability: Option<String>,
}

#[derive(Debug, Deserialize)]
struct YtdlpFormat {
    format_id: String,
    ext: Option<String>,
    resolution: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    filesize: Option<u64>,
    filesize_approx: Option<u64>,
    tbr: Option<f64>,
}

/// Validate a URL for yt-dlp, mapping failures to a `ClipyError`.
fn checked_url(url: &str) -> Result<String> {
    validators::validate_media_url(url).map_err(ClipyError::Ytdlp)
}

/// Arguments for a metadata-only `--dump-json` run.
///
/// SECURITY: `--` ends option parsing, so even a URL that slipped past
/// validation could never be read as a yt-dlp option.
fn build_info_args(url: &str) -> Result<Vec<String>> {
    let url = checked_url(url)?;
    Ok(vec![
        "--dump-json".into(),
        "--no-playlist".into(),
        "--no-warnings".into(),
        "--".into(),
        url,
    ])
}

/// Fetch video information from a URL
pub async fn fetch_video_info<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<VideoInfo> {
    info!("Fetching video info for: {}", url);
    let args = build_info_args(url)?;
    let ytdlp_path = binary::get_ytdlp_path(app)?;
    fetch_video_info_with(&ytdlp_path, &args).await
}

/// Run yt-dlp at `ytdlp_path` with prepared info `args` and parse the result.
async fn fetch_video_info_with(ytdlp_path: &Path, args: &[String]) -> Result<VideoInfo> {
    debug!("yt-dlp fetch args: {:?}", args);
    let output = ytdlp_command(ytdlp_path)
        .args(args)
        .output()
        .await
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to run yt-dlp: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        error!("yt-dlp error: {}", stderr);
        return Err(ClipyError::Ytdlp(format!("yt-dlp failed: {}", stderr)));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let raw_info: YtdlpVideoInfo = serde_json::from_str(&stdout)
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to parse video info: {}", e)))?;

    let video_info = convert_video_info(raw_info);
    debug!(
        "Fetched video info: {} (duration: {}s, {} formats)",
        video_info.title,
        video_info.duration,
        video_info.formats.len()
    );
    Ok(video_info)
}

/// A yt-dlp command with platform process settings applied.
///
/// On Unix the child gets its own process group (`process_group(0)`), so
/// signalling the group (`kill(-pid, ..)`) also reaches the ffmpeg children
/// yt-dlp spawns for merging/post-processing.
fn ytdlp_command(ytdlp_path: &Path) -> Command {
    let mut cmd = Command::new(ytdlp_path);
    #[cfg(unix)]
    cmd.process_group(0);
    cmd.kill_on_drop(true);
    cmd
}

/// Convert raw yt-dlp info to our VideoInfo model
fn convert_video_info(raw: YtdlpVideoInfo) -> VideoInfo {
    let formats = raw
        .formats
        .unwrap_or_default()
        .into_iter()
        .filter(|f| {
            // Filter to only include useful formats
            f.height.is_some() || f.acodec.as_ref().map(|c| c != "none").unwrap_or(false)
        })
        .map(|f| {
            // Calculate has_video/has_audio before moving vcodec/acodec
            let has_video = f.vcodec.as_ref().map(|c| c != "none").unwrap_or(false);
            let has_audio = f.acodec.as_ref().map(|c| c != "none").unwrap_or(false);

            VideoFormat {
                format_id: f.format_id,
                extension: f.ext.unwrap_or_else(|| "mp4".to_string()),
                resolution: f.resolution.unwrap_or_else(|| match (f.width, f.height) {
                    (Some(w), Some(h)) => format!("{}x{}", w, h),
                    _ => "unknown".to_string(),
                }),
                width: f.width.unwrap_or(0),
                height: f.height.unwrap_or(0),
                fps: f.fps.map(|fps| fps as u32).unwrap_or(0),
                vcodec: f.vcodec.unwrap_or_else(|| "none".to_string()),
                acodec: f.acodec.unwrap_or_else(|| "none".to_string()),
                filesize: f.filesize,
                filesize_approx: f.filesize_approx,
                tbr: f.tbr.unwrap_or(0.0),
                has_video,
                has_audio,
            }
        })
        .collect();

    VideoInfo {
        id: raw.id,
        title: raw.title,
        description: raw.description.unwrap_or_default(),
        thumbnail: raw.thumbnail.unwrap_or_default(),
        duration: raw.duration.map(|d| d as u64).unwrap_or(0),
        channel: raw.channel.unwrap_or_default(),
        channel_id: raw.channel_id.unwrap_or_default(),
        upload_date: raw.upload_date.unwrap_or_default(),
        view_count: raw.view_count.unwrap_or(0),
        like_count: raw.like_count.unwrap_or(0),
        formats,
        is_live: raw.is_live.unwrap_or(false),
        is_private: raw
            .availability
            .as_ref()
            .map(|a| a == "private")
            .unwrap_or(false),
    }
}

/// Environment-derived inputs to [`build_download_args`], resolved by the
/// caller so argument building stays pure.
#[derive(Debug, Clone, Default)]
pub(crate) struct DownloadContext {
    /// Directory containing ffmpeg, passed as `--ffmpeg-location`.
    pub ffmpeg_dir: Option<PathBuf>,
    /// File for `--download-archive` when the option is enabled.
    pub archive_path: Option<PathBuf>,
    /// Output directory used when `options.output_path` is empty.
    pub default_dir: PathBuf,
}

/// Build the full yt-dlp argv for a download.
///
/// SECURITY: the URL is validated as http(s) and placed after `--`, so it can
/// never be parsed as an option (e.g. `--exec`). Every other user-controlled
/// value is passed as the argument *of* a fixed option, and the output
/// template is confined to the download directory (see
/// [`build_output_template`]).
pub(crate) fn build_download_args(
    url: &str,
    options: &DownloadOptions,
    ctx: &DownloadContext,
) -> Result<Vec<String>> {
    let url = checked_url(url)?;
    let output_template = build_output_template(options, &ctx.default_dir)?;
    let format_selector = build_format_selector(options);

    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--print".to_string(),
        "after_move:filepath".to_string(), // Print the final filepath after all processing
        "-f".to_string(),
        format_selector,
        "-o".to_string(),
        output_template,
    ];

    // Merging bestvideo+bestaudio and any remux/extract step needs ffmpeg; a
    // GUI-launched app often has a narrower PATH than the user's shell, so the
    // resolved location is passed explicitly.
    if let Some(dir) = &ctx.ffmpeg_dir {
        args.push("--ffmpeg-location".to_string());
        args.push(dir.to_string_lossy().to_string());
    }

    if options.no_playlist {
        args.push("--no-playlist".to_string());
    }
    if !options.playlist_items.is_empty() {
        args.push("--playlist-items".to_string());
        args.push(options.playlist_items.clone());
    }

    if options.audio_only {
        args.push("-x".to_string());
        if !options.audio_format.is_empty() && options.audio_format != "best" {
            args.push("--audio-format".to_string());
            args.push(options.audio_format.clone());
        }
        if !options.audio_bitrate.is_empty() {
            args.push("--audio-quality".to_string());
            args.push(format!("{}K", options.audio_bitrate));
        }
    } else if options.format != "best" {
        args.push("--merge-output-format".to_string());
        args.push(options.format.clone());
    }

    if options.video_codec != "auto" && !options.video_codec.is_empty() {
        args.push("--format-sort".to_string());
        args.push(format!("vcodec:{}", options.video_codec));
    }

    // For mp4/mov, an embedded cover becomes a second (mjpeg) video stream that
    // WebView2's <video> refuses to play unless it is flagged attached_pic.
    if options.embed_thumbnail {
        args.push("--embed-thumbnail".to_string());
        let is_mp4_like = matches!(
            options.format.to_lowercase().as_str(),
            "mp4" | "mov" | "m4v"
        );
        if is_mp4_like && !options.audio_only {
            args.push("--ppa".to_string());
            args.push("EmbedThumbnail+ffmpeg_o:-disposition:v:1 attached_pic".to_string());
        }
    }

    if options.embed_metadata {
        args.push("--embed-metadata".to_string());
    }
    if options.download_chapters {
        args.push("--embed-chapters".to_string());
    }
    if options.split_by_chapters {
        args.push("--split-chapters".to_string());
    }

    if options.download_subtitles {
        args.push("--write-subs".to_string());
        if options.auto_subtitles {
            args.push("--write-auto-subs".to_string());
        }
        if !options.subtitle_languages.is_empty() {
            args.push("--sub-langs".to_string());
            args.push(options.subtitle_languages.join(","));
        }
        if !options.subtitle_format.is_empty() {
            args.push("--sub-format".to_string());
            args.push(options.subtitle_format.clone());
            args.push("--convert-subs".to_string());
            args.push(options.subtitle_format.clone());
        }
        if options.embed_subtitles {
            args.push("--embed-subs".to_string());
        }
    }

    if options.sponsor_block {
        args.push("--sponsorblock-remove".to_string());
        if !options.sponsor_block_categories.is_empty() {
            args.push(options.sponsor_block_categories.join(","));
        } else {
            args.push("sponsor".to_string());
        }
    }

    for (enabled, flag) in [
        (options.write_info_json, "--write-info-json"),
        (options.write_description, "--write-description"),
        (options.write_comments, "--write-comments"),
        (options.write_thumbnail, "--write-thumbnail"),
        (options.keep_original, "-k"),
    ] {
        if enabled {
            args.push(flag.to_string());
        }
    }

    for (value, flag) in [
        (&options.max_filesize, "--max-filesize"),
        (&options.rate_limit, "-r"),
        (&options.remux_video, "--remux-video"),
        (&options.cookies_from_browser, "--cookies-from-browser"),
    ] {
        if !value.is_empty() {
            args.push(flag.to_string());
            args.push(value.clone());
        }
    }

    if options.concurrent_fragments > 1 {
        args.push("-N".to_string());
        args.push(options.concurrent_fragments.to_string());
    }

    if !options.proxy_url.is_empty() {
        args.push("--proxy".to_string());
        args.push(options.proxy_url.clone());
    }

    if options.restrict_filenames {
        args.push("--restrict-filenames".to_string());
    }

    if options.use_download_archive {
        if let Some(archive) = &ctx.archive_path {
            args.push("--download-archive".to_string());
            args.push(archive.to_string_lossy().to_string());
        }
    }

    if options.geo_bypass {
        args.push("--geo-bypass".to_string());
    }

    args.push("--".to_string());
    args.push(url);
    Ok(args)
}

/// Copy of `args` with the `--proxy` value's credentials masked, for logging.
fn redact_args(args: &[String]) -> Vec<String> {
    let mut out = args.to_vec();
    for i in 1..out.len() {
        if out[i - 1] == "--proxy" {
            out[i] = validators::redact_url_credentials(&out[i]);
        }
    }
    out
}

/// Download a video with progress reporting
pub async fn download_video<R: Runtime>(
    app: &AppHandle<R>,
    download_id: String,
    url: &str,
    options: &DownloadOptions,
    progress_tx: mpsc::Sender<DownloadProgress>,
) -> Result<PathBuf> {
    info!("Starting download {}: {}", download_id, url);
    debug!(
        "Download options (proxy redacted): {:?}",
        DownloadOptions {
            proxy_url: validators::redact_url_credentials(&options.proxy_url),
            ..options.clone()
        }
    );

    let ctx = DownloadContext {
        ffmpeg_dir: match binary::get_ffmpeg_path(app) {
            Ok(p) => Some(p.parent().map(Path::to_path_buf).unwrap_or(p)),
            Err(_) => {
                warn!("ffmpeg not found; merge/convert steps may fail");
                None
            }
        },
        archive_path: if options.use_download_archive {
            crate::utils::paths::get_download_archive_path(app).ok()
        } else {
            None
        },
        default_dir: crate::utils::paths::get_default_downloads_dir(),
    };
    let args = build_download_args(url, options, &ctx)?;
    if options.output_path.trim().is_empty() {
        // An empty base used to resolve to the drive root on Windows; make
        // sure the fallback directory exists instead.
        let _ = std::fs::create_dir_all(&ctx.default_dir);
    }
    let ytdlp_path = binary::get_ytdlp_path(app)?;
    let output_dir = if options.output_path.trim().is_empty() {
        ctx.default_dir.to_string_lossy().into_owned()
    } else {
        options.output_path.clone()
    };
    run_download(&ytdlp_path, &args, &download_id, &output_dir, progress_tx).await
}

/// Running state extracted from yt-dlp's output while a download runs.
#[derive(Debug, Default)]
struct OutputTracker {
    /// Final file path reported by yt-dlp, if seen.
    captured_file_path: Option<String>,
    /// Last few error/warning lines, used as the failure reason.
    stderr_tail: Vec<String>,
}

/// Media extensions yt-dlp may produce as the final file.
const OUTPUT_EXTENSIONS: &[&str] = &[
    ".mp4", ".mkv", ".webm", ".m4a", ".mp3", ".opus", ".flac", ".wav", ".avi", ".mov",
];

/// Whether `line` looks like the bare file path printed by
/// `--print after_move:filepath`.
fn looks_like_output_path(line: &str) -> bool {
    !line.starts_with('[')
        && (line.contains('/') || line.contains('\\'))
        && OUTPUT_EXTENSIONS.iter().any(|ext| line.ends_with(ext))
}

impl OutputTracker {
    /// Record one line of yt-dlp output from `stderr` or stdout.
    fn observe(&mut self, line: &str, from_stderr: bool) {
        let trimmed = line.trim();
        if from_stderr
            && (trimmed.starts_with("ERROR")
                || trimmed.starts_with("WARNING")
                || trimmed.to_lowercase().contains("error"))
        {
            self.stderr_tail.push(trimmed.to_string());
            if self.stderr_tail.len() > 10 {
                self.stderr_tail.remove(0);
            }
        }

        if looks_like_output_path(trimmed) {
            // Late stderr lines must not override a path already captured.
            if !from_stderr || self.captured_file_path.is_none() {
                self.captured_file_path = Some(trimmed.to_string());
            }
        }

        if let Some(path) = line.split("[download] Destination:").nth(1) {
            self.captured_file_path = Some(path.trim().to_string());
        } else if line.contains("[Merger] Merging formats into") {
            if let (Some(start), Some(end)) = (line.find('"'), line.rfind('"')) {
                if end > start {
                    self.captured_file_path = Some(line[start + 1..end].to_string());
                }
            }
        } else if line.contains("[MoveFiles] Moving file") && line.contains(" to ") {
            if let Some(to_part) = line.split(" to ").last() {
                self.captured_file_path = Some(to_part.trim().trim_matches('"').to_string());
            }
        }
    }

    /// Failure reason for a non-zero exit.
    fn failure_reason(&self, code: Option<i32>) -> String {
        if self.stderr_tail.is_empty() {
            format!(
                "yt-dlp exited with status {}",
                code.map(|c| c.to_string())
                    .unwrap_or_else(|| "unknown".into())
            )
        } else {
            self.stderr_tail.join("; ")
        }
    }
}

fn downloading(download_id: &str, p: (f64, u64, u64, u64, u64)) -> DownloadProgress {
    DownloadProgress {
        download_id: download_id.to_string(),
        status: DownloadStatus::Downloading,
        progress: p.0,
        downloaded_bytes: p.1,
        total_bytes: p.2,
        speed: p.3,
        eta: p.4,
        file_path: None,
    }
}

/// Spawn yt-dlp with prepared `args`, stream progress, and locate the result.
async fn run_download(
    ytdlp_path: &Path,
    args: &[String],
    download_id: &str,
    output_dir: &str,
    progress_tx: mpsc::Sender<DownloadProgress>,
) -> Result<PathBuf> {
    debug!("yt-dlp args: {:?}", redact_args(args));

    let mut child = ytdlp_command(ytdlp_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to spawn yt-dlp: {}", e)))?;

    if let Some(pid) = child.id() {
        if let Some(registry) = crate::services::process_registry::get_registry() {
            registry.register(download_id, pid).await;
        }
    }

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| ClipyError::Ytdlp("Failed to capture stdout".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| ClipyError::Ytdlp("Failed to capture stderr".into()))?;
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let _ = progress_tx
        .send(downloading(download_id, (0.0, 0, 0, 0, 0)))
        .await;

    let mut tracker = OutputTracker::default();
    let mut stdout_open = true;
    let mut stderr_open = true;

    // yt-dlp writes progress to stdout (with --newline) and errors to stderr.
    // A closed stream is excluded from the select via its guard, so EOF on one
    // pipe can no longer make the loop spin on an immediately-ready branch.
    while stdout_open || stderr_open {
        let (line, from_stderr) = tokio::select! {
            r = stdout_reader.next_line(), if stdout_open => match r {
                Ok(Some(line)) => (line, false),
                Ok(None) | Err(_) => {
                    stdout_open = false;
                    continue;
                }
            },
            r = stderr_reader.next_line(), if stderr_open => match r {
                Ok(Some(line)) => (line, true),
                Ok(None) | Err(_) => {
                    stderr_open = false;
                    continue;
                }
            },
        };

        debug!(
            "yt-dlp ({}): {}",
            if from_stderr { "stderr" } else { "stdout" },
            line
        );
        tracker.observe(&line, from_stderr);
        if let Some(p) = parse_progress_line(&line) {
            if let Err(e) = progress_tx.send(downloading(download_id, p)).await {
                error!("Failed to send progress to channel: {}", e);
            }
        }
    }

    let status = child
        .wait()
        .await
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to wait for yt-dlp: {}", e)))?;

    if let Some(registry) = crate::services::process_registry::get_registry() {
        registry.unregister(download_id).await;
    }

    if !status.success() {
        let reason = tracker.failure_reason(status.code());
        error!("yt-dlp download failed: {}", reason);
        return Err(ClipyError::Ytdlp(reason));
    }

    let _ = progress_tx
        .send(DownloadProgress {
            status: DownloadStatus::Completed,
            progress: 100.0,
            ..downloading(download_id, (0.0, 0, 0, 0, 0))
        })
        .await;

    let output_path = find_downloaded_file(output_dir, tracker.captured_file_path.as_deref())?;
    info!("Download completed: {:?}", output_path);
    Ok(output_path)
}

/// Reject a user-supplied filename/template that could escape the download
/// directory: absolute paths, drive or UNC prefixes, and `..` components.
fn check_relative_template(template: &str) -> Result<()> {
    let bad = |why: &str| {
        Err(ClipyError::Ytdlp(format!(
            "Invalid filename template ({why}): {template:?}"
        )))
    };
    if template.contains('\0') {
        return bad("NUL byte");
    }
    if template.starts_with('/') || template.starts_with('\\') {
        return bad("absolute path");
    }
    let b = template.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        return bad("drive prefix");
    }
    if template.split(['/', '\\']).any(|part| part.trim() == "..") {
        return bad("parent directory component");
    }
    Ok(())
}

/// Compose the yt-dlp `-o` output template from filename/organization options.
///
/// Precedence:
/// 1. An explicit `filename` (legacy per-download override) wins.
/// 2. A non-empty `filename_template` is used (advanced users).
/// 3. Otherwise build from `create_channel_subfolder` + `include_date_in_filename`.
///
/// SECURITY: user templates must be relative and free of `..`, so the result
/// always lives under the download directory. An empty `output_path` falls
/// back to `default_dir` (it used to resolve to the drive root on Windows).
fn build_output_template(options: &DownloadOptions, default_dir: &Path) -> Result<String> {
    let name_part = if !options.filename.is_empty() {
        check_relative_template(&options.filename)?;
        options.filename.clone()
    } else if !options.filename_template.is_empty() {
        check_relative_template(&options.filename_template)?;
        options.filename_template.clone()
    } else {
        let mut t = String::new();
        if options.create_channel_subfolder {
            t.push_str("%(channel)s/");
        }
        if options.include_date_in_filename {
            t.push_str("%(upload_date)s - ");
        }
        t.push_str("%(title)s.%(ext)s");
        t
    };

    let base = options.output_path.trim();
    let base_dir = if base.is_empty() {
        default_dir.to_string_lossy().to_string()
    } else {
        path_policy::validate_raw_path(base)?;
        base.to_string()
    };

    Ok(format!(
        "{}/{}",
        base_dir.trim_end_matches(['/', '\\']),
        name_part
    ))
}

/// Build format selector string for yt-dlp
fn build_format_selector(options: &DownloadOptions) -> String {
    if options.audio_only {
        // Audio-only download
        let audio_ext = if options.audio_format.is_empty() || options.audio_format == "best" {
            "m4a"
        } else {
            &options.audio_format
        };
        return format!("bestaudio[ext={}]/bestaudio/best", audio_ext);
    }

    // Video + audio download
    let quality = &options.quality;

    // Build video codec preference
    let vcodec_pref = match options.video_codec.as_str() {
        "h264" => "[vcodec^=avc]",
        "h265" => "[vcodec^=hev]",
        "vp9" => "[vcodec^=vp9]",
        "av1" => "[vcodec^=av01]",
        _ => "",
    };

    match quality.as_str() {
        "2160" | "4k" => format!(
            "bestvideo[height<=2160]{}+bestaudio/best[height<=2160]",
            vcodec_pref
        ),
        "1440" | "2k" => format!(
            "bestvideo[height<=1440]{}+bestaudio/best[height<=1440]",
            vcodec_pref
        ),
        "1080" => format!(
            "bestvideo[height<=1080]{}+bestaudio/best[height<=1080]",
            vcodec_pref
        ),
        "720" => format!(
            "bestvideo[height<=720]{}+bestaudio/best[height<=720]",
            vcodec_pref
        ),
        "480" => format!(
            "bestvideo[height<=480]{}+bestaudio/best[height<=480]",
            vcodec_pref
        ),
        "360" => format!(
            "bestvideo[height<=360]{}+bestaudio/best[height<=360]",
            vcodec_pref
        ),
        "240" => format!(
            "bestvideo[height<=240]{}+bestaudio/best[height<=240]",
            vcodec_pref
        ),
        "144" => format!(
            "bestvideo[height<=144]{}+bestaudio/best[height<=144]",
            vcodec_pref
        ),
        _ => format!("bestvideo{}+bestaudio/best", vcodec_pref),
    }
}

/// Parse progress information from yt-dlp output line
fn parse_progress_line(line: &str) -> Option<(f64, u64, u64, u64, u64)> {
    // yt-dlp progress format: [download]  XX.X% of XXX.XXMIB at XXX.XXKIB/s ETA XX:XX
    // Example: [download]  50.0% of 100.00MiB at 5.00MiB/s ETA 00:10

    // Must contain [download] and % to be a progress line
    if !line.contains("[download]") {
        return None;
    }

    // Skip non-progress download lines like "[download] Destination: ..."
    if !line.contains("%") {
        debug!("Skipping non-progress [download] line: {}", line);
        return None;
    }

    debug!("Parsing progress line: {}", line);

    let mut progress = 0.0;
    let mut downloaded = 0u64;
    let mut total = 0u64;
    let mut speed = 0u64;
    let mut eta = 0u64;

    // Extract percentage
    if let Some(pct_idx) = line.find('%') {
        let start = line[..pct_idx]
            .rfind(char::is_whitespace)
            .map(|i| i + 1)
            .unwrap_or(0);
        let pct_str = line[start..pct_idx].trim();
        match pct_str.parse::<f64>() {
            Ok(pct) => {
                progress = pct;
                debug!("Parsed percentage: {}%", progress);
            }
            Err(e) => {
                debug!("Failed to parse percentage from '{}': {}", pct_str, e);
            }
        }
    }

    // Extract total size
    if let Some(of_idx) = line.find(" of ") {
        let after_of = &line[of_idx + 4..];
        if let Some(space_idx) = after_of.find(' ') {
            let size_str = &after_of[..space_idx];
            total = parse_size(size_str);
            downloaded = ((progress / 100.0) * total as f64) as u64;
            debug!(
                "Parsed size: {} bytes total, {} bytes downloaded",
                total, downloaded
            );
        }
    }

    // Extract speed
    if let Some(at_idx) = line.find(" at ") {
        let after_at = &line[at_idx + 4..];
        if let Some(space_idx) = after_at.find(' ') {
            let speed_str = &after_at[..space_idx];
            speed = parse_speed(speed_str);
            debug!("Parsed speed: {} bytes/s", speed);
        }
    }

    // Extract ETA
    if let Some(eta_idx) = line.find("ETA ") {
        let after_eta = &line[eta_idx + 4..];
        eta = parse_eta(after_eta.trim());
        debug!("Parsed ETA: {} seconds", eta);
    }

    // Only return Some if we got a valid progress percentage
    if progress > 0.0 || line.contains("100%") {
        info!(
            "Progress update: {}% ({}/{} bytes) @ {} B/s, ETA {} s",
            progress, downloaded, total, speed, eta
        );
        Some((progress, downloaded, total, speed, eta))
    } else {
        debug!("No valid progress found in line");
        None
    }
}

/// Parse size string (e.g., "123.45MiB") to bytes
fn parse_size(s: &str) -> u64 {
    let s = s.trim();
    let (num_str, unit) = s.split_at(s.find(|c: char| c.is_alphabetic()).unwrap_or(s.len()));
    let num: f64 = num_str.parse().unwrap_or(0.0);

    let multiplier = match unit.to_uppercase().as_str() {
        "KIB" | "KB" => 1024.0,
        "MIB" | "MB" => 1024.0 * 1024.0,
        "GIB" | "GB" => 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };

    (num * multiplier) as u64
}

/// Parse speed string (e.g., "1.23MiB/s") to bytes per second
fn parse_speed(s: &str) -> u64 {
    let s = s.trim().trim_end_matches("/s");
    parse_size(s)
}

/// Parse ETA string (e.g., "01:23" or "Unknown") to seconds
fn parse_eta(s: &str) -> u64 {
    let s = s.trim();
    if s == "Unknown" || s.is_empty() {
        return 0;
    }

    let parts: Vec<&str> = s.split(':').collect();
    match parts.len() {
        2 => {
            let mins: u64 = parts[0].parse().unwrap_or(0);
            let secs: u64 = parts[1].parse().unwrap_or(0);
            mins * 60 + secs
        }
        3 => {
            let hours: u64 = parts[0].parse().unwrap_or(0);
            let mins: u64 = parts[1].parse().unwrap_or(0);
            let secs: u64 = parts[2].parse().unwrap_or(0);
            hours * 3600 + mins * 60 + secs
        }
        _ => 0,
    }
}

/// Find the downloaded file by scanning the output directory for the newest matching file
fn find_downloaded_file(output_dir: &str, captured_path: Option<&str>) -> Result<PathBuf> {
    debug!("Finding downloaded file in: {}", output_dir);
    debug!("Captured path from yt-dlp: {:?}", captured_path);

    // If we captured the actual path from yt-dlp output, use that
    if let Some(path) = captured_path {
        let path = PathBuf::from(path);
        if path.exists() {
            debug!("Using captured path: {:?}", path);
            return Ok(path);
        }
        debug!("Captured path doesn't exist, falling back to directory scan");
    }

    // Fallback: scan directory for newest video/audio file
    let dir = std::path::Path::new(output_dir);
    if !dir.exists() {
        return Err(ClipyError::Ytdlp(format!(
            "Output directory does not exist: {}",
            output_dir
        )));
    }

    let video_extensions = [
        "mp4", "mkv", "webm", "avi", "mov", "m4a", "mp3", "opus", "flac", "wav",
    ];

    let mut newest_file: Option<(PathBuf, std::time::SystemTime)> = None;

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_string_lossy().to_lowercase();
                    if video_extensions.contains(&ext_str.as_str()) {
                        if let Ok(metadata) = entry.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                match &newest_file {
                                    None => newest_file = Some((path, modified)),
                                    Some((_, prev_time)) if modified > *prev_time => {
                                        newest_file = Some((path, modified));
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    newest_file
        .map(|(path, _)| path)
        .ok_or_else(|| ClipyError::Ytdlp("Could not find downloaded file".into()))
}

/// Get available qualities for a video
pub fn get_available_qualities(video_info: &VideoInfo) -> Vec<String> {
    let mut heights: Vec<u32> = video_info
        .formats
        .iter()
        .filter(|f| f.has_video && f.height > 0)
        .map(|f| f.height)
        .collect();

    heights.sort();
    heights.dedup();
    heights.reverse();

    heights.iter().map(|h| format!("{}p", h)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::download::DownloadOptions;
    use crate::models::video::{VideoFormat, VideoInfo};

    // ---- parse_size ----

    #[test]
    fn parse_size_units() {
        assert_eq!(parse_size("1KiB"), 1024);
        assert_eq!(parse_size("1KB"), 1024);
        assert_eq!(parse_size("1MiB"), 1024 * 1024);
        assert_eq!(parse_size("1GiB"), 1024 * 1024 * 1024);
        assert_eq!(parse_size("100"), 100); // plain bytes, no unit
        assert_eq!(parse_size("2.5MiB"), (2.5 * 1024.0 * 1024.0) as u64);
    }

    #[test]
    fn parse_size_invalid_returns_zero() {
        assert_eq!(parse_size("N/A"), 0);
        assert_eq!(parse_size("~"), 0);
        assert_eq!(parse_size(""), 0);
    }

    // ---- parse_speed ----

    #[test]
    fn parse_speed_strips_per_second() {
        assert_eq!(parse_speed("1MiB/s"), 1024 * 1024);
        assert_eq!(parse_speed("512KiB/s"), 512 * 1024);
        assert_eq!(parse_speed("N/A"), 0);
    }

    // ---- parse_eta ----

    #[test]
    fn parse_eta_formats() {
        assert_eq!(parse_eta("01:23"), 83);
        assert_eq!(parse_eta("00:10"), 10);
        assert_eq!(parse_eta("01:02:03"), 3723);
        assert_eq!(parse_eta("Unknown"), 0);
        assert_eq!(parse_eta(""), 0);
        assert_eq!(parse_eta("12"), 0); // single component -> 0
    }

    // ---- parse_progress_line ----

    #[test]
    fn parse_progress_line_full() {
        let line = "[download]  50.0% of 100.00MiB at 5.00MiB/s ETA 00:10";
        let (pct, downloaded, total, speed, eta) = parse_progress_line(line).unwrap();
        assert_eq!(pct, 50.0);
        assert_eq!(total, 100 * 1024 * 1024);
        assert_eq!(downloaded, total / 2);
        assert_eq!(speed, 5 * 1024 * 1024);
        assert_eq!(eta, 10);
    }

    #[test]
    fn parse_progress_line_non_progress_returns_none() {
        assert!(parse_progress_line("[download] Destination: /tmp/x.mp4").is_none());
        assert!(parse_progress_line("some other log line").is_none());
    }

    #[test]
    fn parse_progress_line_hundred_percent() {
        let line = "[download] 100% of 10.00MiB";
        let r = parse_progress_line(line);
        assert!(r.is_some());
        assert_eq!(r.unwrap().0, 100.0);
    }

    // ---- build_format_selector ----

    fn opts() -> DownloadOptions {
        DownloadOptions::default()
    }

    #[test]
    fn format_selector_quality_height_caps() {
        let mut o = opts();
        o.video_codec = "auto".into();
        for (q, h) in [("1080", 1080), ("720", 720), ("480", 480), ("360", 360)] {
            o.quality = q.into();
            let sel = build_format_selector(&o);
            assert_eq!(
                sel,
                format!("bestvideo[height<={h}]+bestaudio/best[height<={h}]")
            );
        }
    }

    #[test]
    fn format_selector_4k_alias() {
        let mut o = opts();
        o.quality = "4k".into();
        assert_eq!(
            build_format_selector(&o),
            "bestvideo[height<=2160]+bestaudio/best[height<=2160]"
        );
    }

    #[test]
    fn format_selector_unknown_quality_is_best() {
        let mut o = opts();
        o.quality = "weird".into();
        assert_eq!(build_format_selector(&o), "bestvideo+bestaudio/best");
    }

    #[test]
    fn format_selector_codec_preference() {
        let mut o = opts();
        o.quality = "1080".into();
        o.video_codec = "h264".into();
        assert_eq!(
            build_format_selector(&o),
            "bestvideo[height<=1080][vcodec^=avc]+bestaudio/best[height<=1080]"
        );
        o.video_codec = "av1".into();
        assert!(build_format_selector(&o).contains("[vcodec^=av01]"));
    }

    #[test]
    fn format_selector_audio_only() {
        let mut o = opts();
        o.audio_only = true;
        o.audio_format = "mp3".into();
        assert_eq!(
            build_format_selector(&o),
            "bestaudio[ext=mp3]/bestaudio/best"
        );
    }

    #[test]
    fn format_selector_audio_only_best_defaults_to_m4a() {
        let mut o = opts();
        o.audio_only = true;
        o.audio_format = "best".into();
        assert_eq!(
            build_format_selector(&o),
            "bestaudio[ext=m4a]/bestaudio/best"
        );
    }

    // ---- build_output_template ----

    /// An absolute download dir valid on the host OS.
    fn base() -> String {
        if cfg!(windows) {
            "C:/downloads"
        } else {
            "/downloads"
        }
        .into()
    }

    /// Build the template and normalize the host-specific base to
    /// `/downloads` so expectations read the same on every OS.
    fn tmpl(o: &DownloadOptions) -> String {
        build_output_template(o, Path::new("/unused"))
            .unwrap()
            .replacen(&base(), "/downloads", 1)
    }

    #[test]
    fn output_template_rejects_escapes() {
        for bad in [
            "../evil.%(ext)s",
            "a/../../evil.%(ext)s",
            "a\\..\\evil",
            "/etc/cron.d/x",
            "\\\\host\\share\\x",
            "C:/Windows/x.%(ext)s",
            "c:x",
            " .. /x",
            "a\0b",
        ] {
            let mut o = opts();
            o.output_path = base();
            o.filename_template = bad.into();
            assert!(
                build_output_template(&o, Path::new("/d")).is_err(),
                "{bad:?}"
            );
            let mut o = opts();
            o.output_path = base();
            o.filename = bad.into();
            assert!(
                build_output_template(&o, Path::new("/d")).is_err(),
                "{bad:?}"
            );
        }
        let mut o = opts();
        o.output_path = base();
        o.filename_template = "%(uploader)s/..%(title)s.%(ext)s".into();
        assert!(build_output_template(&o, Path::new("/d")).is_ok());
    }

    #[test]
    fn output_template_base_dir_rules() {
        let mut o = opts();
        o.output_path = "  ".into();
        assert_eq!(
            build_output_template(&o, Path::new("/fallback")).unwrap(),
            format!("{}/%(title)s.%(ext)s", Path::new("/fallback").display())
        );
        o.output_path = format!("{}/", base());
        assert_eq!(tmpl(&o), "/downloads/%(title)s.%(ext)s");
        for bad in ["relative/dir", "https://x/y", "-o"] {
            o.output_path = bad.into();
            assert!(build_output_template(&o, Path::new("/d")).is_err(), "{bad}");
        }
    }

    // ---- build_download_args ----

    fn ctx() -> DownloadContext {
        DownloadContext {
            ffmpeg_dir: Some(PathBuf::from("/opt/ffmpeg/bin")),
            archive_path: Some(PathBuf::from("/data/archive.txt")),
            default_dir: PathBuf::from("/d"),
        }
    }

    const URL: &str = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

    #[test]
    fn download_args_end_with_double_dash_and_url() {
        let mut o = opts();
        o.output_path = base();
        let args = build_download_args(URL, &o, &ctx()).unwrap();
        let n = args.len();
        assert_eq!(args[n - 2], "--");
        assert_eq!(args[n - 1], URL);
        assert_eq!(args.iter().filter(|a| *a == "--").count(), 1);
        assert!(args
            .windows(2)
            .any(|w| w == ["--ffmpeg-location", "/opt/ffmpeg/bin"]));
        assert!(!args.iter().any(|a| a == "--download-archive"));
    }

    #[test]
    fn download_args_reject_malicious_urls() {
        let mut o = opts();
        o.output_path = base();
        for bad in [
            "--exec=calc.exe",
            "-o/tmp/x",
            "file:///etc/passwd",
            "ftp://x/y",
            "https://x.com/a --exec calc",
            "",
        ] {
            assert!(build_download_args(bad, &o, &ctx()).is_err(), "{bad:?}");
            assert!(build_info_args(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn info_args_use_double_dash() {
        let args = build_info_args(&format!("  {URL} ")).unwrap();
        assert_eq!(
            args,
            vec!["--dump-json", "--no-playlist", "--no-warnings", "--", URL]
        );
    }

    #[test]
    fn download_args_cover_every_option() {
        let o = DownloadOptions {
            output_path: base(),
            audio_only: true,
            audio_format: "mp3".into(),
            audio_bitrate: "320".into(),
            video_codec: "av1".into(),
            embed_thumbnail: true,
            embed_metadata: true,
            download_chapters: true,
            split_by_chapters: true,
            download_subtitles: true,
            auto_subtitles: true,
            subtitle_languages: vec!["en".into(), "de".into()],
            subtitle_format: "vtt".into(),
            embed_subtitles: true,
            sponsor_block: true,
            sponsor_block_categories: vec!["sponsor".into(), "intro".into()],
            write_info_json: true,
            write_description: true,
            write_comments: true,
            write_thumbnail: true,
            keep_original: true,
            max_filesize: "500M".into(),
            rate_limit: "1M".into(),
            remux_video: "mkv".into(),
            cookies_from_browser: "firefox".into(),
            concurrent_fragments: 4,
            proxy_url: "http://u:p@proxy:8080".into(),
            restrict_filenames: true,
            use_download_archive: true,
            geo_bypass: true,
            playlist_items: "1-3".into(),
            no_playlist: true,
            ..DownloadOptions::default()
        };
        let args = build_download_args(URL, &o, &ctx()).unwrap();
        let has = |pair: [&str; 2]| args.windows(2).any(|w| w == pair);
        assert!(has(["--audio-format", "mp3"]));
        assert!(has(["--audio-quality", "320K"]));
        assert!(has(["--format-sort", "vcodec:av1"]));
        assert!(has(["--sub-langs", "en,de"]));
        assert!(has(["--convert-subs", "vtt"]));
        assert!(has(["--sponsorblock-remove", "sponsor,intro"]));
        assert!(has(["--max-filesize", "500M"]));
        assert!(has(["-r", "1M"]));
        assert!(has(["--remux-video", "mkv"]));
        assert!(has(["--cookies-from-browser", "firefox"]));
        assert!(has(["-N", "4"]));
        assert!(has(["--proxy", "http://u:p@proxy:8080"]));
        assert!(has(["--download-archive", "/data/archive.txt"]));
        assert!(has(["--playlist-items", "1-3"]));
        for flag in [
            "-x",
            "--embed-thumbnail",
            "--embed-metadata",
            "--embed-chapters",
            "--split-chapters",
            "--write-subs",
            "--write-auto-subs",
            "--embed-subs",
            "--write-info-json",
            "--write-description",
            "--write-comments",
            "--write-thumbnail",
            "-k",
            "--restrict-filenames",
            "--geo-bypass",
            "--no-playlist",
        ] {
            assert!(args.iter().any(|a| a == flag), "{flag}");
        }
        // Audio-only never asks for the attached_pic remap.
        assert!(!args.iter().any(|a| a == "--ppa"));
        assert_eq!(args[args.len() - 2..], ["--", URL]);

        let logged = redact_args(&args);
        assert!(!logged.iter().any(|a| a.contains("u:p@")));
        assert!(logged.iter().any(|a| a.contains("***@proxy")));
    }

    #[test]
    fn download_args_video_mp4_thumbnail_and_defaults() {
        let o = DownloadOptions {
            output_path: base(),
            embed_thumbnail: true,
            sponsor_block: true,
            format: "mp4".into(),
            ..DownloadOptions::default()
        };
        let mut c = ctx();
        c.ffmpeg_dir = None;
        let args = build_download_args(URL, &o, &c).unwrap();
        assert!(args
            .windows(2)
            .any(|w| w == ["--merge-output-format", "mp4"]));
        assert!(args.windows(2).any(|w| w[0] == "--ppa"));
        assert!(args
            .windows(2)
            .any(|w| w == ["--sponsorblock-remove", "sponsor"]));
        assert!(!args.iter().any(|a| a == "--ffmpeg-location"));

        let best = DownloadOptions {
            output_path: base(),
            format: "best".into(),
            ..DownloadOptions::default()
        };
        let args = build_download_args(URL, &best, &c).unwrap();
        assert!(!args.iter().any(|a| a == "--merge-output-format"));
    }

    // ---- output tracking ----

    #[test]
    fn tracker_captures_paths_and_errors() {
        let mut t = OutputTracker::default();
        t.observe("[download] Destination: /d/a.f137.mp4", false);
        assert_eq!(t.captured_file_path.as_deref(), Some("/d/a.f137.mp4"));
        t.observe("[Merger] Merging formats into \"/d/a.mp4\"", false);
        assert_eq!(t.captured_file_path.as_deref(), Some("/d/a.mp4"));
        t.observe(
            "[MoveFiles] Moving file \"/tmp/a.mkv\" to \"/d/b.mkv\"",
            false,
        );
        assert_eq!(t.captured_file_path.as_deref(), Some("/d/b.mkv"));
        t.observe("C:\\Users\\x\\Videos\\final.webm", false);
        assert_eq!(
            t.captured_file_path.as_deref(),
            Some("C:\\Users\\x\\Videos\\final.webm")
        );
        // A path-like stderr line does not override an existing capture.
        t.observe("/d/other.mp4", true);
        assert_eq!(
            t.captured_file_path.as_deref(),
            Some("C:\\Users\\x\\Videos\\final.webm")
        );
        t.observe("not a path.txt", false);

        for i in 0..12 {
            t.observe(&format!("ERROR: thing {i}"), true);
        }
        t.observe("WARNING: w", true);
        t.observe("ERROR: ignored on stdout", false);
        assert_eq!(t.stderr_tail.len(), 10);
        assert_eq!(t.stderr_tail.last().unwrap(), "WARNING: w");
        assert!(t.failure_reason(Some(1)).contains("ERROR: thing 11"));

        let empty = OutputTracker::default();
        assert_eq!(empty.failure_reason(Some(2)), "yt-dlp exited with status 2");
        assert_eq!(
            empty.failure_reason(None),
            "yt-dlp exited with status unknown"
        );

        let mut fresh = OutputTracker::default();
        fresh.observe("/d/late.mp3", true);
        assert_eq!(fresh.captured_file_path.as_deref(), Some("/d/late.mp3"));
    }

    #[test]
    fn output_path_heuristic() {
        assert!(looks_like_output_path("/a/b.mkv"));
        assert!(!looks_like_output_path("[download] /a/b.mkv"));
        assert!(!looks_like_output_path("b.mkv"));
        assert!(!looks_like_output_path("/a/b.txt"));
    }

    // ---- find_downloaded_file ----

    #[test]
    fn find_downloaded_file_prefers_capture_then_newest() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path().to_string_lossy().into_owned();
        assert!(find_downloaded_file(&d, None).is_err());
        let old = dir.path().join("old.mp4");
        std::fs::write(&old, b"1").unwrap();
        std::fs::write(dir.path().join("notes.txt"), b"1").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        let new = dir.path().join("new.webm");
        std::fs::write(&new, b"1").unwrap();
        assert_eq!(find_downloaded_file(&d, None).unwrap(), new);
        assert_eq!(
            find_downloaded_file(&d, Some(&old.to_string_lossy())).unwrap(),
            old
        );
        assert_eq!(
            find_downloaded_file(&d, Some("/no/such/file.mp4")).unwrap(),
            new
        );
        assert!(find_downloaded_file("/no/such/dir", None).is_err());
    }

    // ---- video info conversion ----

    #[test]
    fn convert_video_info_maps_fields() {
        let raw: YtdlpVideoInfo = serde_json::from_str(
            r#"{"id":"x","title":"T","duration":12.7,"availability":"private",
                "formats":[
                  {"format_id":"18","ext":"mp4","width":640,"height":360,"fps":29.97,
                   "vcodec":"avc1","acodec":"mp4a","filesize":10,"tbr":500.0},
                  {"format_id":"140","acodec":"mp4a","vcodec":"none"},
                  {"format_id":"sb0","vcodec":"none","acodec":"none"}
                ]}"#,
        )
        .unwrap();
        let info = convert_video_info(raw);
        assert_eq!(info.duration, 12);
        assert!(info.is_private);
        assert!(!info.is_live);
        assert_eq!(info.formats.len(), 2);
        assert_eq!(info.formats[0].resolution, "640x360");
        assert!(info.formats[0].has_video && info.formats[0].has_audio);
        assert_eq!(info.formats[1].resolution, "unknown");
        assert_eq!(info.formats[1].extension, "mp4");
        assert!(!info.formats[1].has_video);
    }

    // ---- process spawning without real yt-dlp ----

    #[tokio::test]
    async fn run_download_reports_spawn_failure() {
        let (tx, _rx) = mpsc::channel(4);
        let err = run_download(
            Path::new("/definitely/missing/yt-dlp"),
            &["--version".to_string()],
            "id",
            "/tmp",
            tx,
        )
        .await
        .unwrap_err();
        assert!(matches!(err, ClipyError::Ytdlp(_)));
        assert!(
            fetch_video_info_with(Path::new("/definitely/missing/yt-dlp"), &[])
                .await
                .is_err()
        );
    }

    #[test]
    fn output_template_default() {
        let mut o = opts();
        o.output_path = base();
        assert_eq!(tmpl(&o), "/downloads/%(title)s.%(ext)s");
    }

    #[test]
    fn output_template_channel_subfolder() {
        let mut o = opts();
        o.output_path = base();
        o.create_channel_subfolder = true;
        assert_eq!(tmpl(&o), "/downloads/%(channel)s/%(title)s.%(ext)s");
    }

    #[test]
    fn output_template_include_date() {
        let mut o = opts();
        o.output_path = base();
        o.include_date_in_filename = true;
        assert_eq!(tmpl(&o), "/downloads/%(upload_date)s - %(title)s.%(ext)s");
    }

    #[test]
    fn output_template_channel_and_date() {
        let mut o = opts();
        o.output_path = base();
        o.create_channel_subfolder = true;
        o.include_date_in_filename = true;
        assert_eq!(
            tmpl(&o),
            "/downloads/%(channel)s/%(upload_date)s - %(title)s.%(ext)s"
        );
    }

    #[test]
    fn output_template_custom_template_wins() {
        let mut o = opts();
        o.output_path = base();
        o.create_channel_subfolder = true; // ignored when template is set
        o.filename_template = "%(id)s.%(ext)s".into();
        assert_eq!(tmpl(&o), "/downloads/%(id)s.%(ext)s");
    }

    #[test]
    fn output_template_explicit_filename_wins() {
        let mut o = opts();
        o.output_path = base();
        o.filename_template = "%(id)s.%(ext)s".into();
        o.filename = "myfile.%(ext)s".into();
        assert_eq!(tmpl(&o), "/downloads/myfile.%(ext)s");
    }

    // ---- get_available_qualities ----

    #[test]
    fn available_qualities_sorted_descending_deduped() {
        let mut info = VideoInfo::default();
        let mk = |h: u32| VideoFormat {
            format_id: "f".into(),
            extension: "mp4".into(),
            resolution: format!("x{h}"),
            width: 0,
            height: h,
            fps: 30,
            vcodec: "avc".into(),
            acodec: "none".into(),
            filesize: None,
            filesize_approx: None,
            tbr: 0.0,
            has_video: true,
            has_audio: false,
        };
        info.formats = vec![mk(720), mk(1080), mk(720), mk(480)];
        assert_eq!(
            get_available_qualities(&info),
            vec!["1080p".to_string(), "720p".into(), "480p".into()]
        );
    }

    // ---- scripted yt-dlp (see test_support::fake_tool) ----

    use crate::test_support::{fake_tool, mock_app_in_tempdir, Script};

    const INFO_JSON: &str = r#"{"id":"jNQXAC9IVRw","title":"Me at the zoo","duration":19.0,
        "channel":"jawed","is_live":false,
        "formats":[{"format_id":"18","ext":"mp4","width":320,"height":240,
        "vcodec":"avc1","acodec":"mp4a"}]}"#;

    fn ok_with(stdout: &str) -> Script {
        Script {
            stdout: stdout.into(),
            ..Default::default()
        }
    }

    fn drain(rx: &mut mpsc::Receiver<DownloadProgress>) -> Vec<DownloadProgress> {
        let mut all = Vec::new();
        while let Ok(p) = rx.try_recv() {
            all.push(p);
        }
        all
    }

    /// Download `url` as audio into `out` with the yt-dlp at `ytdlp`; returns
    /// the file and every progress update. Shared by the scripted and the
    /// network test so both exercise the same argument building and parsing.
    async fn audio_download(
        ytdlp: &Path,
        url: &str,
        out: &Path,
    ) -> (Result<PathBuf>, Vec<DownloadProgress>) {
        let options = DownloadOptions {
            output_path: out.to_string_lossy().into_owned(),
            audio_only: true,
            audio_format: "best".into(),
            audio_bitrate: String::new(),
            embed_thumbnail: false,
            embed_metadata: false,
            ..DownloadOptions::default()
        };
        let ctx = DownloadContext {
            default_dir: out.to_path_buf(),
            ..Default::default()
        };
        // Audio-only "best" is a single m4a stream, so no ffmpeg merge is
        // needed; `-x` would require ffmpeg, so drop it.
        let args: Vec<String> = build_download_args(url, &options, &ctx)
            .unwrap()
            .into_iter()
            .filter(|a| a != "-x")
            .collect();
        let (tx, mut rx) = mpsc::channel(1024);
        let result = run_download(ytdlp, &args, "it", &out.to_string_lossy(), tx).await;
        (result, drain(&mut rx))
    }

    #[tokio::test]
    async fn scripted_download_streams_progress_and_finds_the_file() {
        let work = tempfile::tempdir().unwrap();
        let out = work.path().join("out");
        std::fs::create_dir(&out).unwrap();
        let media = work.path().join("fixture.m4a");
        std::fs::write(&media, b"audio").unwrap();
        let target = out.join("Me at the zoo.m4a");
        let stdout = format!(
            "[youtube] jNQXAC9IVRw: Downloading webpage\n\
             [download] Destination: {t}\n\
             [download]  50.0% of 2.00MiB at 1.00MiB/s ETA 00:01\n\
             [download] 100% of 2.00MiB in 00:00:02\n\
             {t}\n",
            t = target.display()
        );
        let ytdlp = fake_tool(
            &work.path().join("bin"),
            "yt-dlp",
            &Script {
                copy: Some((media, target.clone())),
                stdout,
                stderr: "WARNING: falling back to generic\n".into(),
                ..Default::default()
            },
        );

        let (file, progress) = audio_download(&ytdlp, URL, &out).await;
        assert_eq!(file.unwrap(), target);
        let half = progress.iter().find(|p| p.progress == 50.0).unwrap();
        assert_eq!(half.total_bytes, 2 * 1024 * 1024);
        assert_eq!((half.speed, half.eta), (1024 * 1024, 1));
        assert_eq!(progress.last().unwrap().status, DownloadStatus::Completed);
    }

    #[tokio::test]
    async fn scripted_download_failure_reports_error_lines() {
        let work = tempfile::tempdir().unwrap();
        let ytdlp = fake_tool(
            work.path(),
            "yt-dlp",
            &Script {
                stderr: "WARNING: slow\nERROR: Video unavailable\n".into(),
                exit_code: 1,
                ..Default::default()
            },
        );
        let (result, progress) = audio_download(&ytdlp, URL, work.path()).await;
        let err = result.unwrap_err().to_string();
        assert_eq!(err, "yt-dlp error: WARNING: slow; ERROR: Video unavailable");
        assert!(progress
            .iter()
            .all(|p| p.status == DownloadStatus::Downloading));

        let silent = fake_tool(
            &work.path().join("silent"),
            "yt-dlp",
            &Script {
                exit_code: 3,
                ..Default::default()
            },
        );
        let (result, _) = audio_download(&silent, URL, work.path()).await;
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("yt-dlp exited with status 3"));
    }

    #[tokio::test]
    async fn fetch_video_info_runs_the_app_ytdlp() {
        let app = mock_app_in_tempdir();
        let bin = crate::utils::paths::get_binaries_dir(app.handle()).unwrap();
        fake_tool(&bin, "yt-dlp", &ok_with(INFO_JSON));
        let info = fetch_video_info(app.handle(), URL).await.unwrap();
        assert_eq!((info.id.as_str(), info.duration), ("jNQXAC9IVRw", 19));
        assert_eq!(info.formats.len(), 1);
        assert!(fetch_video_info(app.handle(), "file:///etc/passwd")
            .await
            .is_err());

        fake_tool(&bin, "yt-dlp", &ok_with("not json"));
        let err = fetch_video_info(app.handle(), URL).await.unwrap_err();
        assert!(
            err.to_string().contains("Failed to parse video info"),
            "{err}"
        );

        fake_tool(
            &bin,
            "yt-dlp",
            &Script {
                stderr: "ERROR: Private video".into(),
                exit_code: 1,
                ..Default::default()
            },
        );
        let err = fetch_video_info(app.handle(), URL).await.unwrap_err();
        assert!(err.to_string().contains("ERROR: Private video"), "{err}");
    }

    #[tokio::test]
    async fn download_video_passes_app_paths_to_ytdlp() {
        let app = mock_app_in_tempdir();
        let bin = crate::utils::paths::get_binaries_dir(app.handle()).unwrap();
        let out = tempfile::tempdir().unwrap();
        let media = bin.parent().unwrap().join("fixture.mp4");
        std::fs::write(&media, b"video").unwrap();
        let target = out.path().join("clip.mp4");
        fake_tool(&bin, "ffmpeg", &Script::default());
        fake_tool(
            &bin,
            "yt-dlp",
            &Script {
                copy: Some((media, target.clone())),
                ..Default::default()
            },
        );
        let options = DownloadOptions {
            output_path: out.path().to_string_lossy().into_owned(),
            use_download_archive: true,
            proxy_url: "http://user:secret@proxy:8080".into(),
            ..DownloadOptions::default()
        };
        let (tx, mut rx) = mpsc::channel(64);
        let file = download_video(app.handle(), "d1".into(), URL, &options, tx)
            .await
            .unwrap();
        // Nothing captured from output, so the newest media file is used.
        assert_eq!(file, target);
        assert!(drain(&mut rx).iter().all(|p| p.download_id == "d1"));

        let bad = DownloadOptions {
            filename: "../escape.%(ext)s".into(),
            ..options
        };
        let (tx, _rx) = mpsc::channel(4);
        assert!(download_video(app.handle(), "d2".into(), URL, &bad, tx)
            .await
            .is_err());
    }

    // ---- network: real yt-dlp ----

    /// Install a verified yt-dlp into `dir` for the network tests.
    async fn real_ytdlp(dir: &Path) -> PathBuf {
        let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
        binary::install_ytdlp_into(&binary::Sources::upstream(), dir, os, arch)
            .await
            .unwrap()
    }

    #[tokio::test]
    #[ignore = "network: installs real yt-dlp and fetches video info"]
    async fn network_fetch_video_info() {
        let dir = tempfile::tempdir().unwrap();
        let args = build_info_args(URL).unwrap();
        let info = fetch_video_info_with(&real_ytdlp(dir.path()).await, &args).await;
        assert_eq!(info.unwrap().id, "jNQXAC9IVRw");
    }

    #[tokio::test]
    #[ignore = "network: installs real yt-dlp and downloads a short public video"]
    async fn network_download_short_video() {
        let (bin, out) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let ytdlp = real_ytdlp(bin.path()).await;
        let (file, progress) = audio_download(&ytdlp, URL, out.path()).await;
        assert!(std::fs::metadata(file.unwrap()).unwrap().len() > 10_000);
        assert_eq!(progress.last().unwrap().status, DownloadStatus::Completed);
    }
}
