//! On-device auto-captions via whisper.cpp.
//!
//! Pipeline: extract 16 kHz mono WAV with our bundled ffmpeg → run the bundled
//! `whisper-cli` binary with word-level flags (`-ml 1 -sow -ojf`) → parse the
//! full JSON output into a flat list of words with millisecond timing.
//!
//! The whisper binary (a small zip with DLLs) and the GGML model files are
//! downloaded on demand into the app binaries/models dirs, mirroring how
//! ffmpeg/yt-dlp are managed in [`crate::services::binary`].

use crate::error::{ClipyError, Result};
use crate::services::binary;
use crate::utils::paths;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tracing::{debug, info, warn};

/// Progress update emitted on the `caption-progress` event during generation.
#[derive(Debug, Clone, Serialize)]
pub struct CaptionProgress {
    /// "download" | "extract-audio" | "transcribe" | "done"
    pub stage: String,
    /// 0.0..1.0 within the stage, or -1 for indeterminate.
    pub progress: f32,
    pub message: String,
}

fn emit_progress(app: &AppHandle, stage: &str, progress: f32, message: &str) {
    let _ = app.emit(
        "caption-progress",
        CaptionProgress {
            stage: stage.to_string(),
            progress,
            message: message.to_string(),
        },
    );
}

/// whisper.cpp release used for the prebuilt Windows binary.
const WHISPER_VERSION: &str = "v1.9.0";
const WHISPER_WIN_ZIP: &str =
    "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.0/whisper-bin-x64.zip";
const HF_MODEL_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/// One transcribed word with millisecond timing. Returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct CaptionWord {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CaptionResult {
    pub language: String,
    pub model: String,
    pub words: Vec<CaptionWord>,
}

/// Directory holding GGML model files (`<app-data>/models`).
fn models_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = paths::get_app_data_dir(app)?.join("models");
    std::fs::create_dir_all(&dir)
        .map_err(|e| ClipyError::Other(format!("Failed to create models dir: {}", e)))?;
    Ok(dir)
}

/// Path to the `whisper-cli` executable inside the binaries dir.
pub fn whisper_cli_path(app: &AppHandle) -> Result<PathBuf> {
    let name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    Ok(paths::get_binaries_dir(app)?.join(name))
}

/// Map a model id (e.g. "base.en") to its on-disk file and download URL.
fn model_file_name(model: &str) -> String {
    format!("ggml-{}.bin", model)
}

pub fn model_path(app: &AppHandle, model: &str) -> Result<PathBuf> {
    Ok(models_dir(app)?.join(model_file_name(model)))
}

/// True when both the whisper binary and the requested model are present.
pub fn is_ready(app: &AppHandle, model: &str) -> bool {
    whisper_cli_path(app).map(|p| p.exists()).unwrap_or(false)
        && model_path(app, model).map(|p| p.exists()).unwrap_or(false)
}

/// Download (if missing) the whisper binary and the requested GGML model.
pub async fn ensure_installed(app: &AppHandle, model: &str) -> Result<()> {
    let cli = whisper_cli_path(app)?;
    if !cli.exists() {
        emit_progress(app, "download", -1.0, "Downloading speech engine…");
        install_whisper_binary(app).await?;
    }
    let model_target = model_path(app, model)?;
    if !model_target.exists() {
        let url = format!("{}/{}", HF_MODEL_BASE, model_file_name(model));
        info!("Downloading whisper model {} from {}", model, url);
        emit_progress(
            app,
            "download",
            -1.0,
            &format!("Downloading {} model (first use only)…", model),
        );
        download_to(&url, &model_target).await?;
    }
    Ok(())
}

/// Download + extract the prebuilt whisper.cpp binary bundle (Windows only for
/// now; other platforms fall back to a system `whisper-cli` on PATH).
async fn install_whisper_binary(app: &AppHandle) -> Result<()> {
    let binaries_dir = paths::get_binaries_dir(app)?;
    std::fs::create_dir_all(&binaries_dir)
        .map_err(|e| ClipyError::Other(format!("Failed to create binaries dir: {}", e)))?;

    #[cfg(target_os = "windows")]
    {
        info!("Downloading whisper.cpp {} binary bundle", WHISPER_VERSION);
        let bytes = fetch_bytes(WHISPER_WIN_ZIP).await?;
        let temp_zip = binaries_dir.join("whisper_temp.zip");
        std::fs::write(&temp_zip, &bytes)
            .map_err(|e| ClipyError::Other(format!("Failed to write whisper zip: {}", e)))?;
        drop(bytes);

        let dir = binaries_dir.clone();
        let zip_path = temp_zip.clone();
        let res = tokio::task::spawn_blocking(move || extract_whisper_zip(&zip_path, &dir))
            .await
            .map_err(|e| ClipyError::Other(format!("Whisper extract task failed: {}", e)))?;
        let _ = std::fs::remove_file(&temp_zip);
        res?;
        info!("whisper.cpp binary installed");
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = WHISPER_VERSION;
        let _ = WHISPER_WIN_ZIP;
        Err(ClipyError::Other(
            "Automatic whisper install is currently Windows-only; install whisper-cli on PATH"
                .into(),
        ))
    }
}

