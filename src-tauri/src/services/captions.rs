//! On-device auto-captions via whisper.cpp.
//!
//! Pipeline: extract 16 kHz mono WAV with our bundled ffmpeg → run the bundled
//! `whisper-cli` binary with word-level flags (`-ml 1 -sow -ojf`) → parse the
//! full JSON output into a flat list of words with millisecond timing.
//!
//! The whisper binary (a small zip with DLLs) and the GGML model files are
//! downloaded on demand and verified against SHA-256 digests pinned below.
//!
//! ## Layout
//!
//! whisper.cpp lives in its own `binaries/whisper/` directory. Its DLLs used to
//! be unpacked next to `ffmpeg.exe`/`yt-dlp.exe`; keeping them apart means the
//! Windows DLL search order of those executables never picks up whisper's
//! libraries (or anything that later lands beside them).

use crate::error::{ClipyError, Result};
use crate::services::{binary, ffmpeg};
use crate::utils::{path_policy, paths};
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
    /// Human-readable status line.
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
/// SHA-256 of [`WHISPER_WIN_ZIP`] (matches the digest GitHub reports for the
/// release asset).
const WHISPER_WIN_ZIP_SHA256: &str =
    "00c4304b6be363a224a4b69829df49009f74131df8c3ce6a5878b89a11cd26ef";

/// Hugging Face revision the model hashes below were taken from. Pinning the
/// revision (instead of `main`) keeps URL and hash in lockstep.
const HF_REVISION: &str = "5359861c739e955e79d9a303bcbc70fb988958b1";
const HF_MODEL_BASE: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve";

/// Name of the directory (inside the binaries dir) that holds whisper.cpp.
const WHISPER_DIR: &str = "whisper";

/// A downloadable GGML model with its pinned digest and size.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WhisperModel {
    /// Model id as used by the frontend (`base.en`).
    pub id: &'static str,
    /// SHA-256 of `ggml-<id>.bin` at [`HF_REVISION`].
    pub sha256: &'static str,
    /// Exact file size in bytes.
    pub size: u64,
}

/// Every model the app may download. Ids outside this list are rejected before
/// any path or URL is built from them.
pub const WHISPER_MODELS: &[WhisperModel] = &[
    WhisperModel {
        id: "tiny",
        sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
        size: 77_691_713,
    },
    WhisperModel {
        id: "tiny.en",
        sha256: "921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f",
        size: 77_704_715,
    },
    WhisperModel {
        id: "base",
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
        size: 147_951_465,
    },
    WhisperModel {
        id: "base.en",
        sha256: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
        size: 147_964_211,
    },
    WhisperModel {
        id: "small",
        sha256: "1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b",
        size: 487_601_967,
    },
    WhisperModel {
        id: "small.en",
        sha256: "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d",
        size: 487_614_201,
    },
    WhisperModel {
        id: "medium",
        sha256: "6c14d5adee5f86394037b4e4e8b59f1673b6cee10e3cf0b11bbdbee79c156208",
        size: 1_533_763_059,
    },
    WhisperModel {
        id: "medium.en",
        sha256: "cc37e93478338ec7700281a7ac30a10128929eb8f427dda2e865faa8f6da4356",
        size: 1_533_774_781,
    },
    WhisperModel {
        id: "large-v1",
        sha256: "7d99f41a10525d0206bddadd86760181fa920438b6b33237e3118ff6c83bb53d",
        size: 3_094_623_691,
    },
    WhisperModel {
        id: "large-v2",
        sha256: "9a423fe4d40c82774b6af34115b8b935f34152246eb19e80e376071d3f999487",
        size: 3_094_623_691,
    },
    WhisperModel {
        id: "large-v3",
        sha256: "64d182b440b98d5203c4f9bd541544d84c605196c4f7b845dfa11fb23594d1e2",
        size: 3_095_033_483,
    },
    WhisperModel {
        id: "large-v3-turbo",
        sha256: "1fc70f774d38eb169993ac391eea357ef47c88757ef72ee5943879b7e8e2bc69",
        size: 1_624_555_275,
    },
];

