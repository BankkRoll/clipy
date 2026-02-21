//! yt-dlp service for video information extraction and downloading

use crate::error::{ClipyError, Result};
use crate::models::download::{DownloadOptions, DownloadProgress, DownloadStatus};
use crate::models::video::{VideoFormat, VideoInfo};
use crate::services::binary;
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;
use tracing::{debug, error, info};

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

/// Fetch video information from a URL
pub async fn fetch_video_info(app: &AppHandle, url: &str) -> Result<VideoInfo> {
    info!("Fetching video info for: {}", url);

    let ytdlp_path = binary::get_ytdlp_path(app)?;
    debug!("Using yt-dlp executable: {:?}", ytdlp_path);

    let args = ["--dump-json", "--no-playlist", "--no-warnings", url];
    debug!("yt-dlp fetch args: {:?}", args);

    let output = Command::new(&ytdlp_path)
        .args([
            "--dump-json",
            "--no-playlist",
            "--no-warnings",
            url,
        ])
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
    debug!("Fetched video info: {} (duration: {}s, {} formats)",
           video_info.title, video_info.duration, video_info.formats.len());

    Ok(video_info)
}

/// Convert raw yt-dlp info to our VideoInfo model
fn convert_video_info(raw: YtdlpVideoInfo) -> VideoInfo {
    let formats = raw.formats.unwrap_or_default()
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
                resolution: f.resolution.unwrap_or_else(|| {
                    match (f.width, f.height) {
                        (Some(w), Some(h)) => format!("{}x{}", w, h),
                        _ => "unknown".to_string(),
                    }
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
        is_private: raw.availability.as_ref().map(|a| a == "private").unwrap_or(false),
    }
}

/// Download a video with progress reporting
pub async fn download_video(
    app: &AppHandle,
    download_id: String,
    url: &str,
    options: &DownloadOptions,
    progress_tx: mpsc::Sender<DownloadProgress>,
) -> Result<PathBuf> {
    info!("Starting download: {} with options {:?}", url, options);

    let ytdlp_path = binary::get_ytdlp_path(app)?;

    // Build output template
    let output_template = if options.filename.is_empty() {
        format!("{}/%(title)s.%(ext)s", options.output_path)
    } else {
        format!("{}/{}", options.output_path, options.filename)
    };

    // Build format selector
    let format_selector = build_format_selector(options);
    debug!("Format selector: {}", format_selector);
    debug!("Output template: {}", output_template);

    let mut args = vec![
        "--newline".to_string(),
        "--progress".to_string(),
        "--print".to_string(),
        "after_move:filepath".to_string(),  // Print the final filepath after all processing
        "-f".to_string(),
        format_selector,
        "-o".to_string(),
        output_template.clone(),
    ];

    // Playlist handling
    if options.no_playlist {
        args.push("--no-playlist".to_string());
    }
    if !options.playlist_items.is_empty() {
        args.push("--playlist-items".to_string());
        args.push(options.playlist_items.clone());
    }

    // Add format conversion if needed
    if options.audio_only {
        // Audio extraction and conversion
        args.push("-x".to_string()); // Extract audio
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

    // Video/audio codec preferences
    if options.video_codec != "auto" && !options.video_codec.is_empty() {
        args.push("--format-sort".to_string());
        args.push(format!("vcodec:{}", options.video_codec));
    }

    // Embed thumbnail if requested
    if options.embed_thumbnail {
        args.push("--embed-thumbnail".to_string());
    }

    // Embed metadata if requested
    if options.embed_metadata {
        args.push("--embed-metadata".to_string());
    }

    // Embed chapters if requested
    if options.download_chapters {
        args.push("--embed-chapters".to_string());
    }

    // Split by chapters
    if options.split_by_chapters {
        args.push("--split-chapters".to_string());
    }

    // Subtitle options
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
        }

        if options.embed_subtitles {
            args.push("--embed-subs".to_string());
        }
    }

    // SponsorBlock
    if options.sponsor_block {
        args.push("--sponsorblock-remove".to_string());
        if !options.sponsor_block_categories.is_empty() {
            args.push(options.sponsor_block_categories.join(","));
        } else {
            args.push("sponsor".to_string());
        }
    }

    // Write description
    if options.write_description {
        args.push("--write-description".to_string());
    }

    // Write comments
    if options.write_comments {
        args.push("--write-comments".to_string());
    }

    // Write thumbnail (as separate file)
    if options.write_thumbnail {
        args.push("--write-thumbnail".to_string());
    }

    // Keep original file
    if options.keep_original {
        args.push("-k".to_string());
    }

    // Max filesize limit
    if !options.max_filesize.is_empty() {
        args.push("--max-filesize".to_string());
        args.push(options.max_filesize.clone());
    }

    // Rate limit
    if !options.rate_limit.is_empty() {
        args.push("-r".to_string());
        args.push(options.rate_limit.clone());
    }

    // Remux video
    if !options.remux_video.is_empty() {
        args.push("--remux-video".to_string());
        args.push(options.remux_video.clone());
    }

    // Cookies from browser
    if !options.cookies_from_browser.is_empty() {
        args.push("--cookies-from-browser".to_string());
        args.push(options.cookies_from_browser.clone());
    }

    // Concurrent fragments for faster HLS/DASH downloads
    if options.concurrent_fragments > 1 {
        args.push("-N".to_string());
        args.push(options.concurrent_fragments.to_string());
    }

    // Proxy
    if !options.proxy_url.is_empty() {
        args.push("--proxy".to_string());
        args.push(options.proxy_url.clone());
    }

    // Restrict filenames to ASCII
    if options.restrict_filenames {
        args.push("--restrict-filenames".to_string());
    }

    // Download archive (to avoid re-downloading)
    if options.use_download_archive {
        if let Ok(archive_path) = crate::utils::paths::get_download_archive_path(app) {
            args.push("--download-archive".to_string());
            args.push(archive_path.to_string_lossy().to_string());
        }
    }

    // Geo-bypass
    if options.geo_bypass {
        args.push("--geo-bypass".to_string());
    }

    args.push(url.to_string());

    debug!("yt-dlp args: {:?}", args);

    let mut child = Command::new(&ytdlp_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to spawn yt-dlp: {}", e)))?;

    // Register the process for cancellation
    if let Some(pid) = child.id() {
        if let Some(registry) = crate::services::process_registry::get_registry() {
            registry.register(&download_id, pid).await;
        }
    }

    let stdout = child.stdout.take()
        .ok_or_else(|| ClipyError::Ytdlp("Failed to capture stdout".into()))?;
    let stderr = child.stderr.take()
        .ok_or_else(|| ClipyError::Ytdlp("Failed to capture stderr".into()))?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    // Send initial progress
    let _ = progress_tx.send(DownloadProgress {
        download_id: download_id.clone(),
        status: DownloadStatus::Downloading,
        progress: 0.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: 0,
        eta: 0,
        file_path: None,
    }).await;

    // Track the actual downloaded file path from yt-dlp output
    let mut captured_file_path: Option<String> = None;

    info!("Starting to read yt-dlp output streams...");

    // Read both stdout and stderr concurrently
    // yt-dlp outputs progress to stderr, other info to stdout
    let mut lines_received = 0u32;
    loop {
        let (line, source) = tokio::select! {
            result = stdout_reader.next_line() => {
                match result {
                    Ok(Some(line)) => (line, "stdout"),
                    Ok(None) => {
                        debug!("stdout stream closed");
                        break; // stdout closed
                    },
                    Err(e) => {
                        debug!("Error reading stdout: {}", e);
                        continue;
                    },
                }
            }
            result = stderr_reader.next_line() => {
                match result {
                    Ok(Some(line)) => (line, "stderr"),
                    Ok(None) => {
                        debug!("stderr stream closed");
                        continue; // stderr closed but keep reading stdout
                    },
                    Err(e) => {
                        debug!("Error reading stderr: {}", e);
                        continue;
                    },
                }
            }
        };

        lines_received += 1;
        debug!("[{}] yt-dlp ({}): {}", lines_received, source, line);

        // The --print after_move:filepath option outputs the final filepath as a plain line
        // It's the last thing printed and doesn't have any prefix like [download]
        // Check if line looks like a file path (contains path separator and file extension)
        let trimmed = line.trim();
        if !trimmed.starts_with('[') && !trimmed.is_empty() {
            // Check if it looks like a valid file path
            let has_extension = trimmed.contains('.') &&
                (trimmed.ends_with(".mp4") || trimmed.ends_with(".mkv") ||
                 trimmed.ends_with(".webm") || trimmed.ends_with(".m4a") ||
                 trimmed.ends_with(".mp3") || trimmed.ends_with(".opus") ||
                 trimmed.ends_with(".flac") || trimmed.ends_with(".wav") ||
                 trimmed.ends_with(".avi") || trimmed.ends_with(".mov"));
            let has_path_sep = trimmed.contains('/') || trimmed.contains('\\');

            if has_extension && has_path_sep {
                info!("Captured filepath from --print: {}", trimmed);
                captured_file_path = Some(trimmed.to_string());
            }
        }

        // Also capture from traditional yt-dlp output lines as fallback
        // Look for: [download] Destination: /path/to/file.mp4
        // Or: [Merger] Merging formats into "/path/to/file.mp4"
        // Or: [MoveFiles] Moving file ... to "/path/to/file.mp4"
        if line.contains("[download] Destination:") {
            if let Some(path) = line.split("Destination:").nth(1) {
                captured_file_path = Some(path.trim().to_string());
            }
        } else if line.contains("[Merger] Merging formats into") {
            // Extract path from between quotes
            if let Some(start) = line.find('"') {
                if let Some(end) = line.rfind('"') {
                    if end > start {
                        captured_file_path = Some(line[start + 1..end].to_string());
                    }
                }
            }
        } else if line.contains("[MoveFiles] Moving file") && line.contains(" to ") {
            // Extract destination path after " to "
            if let Some(to_part) = line.split(" to ").last() {
                let path = to_part.trim().trim_matches('"');
                captured_file_path = Some(path.to_string());
            }
        }

        if let Some(progress) = parse_progress_line(&line) {
            info!("Sending progress to channel: {}% - {} bytes of {} bytes, speed: {}, eta: {}",
                  progress.0, progress.1, progress.2, progress.3, progress.4);
            match progress_tx.send(DownloadProgress {
                download_id: download_id.clone(),
                status: DownloadStatus::Downloading,
                progress: progress.0,
                downloaded_bytes: progress.1,
                total_bytes: progress.2,
                speed: progress.3,
                eta: progress.4,
                file_path: None,
            }).await {
                Ok(()) => {
                    debug!("Progress sent successfully to channel");
                }
                Err(e) => {
                    error!("Failed to send progress to channel: {}", e);
                }
            }
        }
    }

    info!("Finished reading yt-dlp output. Total lines received: {}", lines_received);

    // Drain any remaining stderr output after stdout closes
    while let Ok(Some(line)) = stderr_reader.next_line().await {
        debug!("yt-dlp stderr (remaining): {}", line);
        // Check for file path in remaining output
        let trimmed = line.trim();
        if !trimmed.starts_with('[') && !trimmed.is_empty() {
            let has_extension = trimmed.contains('.') &&
                (trimmed.ends_with(".mp4") || trimmed.ends_with(".mkv") ||
                 trimmed.ends_with(".webm") || trimmed.ends_with(".m4a") ||
                 trimmed.ends_with(".mp3") || trimmed.ends_with(".opus") ||
                 trimmed.ends_with(".flac") || trimmed.ends_with(".wav") ||
                 trimmed.ends_with(".avi") || trimmed.ends_with(".mov"));
            let has_path_sep = trimmed.contains('/') || trimmed.contains('\\');
            if has_extension && has_path_sep && captured_file_path.is_none() {
                info!("Captured filepath from remaining stderr: {}", trimmed);
                captured_file_path = Some(trimmed.to_string());
            }
        }
    }

    let status = child.wait()
        .await
        .map_err(|e| ClipyError::Ytdlp(format!("Failed to wait for yt-dlp: {}", e)))?;

    // Unregister the process now that it's done
    if let Some(registry) = crate::services::process_registry::get_registry() {
        registry.unregister(&download_id).await;
    }

    if !status.success() {
        return Err(ClipyError::Ytdlp("Download failed".into()));
    }

    // Send completion (file_path will be set by queue.rs after this)
    let _ = progress_tx.send(DownloadProgress {
        download_id: download_id.clone(),
        status: DownloadStatus::Completed,
        progress: 100.0,
        downloaded_bytes: 0,
        total_bytes: 0,
        speed: 0,
        eta: 0,
        file_path: None,
    }).await;

    // Find the downloaded file
    let output_path = find_downloaded_file(&options.output_path, captured_file_path.as_deref())?;

    info!("Download completed: {:?}", output_path);
    Ok(output_path)
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
        "2160" | "4k" => format!("bestvideo[height<=2160]{}+bestaudio/best[height<=2160]", vcodec_pref),
        "1440" | "2k" => format!("bestvideo[height<=1440]{}+bestaudio/best[height<=1440]", vcodec_pref),
        "1080" => format!("bestvideo[height<=1080]{}+bestaudio/best[height<=1080]", vcodec_pref),
        "720" => format!("bestvideo[height<=720]{}+bestaudio/best[height<=720]", vcodec_pref),
        "480" => format!("bestvideo[height<=480]{}+bestaudio/best[height<=480]", vcodec_pref),
        "360" => format!("bestvideo[height<=360]{}+bestaudio/best[height<=360]", vcodec_pref),
        "240" => format!("bestvideo[height<=240]{}+bestaudio/best[height<=240]", vcodec_pref),
        "144" => format!("bestvideo[height<=144]{}+bestaudio/best[height<=144]", vcodec_pref),
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
        let start = line[..pct_idx].rfind(char::is_whitespace).map(|i| i + 1).unwrap_or(0);
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
            debug!("Parsed size: {} bytes total, {} bytes downloaded", total, downloaded);
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
        info!("Progress update: {}% ({}/{} bytes) @ {} B/s, ETA {} s",
              progress, downloaded, total, speed, eta);
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
        return Err(ClipyError::Ytdlp(format!("Output directory does not exist: {}", output_dir)));
    }

    let video_extensions = ["mp4", "mkv", "webm", "avi", "mov", "m4a", "mp3", "opus", "flac", "wav"];

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
    let mut heights: Vec<u32> = video_info.formats
        .iter()
        .filter(|f| f.has_video && f.height > 0)
        .map(|f| f.height)
        .collect();

    heights.sort();
    heights.dedup();
    heights.reverse();

    heights.iter().map(|h| format!("{}p", h)).collect()
}