/// Extract `whisper-cli.exe` and the accompanying `*.dll` files from the release
/// zip (entries are matched by basename — the archive nests them under a dir).
#[cfg(target_os = "windows")]
fn extract_whisper_zip(zip_path: &Path, binaries_dir: &Path) -> Result<()> {
    let file = std::fs::File::open(zip_path)
        .map_err(|e| ClipyError::Other(format!("Failed to open whisper zip: {}", e)))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| ClipyError::Other(format!("Failed to read whisper zip: {}", e)))?;

    let mut extracted_cli = false;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| ClipyError::Other(format!("Zip entry error: {}", e)))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry
            .enclosed_name()
            .and_then(|p| p.file_name().map(|f| f.to_string_lossy().to_string()));
        let Some(name) = name else { continue };
        let lower = name.to_lowercase();
        // Keep the CLI and every DLL it needs (ggml*, whisper*, etc.).
        let wanted = lower == "whisper-cli.exe" || lower.ends_with(".dll");
        if !wanted {
            continue;
        }
        let out_path = binaries_dir.join(&name);
        let mut out = std::fs::File::create(&out_path)
            .map_err(|e| ClipyError::Other(format!("Failed to create {}: {}", name, e)))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| ClipyError::Other(format!("Failed to extract {}: {}", name, e)))?;
        if lower == "whisper-cli.exe" {
            extracted_cli = true;
        }
        debug!("whisper: extracted {}", name);
    }

    if !extracted_cli {
        return Err(ClipyError::Other(
            "whisper-cli.exe not found in release zip".into(),
        ));
    }
    Ok(())
}

async fn fetch_bytes(url: &str) -> Result<Vec<u8>> {
    let response = reqwest::get(url)
        .await
        .map_err(|e| ClipyError::Other(format!("Download failed: {}", e)))?;
    if !response.status().is_success() {
        return Err(ClipyError::Other(format!(
            "Download failed with status {}",
            response.status()
        )));
    }
    response
        .bytes()
        .await
        .map(|b| b.to_vec())
        .map_err(|e| ClipyError::Other(format!("Failed to read response: {}", e)))
}

async fn download_to(url: &str, target: &Path) -> Result<()> {
    let bytes = fetch_bytes(url).await?;
    std::fs::write(target, &bytes)
        .map_err(|e| ClipyError::Other(format!("Failed to write {}: {}", target.display(), e)))?;
    Ok(())
}

/// Full transcription pipeline for a source media file.
pub async fn generate_captions(
    app: &AppHandle,
    source_path: &str,
    model: &str,
) -> Result<CaptionResult> {
    ensure_installed(app, model).await?;

    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let whisper = whisper_cli_path(app)?;
    let model_file = model_path(app, model)?;

    let temp_dir = paths::get_temp_dir(app)?;
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| ClipyError::Other(format!("Failed to create temp dir: {}", e)))?;
    // Unique-ish stem from source name; whisper appends ".json".
    let stem = format!(
        "captions_{}",
        Path::new(source_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "audio".into())
            .chars()
            .filter(|c| c.is_alphanumeric())
            .take(40)
            .collect::<String>()
    );
    let wav_path = temp_dir.join(format!("{}.wav", stem));
    let out_stem = temp_dir.join(&stem);

    // 1) Extract 16kHz mono PCM wav.
    emit_progress(app, "extract-audio", -1.0, "Extracting audio…");
    debug!("captions: extracting wav -> {:?}", wav_path);
    let status = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-i",
            source_path,
            "-vn",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
        ])
        .arg(&wav_path)
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to extract audio: {}", e)))?;
    if !status.status.success() {
        return Err(ClipyError::FFmpeg(format!(
            "ffmpeg audio extraction failed: {}",
            String::from_utf8_lossy(&status.stderr)
        )));
    }

    // 2) Run whisper-cli for word-level full JSON, streaming stderr so we can
    // report transcription progress (whisper prints "progress = NN%").
    emit_progress(app, "transcribe", 0.0, "Transcribing…");
    debug!("captions: running whisper-cli");
    let mut child = Command::new(&whisper)
        .args(["-m"])
        .arg(&model_file)
        .args(["-f"])
        .arg(&wav_path)
        .args([
            "-ml",
            "1", // one token per segment -> word granularity
            "-sow", // split on word boundaries
            "-ojf", // full JSON (token timestamps + probabilities)
            "-pp", // print progress to stderr
            "-of",
        ])
        .arg(&out_stem)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| ClipyError::Other(format!("Failed to run whisper-cli: {}", e)))?;

    let mut stderr_tail = String::new();
    if let Some(stderr) = child.stderr.take() {
        use tokio::io::{AsyncBufReadExt, BufReader};
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Some(pct) = parse_progress_line(&line) {
                emit_progress(
                    app,
                    "transcribe",
                    pct,
                    &format!("Transcribing {}%", (pct * 100.0) as u32),
                );
            }
            // Keep a short tail for error reporting.
            stderr_tail.push_str(&line);
            stderr_tail.push('\n');
            if stderr_tail.len() > 2000 {
                stderr_tail = stderr_tail.split_off(stderr_tail.len() - 2000);
            }
        }
    }
    let _ = child
        .wait()
        .await
        .map_err(|e| ClipyError::Other(format!("whisper-cli failed: {}", e)))?;

    // whisper-cli writes errors to stderr but may still exit 0; check output file.
    let json_path = temp_dir.join(format!("{}.json", stem));
    if !json_path.exists() {
        return Err(ClipyError::Other(format!(
            "whisper produced no output: {}",
            stderr_tail
        )));
    }

    let raw = std::fs::read_to_string(&json_path)
        .map_err(|e| ClipyError::Other(format!("Failed to read whisper json: {}", e)))?;
    let result = parse_whisper_json(&raw, model)?;

    // Best-effort cleanup of temp artifacts.
    let _ = std::fs::remove_file(&wav_path);
    let _ = std::fs::remove_file(&json_path);

    emit_progress(app, "done", 1.0, "Done");
    info!("captions: produced {} words", result.words.len());
    Ok(result)
}