/// Look up an allowlisted model id.
pub fn find_model(id: &str) -> Result<&'static WhisperModel> {
    WHISPER_MODELS
        .iter()
        .find(|m| m.id == id)
        .ok_or_else(|| ClipyError::Other(format!("Unknown caption model: {id:?}")))
}

/// One transcribed word with millisecond timing. Returned to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct CaptionWord {
    /// The word text.
    pub text: String,
    /// Start offset in milliseconds.
    pub start_ms: u64,
    /// End offset in milliseconds.
    pub end_ms: u64,
    /// Average token probability (0..1).
    pub confidence: f32,
}

/// Result of a transcription.
#[derive(Debug, Clone, Serialize)]
pub struct CaptionResult {
    /// Detected language code.
    pub language: String,
    /// Model id used.
    pub model: String,
    /// Words in order.
    pub words: Vec<CaptionWord>,
}

/// Directory holding GGML model files (`<app-data>/models`).
fn models_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = paths::get_app_data_dir(app)?.join("models");
    std::fs::create_dir_all(&dir)
        .map_err(|e| ClipyError::Other(format!("Failed to create models dir: {}", e)))?;
    Ok(dir)
}

/// Directory holding whisper.cpp inside `binaries_dir`.
fn whisper_dir_in(binaries_dir: &Path) -> PathBuf {
    binaries_dir.join(WHISPER_DIR)
}

/// Path to `whisper-cli` inside `binaries_dir`.
fn whisper_cli_in(binaries_dir: &Path) -> PathBuf {
    let name = if cfg!(windows) {
        "whisper-cli.exe"
    } else {
        "whisper-cli"
    };
    whisper_dir_in(binaries_dir).join(name)
}

/// Path to the `whisper-cli` executable.
pub fn whisper_cli_path(app: &AppHandle) -> Result<PathBuf> {
    Ok(whisper_cli_in(&paths::get_binaries_dir(app)?))
}

/// On-disk file name for an allowlisted model.
fn model_file_name(model: &WhisperModel) -> String {
    format!("ggml-{}.bin", model.id)
}

/// Pinned download URL for an allowlisted model.
fn model_url(model: &WhisperModel) -> String {
    format!("{HF_MODEL_BASE}/{HF_REVISION}/{}", model_file_name(model))
}

/// Path of the model file for `model` (validated against the allowlist).
pub fn model_path(app: &AppHandle, model: &str) -> Result<PathBuf> {
    let m = find_model(model)?;
    Ok(models_dir(app)?.join(model_file_name(m)))
}

/// True when both the whisper binary and the requested model are present.
pub fn is_ready(app: &AppHandle, model: &str) -> bool {
    whisper_cli_path(app).map(|p| p.exists()).unwrap_or(false)
        && model_path(app, model).map(|p| p.exists()).unwrap_or(false)
}

/// Whether an existing model file matches its pinned size. A cheap check that
/// catches partial or replaced files without hashing gigabytes on every run.
fn model_file_ok(path: &Path, model: &WhisperModel) -> bool {
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.len() == model.size)
}

/// Download (if missing) the whisper binary and the requested GGML model.
pub async fn ensure_installed(app: &AppHandle, model: &str) -> Result<()> {
    let model = find_model(model)?;
    let binaries_dir = paths::get_binaries_dir(app)?;
    if !whisper_cli_in(&binaries_dir).exists() {
        emit_progress(app, "download", -1.0, "Downloading speech engine…");
        install_whisper_binary(&binaries_dir).await?;
    }
    let target = models_dir(app)?.join(model_file_name(model));
    if !model_file_ok(&target, model) {
        info!("Downloading whisper model {}", model.id);
        emit_progress(
            app,
            "download",
            -1.0,
            &format!("Downloading {} model (first use only)…", model.id),
        );
        download_model(model, &target).await?;
    }
    Ok(())
}

/// Download and verify one model to `target`.
async fn download_model(model: &WhisperModel, target: &Path) -> Result<()> {
    binary::download_verified(
        &binary::http_client()?,
        &model_url(model),
        target,
        model.sha256,
        model.size,
    )
    .await
}

/// Download, verify and extract the prebuilt whisper.cpp bundle (Windows only
/// for now; other platforms need a system `whisper-cli`).
async fn install_whisper_binary(binaries_dir: &Path) -> Result<()> {
    if !cfg!(target_os = "windows") {
        return Err(ClipyError::Other(
            "Automatic whisper install is currently Windows-only; install whisper-cli on PATH"
                .into(),
        ));
    }
    info!("Downloading whisper.cpp {} binary bundle", WHISPER_VERSION);
    let dir = whisper_dir_in(binaries_dir);
    std::fs::create_dir_all(&dir)?;
    let zip_path = dir.join(".whisper-download.zip");
    binary::download_verified(
        &binary::http_client()?,
        WHISPER_WIN_ZIP,
        &zip_path,
        WHISPER_WIN_ZIP_SHA256,
        64 * 1024 * 1024,
    )
    .await?;
    let extract_dir = dir.clone();
    let archive = zip_path.clone();
    let res = tokio::task::spawn_blocking(move || {
        binary::extract_zip(&archive, &extract_dir, &whisper_entry_dest)
    })
    .await
    .map_err(|e| ClipyError::Other(format!("Whisper extract task failed: {}", e)))?;
    let _ = std::fs::remove_file(&zip_path);
    let written = res?;
    if !written.iter().any(|p| p.ends_with("whisper-cli.exe")) {
        return Err(ClipyError::Other(
            "whisper-cli.exe not found in release zip".into(),
        ));
    }
    remove_legacy_whisper_files(binaries_dir);
    info!("whisper.cpp binary installed");
    Ok(())
}

/// Selector for the whisper.cpp zip: the CLI plus the whisper/ggml DLLs it
/// links against. Other tools and unrelated DLLs (SDL2, parakeet) are skipped.
fn whisper_entry_dest(name: &str) -> Option<String> {
    let base = binary::entry_basename(name);
    let lower = base.to_ascii_lowercase();
    let wanted = lower == "whisper-cli.exe"
        || lower == "whisper.dll"
        || (lower.starts_with("ggml") && lower.ends_with(".dll"));
    wanted.then(|| base.to_string())
}

/// Files the previous installer unpacked directly into the binaries dir.
fn is_legacy_whisper_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "whisper-cli.exe"
        || lower == "sdl2.dll"
        || lower == "parakeet.dll"
        || lower == "whisper.dll"
        || (lower.starts_with("ggml") && lower.ends_with(".dll"))
}

/// Best-effort removal of whisper files the old installer left beside
/// ffmpeg/yt-dlp (see the module docs).
fn remove_legacy_whisper_files(binaries_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(binaries_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type().is_ok_and(|t| t.is_file()) && is_legacy_whisper_file(&name) {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                warn!("Could not remove legacy {}: {}", name, e);
            }
        }
    }
}

/// ffmpeg arguments that decode `source` to 16 kHz mono PCM at `wav`.
fn build_extract_audio_args(source: &Path, wav: &Path) -> Vec<String> {
    let mut args: Vec<String> = vec!["-y".into(), "-i".into(), ffmpeg::file_arg(source)];
    args.extend(
        ["-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"]
            .iter()
            .map(|s| s.to_string()),
    );
    args.push(ffmpeg::file_arg(wav));
    args
}

/// Temp-file stem derived from the source name (alphanumerics only).
fn caption_stem(source: &Path) -> String {
    let base: String = source
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(40)
        .collect();
    format!("captions_{}", if base.is_empty() { "audio" } else { &base })
}