/// Parse a whisper-cli progress line ("...progress = 42%") into 0.0..1.0.
fn parse_progress_line(line: &str) -> Option<f32> {
    let idx = line.find("progress =")?;
    let rest = &line[idx + "progress =".len()..];
    let pct: f32 = rest
        .trim()
        .trim_end_matches('%')
        .trim()
        .split_whitespace()
        .next()?
        .parse()
        .ok()?;
    Some((pct / 100.0).clamp(0.0, 1.0))
}

// ---- JSON parsing -------------------------------------------------------

#[derive(Deserialize)]
struct WhisperJson {
    #[serde(default)]
    result: WhisperResultMeta,
    #[serde(default)]
    transcription: Vec<WhisperSegment>,
}

#[derive(Deserialize, Default)]
struct WhisperResultMeta {
    #[serde(default)]
    language: String,
}

#[derive(Deserialize)]
struct WhisperSegment {
    text: String,
    offsets: WhisperOffsets,
    #[serde(default)]
    tokens: Vec<WhisperToken>,
}

#[derive(Deserialize)]
struct WhisperOffsets {
    from: u64,
    to: u64,
}

#[derive(Deserialize)]
struct WhisperToken {
    #[serde(default)]
    p: f32,
}

fn parse_whisper_json(raw: &str, model: &str) -> Result<CaptionResult> {
    let parsed: WhisperJson = serde_json::from_str(raw)
        .map_err(|e| ClipyError::Other(format!("Failed to parse whisper json: {}", e)))?;

    let mut words = Vec::with_capacity(parsed.transcription.len());
    for seg in parsed.transcription {
        let text = seg.text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        // Average token probability as a rough per-word confidence.
        let confidence = if seg.tokens.is_empty() {
            1.0
        } else {
            seg.tokens.iter().map(|t| t.p).sum::<f32>() / seg.tokens.len() as f32
        };
        words.push(CaptionWord {
            text,
            start_ms: seg.offsets.from,
            end_ms: seg.offsets.to,
            confidence,
        });
    }

    if words.is_empty() {
        warn!("captions: whisper returned no words");
    }

    Ok(CaptionResult {
        language: if parsed.result.language.is_empty() {
            "en".into()
        } else {
            parsed.result.language
        },
        model: model.to_string(),
        words,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_word_level_json() {
        let raw = r#"{
          "result": { "language": "en" },
          "transcription": [
            { "text": " Hello", "offsets": { "from": 0, "to": 240 },
              "tokens": [ { "p": 0.9 } ] },
            { "text": " world", "offsets": { "from": 240, "to": 500 },
              "tokens": [ { "p": 0.8 } ] }
          ]
        }"#;
        let r = parse_whisper_json(raw, "base.en").unwrap();
        assert_eq!(r.language, "en");
        assert_eq!(r.words.len(), 2);
        assert_eq!(r.words[0].text, "Hello");
        assert_eq!(r.words[0].start_ms, 0);
        assert_eq!(r.words[1].end_ms, 500);
        assert!((r.words[0].confidence - 0.9).abs() < 1e-5);
    }

    #[test]
    fn parses_progress() {
        assert_eq!(
            parse_progress_line("whisper_print_progress_callback: progress = 42%"),
            Some(0.42)
        );
        assert_eq!(parse_progress_line("progress =  100%"), Some(1.0));
        assert_eq!(parse_progress_line("no progress here"), None);
    }

    #[test]
    fn model_file_naming() {
        assert_eq!(model_file_name("base.en"), "ggml-base.en.bin");
        assert_eq!(model_file_name("small"), "ggml-small.bin");
    }
}