/// Full transcription pipeline for a source media file.
pub async fn generate_captions(
    app: &AppHandle,
    source_path: &str,
    model: &str,
) -> Result<CaptionResult> {
    // Validate both IPC inputs before any download or path construction.
    let model_info = find_model(model)?;
    let source = path_policy::ensure_media_file(source_path)?;

    ensure_installed(app, model_info.id).await?;

    let ffmpeg_path = binary::get_ffmpeg_path(app)?;
    let whisper = whisper_cli_path(app)?;
    let model_file = model_path(app, model_info.id)?;

    let temp_dir = paths::get_temp_dir(app)?;
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| ClipyError::Other(format!("Failed to create temp dir: {}", e)))?;
    let stem = caption_stem(&source);
    let wav_path = temp_dir.join(format!("{}.wav", stem));
    let out_stem = temp_dir.join(&stem);

    emit_progress(app, "extract-audio", -1.0, "Extracting audio…");
    debug!("captions: extracting wav -> {:?}", wav_path);
    let status = Command::new(&ffmpeg_path)
        .args(build_extract_audio_args(&source, &wav_path))
        .output()
        .await
        .map_err(|e| ClipyError::FFmpeg(format!("Failed to extract audio: {}", e)))?;
    if !status.status.success() {
        return Err(ClipyError::FFmpeg(format!(
            "ffmpeg audio extraction failed: {}",
            String::from_utf8_lossy(&status.stderr)
        )));
    }

    // Stream stderr so we can report transcription progress
    // (whisper prints "progress = NN%").
    emit_progress(app, "transcribe", 0.0, "Transcribing…");
    debug!("captions: running whisper-cli");
    let mut child = Command::new(&whisper)
        .arg("-m")
        .arg(&model_file)
        .arg("-f")
        .arg(&wav_path)
        // -ml 1: one token per segment (word granularity); -sow: split on
        // words; -ojf: full JSON with token probabilities; -pp: progress.
        .args(["-ml", "1", "-sow", "-ojf", "-pp", "-of"])
        .arg(&out_stem)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
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
            push_tail(&mut stderr_tail, &line, 2000);
        }
    }
    let _ = child
        .wait()
        .await
        .map_err(|e| ClipyError::Other(format!("whisper-cli failed: {}", e)))?;

    // whisper-cli writes errors to stderr but may still exit 0; check output file.
    let json_path = temp_dir.join(format!("{}.json", stem));
    let _ = std::fs::remove_file(&wav_path);
    if !json_path.exists() {
        return Err(ClipyError::Other(format!(
            "whisper produced no output: {}",
            stderr_tail
        )));
    }

    let raw = std::fs::read_to_string(&json_path)
        .map_err(|e| ClipyError::Other(format!("Failed to read whisper json: {}", e)))?;
    let _ = std::fs::remove_file(&json_path);
    let result = parse_whisper_json(&raw, model_info.id)?;

    emit_progress(app, "done", 1.0, "Done");
    info!("captions: produced {} words", result.words.len());
    Ok(result)
}

/// Append `line` to `tail`, keeping at most the last `max` bytes (cut on a
/// char boundary).
fn push_tail(tail: &mut String, line: &str, max: usize) {
    tail.push_str(line);
    tail.push('\n');
    if tail.len() > max {
        let mut cut = tail.len() - max;
        while !tail.is_char_boundary(cut) {
            cut += 1;
        }
        tail.drain(..cut);
    }
}

/// Parse a whisper-cli progress line ("...progress = 42%") into 0.0..1.0.
fn parse_progress_line(line: &str) -> Option<f32> {
    let idx = line.find("progress =")?;
    let rest = &line[idx + "progress =".len()..];
    let pct: f32 = rest
        .split_whitespace()
        .next()?
        .trim_end_matches('%')
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
              "tokens": [ { "p": 0.8 } ] },
            { "text": "  ", "offsets": { "from": 500, "to": 600 } },
            { "text": "untokened", "offsets": { "from": 600, "to": 700 } }
          ]
        }"#;
        let r = parse_whisper_json(raw, "base.en").unwrap();
        assert_eq!(r.language, "en");
        assert_eq!(r.model, "base.en");
        assert_eq!(r.words.len(), 3);
        assert_eq!(r.words[0].text, "Hello");
        assert_eq!(r.words[0].start_ms, 0);
        assert_eq!(r.words[1].end_ms, 500);
        assert!((r.words[0].confidence - 0.9).abs() < 1e-5);
        assert_eq!(r.words[2].confidence, 1.0);
    }

    #[test]
    fn parses_empty_and_invalid_json() {
        let r = parse_whisper_json("{}", "tiny").unwrap();
        assert_eq!(r.language, "en");
        assert!(r.words.is_empty());
        let r = parse_whisper_json(r#"{"result":{"language":"de"}}"#, "tiny").unwrap();
        assert_eq!(r.language, "de");
        assert!(parse_whisper_json("nope", "tiny").is_err());
    }

    #[test]
    fn parses_progress() {
        assert_eq!(
            parse_progress_line("whisper_print_progress_callback: progress = 42%"),
            Some(0.42)
        );
        assert_eq!(parse_progress_line("progress =  100%"), Some(1.0));
        assert_eq!(parse_progress_line("progress = 250 %"), Some(1.0));
        assert_eq!(parse_progress_line("progress = x%"), None);
        assert_eq!(parse_progress_line("progress ="), None);
        assert_eq!(parse_progress_line("no progress here"), None);
    }

    #[test]
    fn model_allowlist() {
        for id in [
            "tiny.en",
            "base.en",
            "base",
            "small",
            "medium.en",
            "large-v3",
        ] {
            let m = find_model(id).unwrap();
            assert_eq!(m.id, id);
        }
        for bad in [
            "",
            "../../evil",
            "base.en/../../x",
            "BASE.EN",
            "base.en ",
            "large-v3-q5_0",
            "https://evil/x",
        ] {
            assert!(find_model(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn model_table_is_well_formed() {
        let mut ids = std::collections::HashSet::new();
        for m in WHISPER_MODELS {
            assert!(binary::is_sha256_hex(m.sha256), "{}", m.id);
            assert!(m.size > 10_000_000, "{}", m.id);
            assert!(ids.insert(m.id), "duplicate {}", m.id);
            assert!(m
                .id
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-'));
        }
        assert!(binary::is_sha256_hex(WHISPER_WIN_ZIP_SHA256));
    }

    #[test]
    fn model_naming_and_urls() {
        let m = find_model("base.en").unwrap();
        assert_eq!(model_file_name(m), "ggml-base.en.bin");
        assert_eq!(
            model_url(m),
            format!(
                "https://huggingface.co/ggerganov/whisper.cpp/resolve/{HF_REVISION}/ggml-base.en.bin"
            )
        );
    }

    #[test]
    fn model_file_size_check() {
        let dir = tempfile::tempdir().unwrap();
        let m = WhisperModel {
            id: "t",
            sha256: WHISPER_WIN_ZIP_SHA256,
            size: 3,
        };
        let f = dir.path().join("m.bin");
        assert!(!model_file_ok(&f, &m));
        std::fs::write(&f, b"abc").unwrap();
        assert!(model_file_ok(&f, &m));
        std::fs::write(&f, b"abcd").unwrap();
        assert!(!model_file_ok(&f, &m));
        assert!(!model_file_ok(dir.path(), &m));
    }

    #[test]
    fn whisper_lives_in_its_own_dir() {
        let bin = Path::new("/app/binaries");
        let cli = whisper_cli_in(bin);
        assert_eq!(cli.parent(), Some(Path::new("/app/binaries/whisper")));
        assert_ne!(cli.parent(), Some(bin));
    }

    #[test]
    fn whisper_entry_selection() {
        assert_eq!(
            whisper_entry_dest("Release/whisper-cli.exe").as_deref(),
            Some("whisper-cli.exe")
        );
        assert_eq!(
            whisper_entry_dest("Release/whisper.dll").as_deref(),
            Some("whisper.dll")
        );
        assert_eq!(
            whisper_entry_dest("Release/ggml-cpu.dll").as_deref(),
            Some("ggml-cpu.dll")
        );
        for skip in [
            "Release/SDL2.dll",
            "Release/parakeet.dll",
            "Release/main.exe",
            "Release/whisper-server.exe",
            "Release/",
        ] {
            assert_eq!(whisper_entry_dest(skip), None, "{skip}");
        }
    }

    #[test]
    fn legacy_cleanup_only_touches_whisper_files() {
        let dir = tempfile::tempdir().unwrap();
        for f in [
            "whisper-cli.exe",
            "whisper.dll",
            "ggml.dll",
            "ggml-base.dll",
            "SDL2.dll",
            "parakeet.dll",
            "ffmpeg.exe",
            "yt-dlp.exe",
            "other.dll",
        ] {
            std::fs::write(dir.path().join(f), b"x").unwrap();
        }
        std::fs::create_dir(dir.path().join("whisper")).unwrap();
        remove_legacy_whisper_files(dir.path());
        let mut left: Vec<String> = std::fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec!["ffmpeg.exe", "other.dll", "whisper", "yt-dlp.exe"]
        );
        remove_legacy_whisper_files(&dir.path().join("missing"));
    }

    #[test]
    fn extract_audio_args_use_file_protocol() {
        let a = build_extract_audio_args(Path::new("/m/in.mp4"), Path::new("/t/out.wav"));
        assert_eq!(a[..3], ["-y", "-i", "file:/m/in.mp4"]);
        assert!(a.windows(2).any(|w| w == ["-ar", "16000"]));
        assert_eq!(a.last().unwrap(), "file:/t/out.wav");
    }

    #[test]
    fn stems_and_tails() {
        assert_eq!(
            caption_stem(Path::new("/a/My Clip (1).mp4")),
            "captions_MyClip1"
        );
        assert_eq!(caption_stem(Path::new("/a/!!!.mp4")), "captions_audio");
        let mut t = String::new();
        push_tail(&mut t, "héllo", 4);
        assert!(t.len() <= 4);
        assert!(t.ends_with('\n'));
        let mut t = String::new();
        push_tail(&mut t, "ok", 100);
        assert_eq!(t, "ok\n");
    }

    #[tokio::test]
    async fn non_windows_install_is_refused() {
        if cfg!(target_os = "windows") {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        assert!(install_whisper_binary(dir.path()).await.is_err());
    }

    #[tokio::test]
    #[ignore = "network: downloads, verifies and extracts the real whisper.cpp bundle"]
    async fn network_install_whisper_bundle() {
        if !cfg!(target_os = "windows") {
            return;
        }
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("ggml.dll"), b"legacy").unwrap();
        install_whisper_binary(dir.path()).await.unwrap();
        assert!(whisper_cli_in(dir.path()).exists());
        assert!(whisper_dir_in(dir.path()).join("whisper.dll").exists());
        assert!(!dir.path().join("ggml.dll").exists());
        assert!(!whisper_dir_in(dir.path()).join("SDL2.dll").exists());
    }

    #[tokio::test]
    #[ignore = "network: downloads and verifies the real tiny.en model (~78 MB)"]
    async fn network_download_tiny_model() {
        let dir = tempfile::tempdir().unwrap();
        let m = find_model("tiny.en").unwrap();
        let target = dir.path().join(model_file_name(m));
        download_model(m, &target).await.unwrap();
        assert!(model_file_ok(&target, m));
        assert_eq!(binary::sha256_file(&target).unwrap(), m.sha256);
    }
}
