//! Binary management service for FFmpeg and yt-dlp.
//!
//! Responsibilities:
//! - Locating ffmpeg/ffprobe/yt-dlp (app binaries dir first, then `PATH`).
//! - Installing them from upstream releases with integrity verification.
//! - Shared verified-download and archive-extraction helpers (also used by the
//!   captions service for whisper.cpp).
//!
//! ## Integrity model
//!
//! Every download is streamed to a temporary file in the destination
//! directory, hashed while streaming, compared against an expected SHA-256 and
//! only then atomically renamed into place. Expected hashes come from:
//! - yt-dlp: the `SHA2-256SUMS` file of the *same* GitHub release tag (the tag
//!   is resolved from the `releases/latest` redirect first, so the asset and
//!   the sums file cannot come from different releases);
//! - ffmpeg on Windows/Linux: BtbN's `checksums.sha256` from the same release;
//! - ffmpeg on macOS: the `.sha256` file martin-riedl.de publishes next to each
//!   versioned build (resolved from its `latest` redirect);
//! - whisper.cpp / models: hashes pinned in the source (see `captions.rs`).
//!
//! SECURITY: checksums served from the same origin as the binary protect
//! against corruption, truncation and tampering by mirrors/CDNs, but not
//! against a compromise of the release origin itself. Pinned hashes (whisper)
//! cover that case; for continuously released tools (yt-dlp, ffmpeg) pinning
//! would freeze users on old versions.

use crate::error::{ClipyError, Result};
use crate::models::settings::BinaryStatus;
use crate::utils::paths;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Runtime};
use tracing::{debug, info, warn};

// -----------------------------------------------------------------------------
// Locating binaries
// -----------------------------------------------------------------------------

/// Platform executable name for `stem` (`ffmpeg` -> `ffmpeg.exe` on Windows).
fn exe_name(stem: &str) -> String {
    if cfg!(windows) {
        format!("{stem}.exe")
    } else {
        stem.to_string()
    }
}

/// The executable to spawn for `path`. Identity in the app.
///
/// NOTE: Windows tests cannot fake a `.exe`, so there a `<stem>.cmd` fixture
/// (see `test_support::fake_tool`) stands in for a missing `<stem>.exe`.
#[cfg(not(all(test, windows)))]
pub(crate) fn platform_exe(path: PathBuf) -> PathBuf {
    path
}

#[cfg(all(test, windows))]
pub(crate) fn platform_exe(path: PathBuf) -> PathBuf {
    let cmd = path.with_extension("cmd");
    if !path.exists() && cmd.exists() {
        cmd
    } else {
        path
    }
}

/// Resolve `name` on `PATH` via `where`/`which`, returning the first hit that
/// exists.
fn which(name: &str) -> Option<PathBuf> {
    let output = Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(name)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    first_existing_line(&String::from_utf8_lossy(&output.stdout))
}

/// First line of `where`/`which` output that names an existing file.
fn first_existing_line(output: &str) -> Option<PathBuf> {
    output
        .lines()
        .map(|l| PathBuf::from(l.trim()))
        .find(|p| !p.as_os_str().is_empty() && p.exists())
}

/// Locate `stem` in `binaries_dir`, falling back to `PATH`.
fn find_binary(binaries_dir: &Path, stem: &str) -> Option<PathBuf> {
    let local = platform_exe(binaries_dir.join(exe_name(stem)));
    if local.exists() {
        return Some(local);
    }
    which(&exe_name(stem))
}

/// Run `path <arg>` and return stdout when it exits successfully.
fn run_version(path: &Path, arg: &str) -> Option<String> {
    let output = Command::new(path).arg(arg).output().ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Parse FFmpeg version from `ffmpeg -version` output.
fn parse_ffmpeg_version(output: &str) -> Option<String> {
    let first_line = output.lines().next()?;
    if !first_line.starts_with("ffmpeg version") {
        return None;
    }
    first_line.split_whitespace().nth(2).map(str::to_string)
}

/// Parse yt-dlp `--version` output (a single version line).
fn parse_ytdlp_version(output: &str) -> Option<String> {
    let v = output.trim();
    (!v.is_empty()).then(|| v.to_string())
}

/// Installation status of one binary: (installed, version, path).
type Probe = (bool, Option<String>, Option<PathBuf>);

/// Probe a binary in `binaries_dir`/`PATH` with `version_arg` and `parse`.
fn probe_binary(
    binaries_dir: &Path,
    stem: &str,
    version_arg: &str,
    parse: fn(&str) -> Option<String>,
) -> Probe {
    match find_binary(binaries_dir, stem) {
        Some(path) => match run_version(&path, version_arg).and_then(|o| parse(&o)) {
            Some(version) => (true, Some(version), Some(path)),
            None => {
                debug!("{stem} at {:?} did not report a version", path);
                (false, None, None)
            }
        },
        None => (false, None, None),
    }
}

/// Build a [`BinaryStatus`] for the binaries in `binaries_dir` (or on `PATH`).
fn check_binaries_in(binaries_dir: &Path) -> BinaryStatus {
    let ffmpeg = probe_binary(binaries_dir, "ffmpeg", "-version", parse_ffmpeg_version);
    let ytdlp = probe_binary(binaries_dir, "yt-dlp", "--version", parse_ytdlp_version);
    BinaryStatus {
        ffmpeg_installed: ffmpeg.0,
        ffmpeg_version: ffmpeg.1,
        ffmpeg_path: ffmpeg.2.map(|p| p.to_string_lossy().to_string()),
        ytdlp_installed: ytdlp.0,
        ytdlp_version: ytdlp.1,
        ytdlp_path: ytdlp.2.map(|p| p.to_string_lossy().to_string()),
    }
}

/// Check if required binaries are installed
pub fn check_binaries<R: Runtime>(app: &AppHandle<R>) -> Result<BinaryStatus> {
    info!("Checking binary status");
    let status = check_binaries_in(&paths::get_binaries_dir(app)?);
    debug!("Binary status: {:?}", status);
    Ok(status)
}

/// Get the path to FFmpeg binary
pub fn get_ffmpeg_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    find_binary(&paths::get_binaries_dir(app)?, "ffmpeg")
        .ok_or_else(|| ClipyError::BinaryNotFound("FFmpeg not found".into()))
}

/// Get the path to yt-dlp binary
pub fn get_ytdlp_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    find_binary(&paths::get_binaries_dir(app)?, "yt-dlp")
        .ok_or_else(|| ClipyError::BinaryNotFound("yt-dlp not found".into()))
}

/// Get the path to FFprobe binary (comes bundled with FFmpeg)
pub fn get_ffprobe_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = paths::get_binaries_dir(app)?;
    find_binary(&dir, "ffprobe")
        .or_else(|| {
            let ffmpeg = find_binary(&dir, "ffmpeg")?;
            let beside = platform_exe(ffmpeg.parent()?.join(exe_name("ffprobe")));
            beside.exists().then_some(beside)
        })
        .ok_or_else(|| ClipyError::BinaryNotFound("FFprobe not found".into()))
}

// -----------------------------------------------------------------------------
// Checksums
// -----------------------------------------------------------------------------

/// Whether `s` is a 64-character hex SHA-256 digest.
pub(crate) fn is_sha256_hex(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Find the SHA-256 for `file_name` in a `sha256sum`-style listing
/// (`<hash>  <name>` or `<hash> *<name>`, one per line). Paths in the listing
/// are compared by basename. Returns the lowercase digest.
pub(crate) fn parse_checksum_file(listing: &str, file_name: &str) -> Option<String> {
    listing.lines().find_map(|line| {
        let mut parts = line.split_whitespace();
        let hash = parts.next()?;
        let name = parts.next()?.trim_start_matches('*');
        let base = name.rsplit(['/', '\\']).next().unwrap_or(name);
        (base == file_name && is_sha256_hex(hash)).then(|| hash.to_ascii_lowercase())
    })
}

/// Compare a computed digest with the expected one (case-insensitive).
pub(crate) fn verify_sha256(actual: &str, expected: &str, what: &str) -> Result<()> {
    if is_sha256_hex(expected) && actual.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(ClipyError::Other(format!(
            "Checksum mismatch for {what}: expected {expected}, got {actual}"
        )))
    }
}

/// SHA-256 of a file on disk, as lowercase hex.
#[cfg(test)]
pub(crate) fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex::encode(hasher.finalize()))
}

// -----------------------------------------------------------------------------
// Download helpers
// -----------------------------------------------------------------------------

/// Upper bound for a downloaded binary or archive.
const MAX_BINARY_DOWNLOAD: u64 = 512 * 1024 * 1024;

/// Shared HTTP client (redirects followed; GitHub requires a User-Agent).
pub(crate) fn http_client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(concat!("Clipy/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| ClipyError::Other(format!("HTTP client error: {e}")))
}

/// Fetch a small text resource (checksum listings).
async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to fetch {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(ClipyError::Other(format!(
            "Failed to fetch {url}: HTTP {}",
            resp.status()
        )));
    }
    resp.text()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to read {url}: {e}")))
}

/// Return the `Location` of a redirect at `url` without following it.
async fn resolve_redirect(url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("Clipy/", env!("CARGO_PKG_VERSION")))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| ClipyError::Other(format!("HTTP client error: {e}")))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to resolve {url}: {e}")))?;
    resp.headers()
        .get(reqwest::header::LOCATION)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .ok_or_else(|| {
            ClipyError::Other(format!(
                "Expected a redirect from {url}, got HTTP {}",
                resp.status()
            ))
        })
}

/// Stream `url` into a temp file inside `dir`, hashing as it goes. Returns the
/// temp file (deleted on drop unless persisted) and its SHA-256.
async fn download_to_temp(
    client: &reqwest::Client,
    url: &str,
    dir: &Path,
    max_bytes: u64,
) -> Result<(tempfile::NamedTempFile, String)> {
    std::fs::create_dir_all(dir)?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| ClipyError::Other(format!("Failed to download {url}: {e}")))?;
    if !resp.status().is_success() {
        return Err(ClipyError::Other(format!(
            "Download of {url} failed: HTTP {}",
            resp.status()
        )));
    }
    if resp.content_length().is_some_and(|len| len > max_bytes) {
        return Err(ClipyError::Other(format!(
            "{url} exceeds {max_bytes} bytes"
        )));
    }

    let mut tmp = tempfile::Builder::new()
        .prefix(".clipy-download-")
        .tempfile_in(dir)?;
    let mut hasher = Sha256::new();
    let mut written: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| ClipyError::Other(format!("Download interrupted: {e}")))?;
        written += chunk.len() as u64;
        if written > max_bytes {
            return Err(ClipyError::Other(format!(
                "{url} exceeds {max_bytes} bytes"
            )));
        }
        hasher.update(&chunk);
        tmp.write_all(&chunk)?;
    }
    tmp.as_file().sync_all()?;
    Ok((tmp, hex::encode(hasher.finalize())))
}

/// Download `url` to `dest`, verifying its SHA-256 before atomically moving it
/// into place. Nothing is written at `dest` if verification fails.
pub(crate) async fn download_verified(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    expected_sha256: &str,
    max_bytes: u64,
) -> Result<()> {
    let dir = dest
        .parent()
        .ok_or_else(|| ClipyError::Other(format!("No parent for {}", dest.display())))?;
    debug!("Downloading {} -> {:?}", url, dest);
    let (tmp, actual) = download_to_temp(client, url, dir, max_bytes).await?;
    verify_sha256(&actual, expected_sha256, url)?;
    tmp.persist(dest)
        .map_err(|e| ClipyError::Other(format!("Failed to install {}: {}", dest.display(), e)))?;
    Ok(())
}

/// Set 0o755 permissions on an installed unix binary.
#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))?;
    Ok(())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
}

// -----------------------------------------------------------------------------
// Archive extraction
// -----------------------------------------------------------------------------

/// Decides which archive entries to keep: maps an entry's path inside the
/// archive to the basename to write, or `None` to skip it.
pub(crate) type EntrySelector<'a> = &'a dyn Fn(&str) -> Option<String>;

/// Write one archive entry to `dest_dir/name` atomically (temp + rename).
fn write_entry(reader: &mut dyn std::io::Read, dest_dir: &Path, name: &str) -> Result<PathBuf> {
    // SECURITY: `name` comes from the selector, which only returns fixed
    // basenames; reject anything with separators or traversal regardless.
    if name.is_empty() || name.contains(['/', '\\']) || name == "." || name == ".." {
        return Err(ClipyError::Other(format!(
            "Unsafe archive entry name {name:?}"
        )));
    }
    let dest = dest_dir.join(name);
    let mut tmp = tempfile::Builder::new()
        .prefix(".clipy-extract-")
        .tempfile_in(dest_dir)?;
    std::io::copy(reader, &mut tmp)?;
    tmp.as_file().sync_all()?;
    tmp.persist(&dest)
        .map_err(|e| ClipyError::Other(format!("Failed to install {}: {}", dest.display(), e)))?;
    set_executable(&dest)?;
    Ok(dest)
}

/// Extract selected regular-file entries of a zip archive into `dest_dir`.
///
/// Directory and symlink entries are ignored, and every output is written by
/// basename only, so `../` (zip-slip) entries cannot escape `dest_dir`.
pub(crate) fn extract_zip(
    archive: &Path,
    dest_dir: &Path,
    select: EntrySelector,
) -> Result<Vec<PathBuf>> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)
        .map_err(|e| ClipyError::Other(format!("Failed to read zip archive: {}", e)))?;
    let mut written = Vec::new();
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| ClipyError::Other(format!("Failed to read zip entry: {}", e)))?;
        if !entry.is_file() || entry.is_symlink() {
            continue;
        }
        let Some(name) = select(entry.name()) else {
            continue;
        };
        written.push(write_entry(&mut entry, dest_dir, &name)?);
    }
    Ok(written)
}

/// Extract selected regular-file entries of a `.tar.xz` archive into
/// `dest_dir`, with the same guarantees as [`extract_zip`] (symlinks, hard
/// links and devices are skipped).
pub(crate) fn extract_tar_xz(
    archive: &Path,
    dest_dir: &Path,
    select: EntrySelector,
) -> Result<Vec<PathBuf>> {
    let file = std::fs::File::open(archive)?;
    let mut tar = tar::Archive::new(xz2::read::XzDecoder::new(std::io::BufReader::new(file)));
    let mut written = Vec::new();
    for entry in tar
        .entries()
        .map_err(|e| ClipyError::Other(format!("Failed to read tar entries: {}", e)))?
    {
        let mut entry =
            entry.map_err(|e| ClipyError::Other(format!("Failed to read tar entry: {}", e)))?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry
            .path()
            .map_err(|e| ClipyError::Other(format!("Bad tar entry path: {}", e)))?
            .to_string_lossy()
            .into_owned();
        let Some(name) = select(&path) else {
            continue;
        };
        written.push(write_entry(&mut entry, dest_dir, &name)?);
    }
    Ok(written)
}

/// Basename of an archive entry path (either separator).
pub(crate) fn entry_basename(path: &str) -> &str {
    path.rsplit(['/', '\\']).next().unwrap_or(path)
}

/// Selector for ffmpeg archives: keeps `ffmpeg` and `ffprobe` (any platform
/// suffix) and renames them for the current platform.
fn ffmpeg_entry_dest(name: &str) -> Option<String> {
    match entry_basename(name) {
        "ffmpeg" | "ffmpeg.exe" => Some(exe_name("ffmpeg")),
        "ffprobe" | "ffprobe.exe" => Some(exe_name("ffprobe")),
        _ => None,
    }
}

// -----------------------------------------------------------------------------
// Download sources
// -----------------------------------------------------------------------------

const YTDLP_RELEASES: &str = "https://github.com/yt-dlp/yt-dlp/releases";
const BTBN_LATEST: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest";
const MARTIN_RIEDL: &str = "https://ffmpeg.martin-riedl.de";

/// Upstream base URLs the installers download from. Always [`Sources::upstream`]
/// in the app; tests point them at a local server.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Sources {
    /// GitHub releases root of yt-dlp.
    pub ytdlp_releases: String,
    /// BtbN `latest` release download root.
    pub btbn_latest: String,
    /// martin-riedl.de origin (macOS builds).
    pub martin_riedl: String,
}

impl Sources {
    /// The real upstream locations.
    pub fn upstream() -> Self {
        Self {
            ytdlp_releases: YTDLP_RELEASES.into(),
            btbn_latest: BTBN_LATEST.into(),
            martin_riedl: MARTIN_RIEDL.into(),
        }
    }
}

/// yt-dlp release asset for an OS/arch (`std::env::consts` values).
///
/// Linux uses the standalone `yt-dlp_linux*` builds rather than the `yt-dlp`
/// zipapp, which needs a system Python.
fn ytdlp_asset_name(os: &str, arch: &str) -> Option<&'static str> {
    match (os, arch) {
        ("windows", "x86_64") => Some("yt-dlp.exe"),
        ("windows", "aarch64") => Some("yt-dlp_arm64.exe"),
        ("windows", "x86") => Some("yt-dlp_x86.exe"),
        ("macos", _) => Some("yt-dlp_macos"),
        ("linux", "x86_64") => Some("yt-dlp_linux"),
        ("linux", "aarch64") => Some("yt-dlp_linux_aarch64"),
        _ => None,
    }
}

/// Extract the tag from a GitHub `releases/latest` redirect target
/// (`.../releases/tag/<tag>`).
fn parse_release_tag(location: &str) -> Option<String> {
    let tag = location.split("/releases/tag/").nth(1)?;
    let tag = tag.split(['?', '#', '/']).next()?;
    let ok = !tag.is_empty()
        && tag
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'));
    ok.then(|| tag.to_string())
}

/// Where to obtain ffmpeg/ffprobe for a platform.
#[derive(Debug, Clone, PartialEq, Eq)]
enum FfmpegSource {
    /// One BtbN archive containing both binaries, verified with the release's
    /// `checksums.sha256`.
    BtbN { asset: &'static str },
    /// martin-riedl.de: separate `ffmpeg.zip`/`ffprobe.zip` per arch, each
    /// with a `.sha256` next to the resolved versioned URL.
    MartinRiedl { arch: &'static str },
}

/// Select the ffmpeg source for an OS/arch (`std::env::consts` values).
fn ffmpeg_source(os: &str, arch: &str) -> Option<FfmpegSource> {
    let btbn = |asset| Some(FfmpegSource::BtbN { asset });
    match (os, arch) {
        ("windows", "x86_64") => btbn("ffmpeg-master-latest-win64-gpl.zip"),
        ("windows", "aarch64") => btbn("ffmpeg-master-latest-winarm64-gpl.zip"),
        ("linux", "x86_64") => btbn("ffmpeg-master-latest-linux64-gpl.tar.xz"),
        ("linux", "aarch64") => btbn("ffmpeg-master-latest-linuxarm64-gpl.tar.xz"),
        ("macos", "x86_64") => Some(FfmpegSource::MartinRiedl { arch: "amd64" }),
        ("macos", "aarch64") => Some(FfmpegSource::MartinRiedl { arch: "arm64" }),
        _ => None,
    }
}

/// martin-riedl.de redirect URL for the latest release build of `tool`.
fn martin_riedl_latest_url(origin: &str, arch: &str, tool: &str) -> String {
    format!("{origin}/redirect/latest/macos/{arch}/release/{tool}.zip")
}

/// Absolute download URL for a martin-riedl.de redirect `Location`, which may
/// be relative (`/download/...`). Only `origin`'s scheme and host are
/// accepted (`https://ffmpeg.martin-riedl.de` in the app).
fn martin_riedl_resolve(origin: &str, location: &str) -> Option<String> {
    let base = url::Url::parse(origin).ok()?;
    let resolved = base.join(location).ok()?;
    (resolved.scheme() == base.scheme() && resolved.host_str() == base.host_str())
        .then(|| resolved.to_string())
}

// -----------------------------------------------------------------------------
// Installers
// -----------------------------------------------------------------------------

/// Download and install FFmpeg
pub async fn install_ffmpeg<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = paths::get_binaries_dir(app)?;
    install_ffmpeg_into(
        &Sources::upstream(),
        &dir,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
    .await
}

/// Install ffmpeg + ffprobe for `os`/`arch` from `src` into `binaries_dir`.
async fn install_ffmpeg_into(
    src: &Sources,
    binaries_dir: &Path,
    os: &str,
    arch: &str,
) -> Result<PathBuf> {
    info!("Installing FFmpeg for {os}/{arch}");
    std::fs::create_dir_all(binaries_dir)?;
    let source = ffmpeg_source(os, arch).ok_or_else(|| {
        ClipyError::Other(format!(
            "No verified FFmpeg build for {os}/{arch}; install ffmpeg on PATH"
        ))
    })?;
    let client = http_client()?;

    match source {
        FfmpegSource::BtbN { asset } => {
            let sums =
                fetch_text(&client, &format!("{}/checksums.sha256", src.btbn_latest)).await?;
            let expected = parse_checksum_file(&sums, asset).ok_or_else(|| {
                ClipyError::Other(format!("{asset} missing from checksums.sha256"))
            })?;
            let archive = download_archive(
                &client,
                &format!("{}/{asset}", src.btbn_latest),
                binaries_dir,
                &expected,
            )
            .await?;
            let is_zip = asset.ends_with(".zip");
            let dir = binaries_dir.to_path_buf();
            let path = archive.path().to_path_buf();
            let written = tokio::task::spawn_blocking(move || {
                if is_zip {
                    extract_zip(&path, &dir, &ffmpeg_entry_dest)
                } else {
                    extract_tar_xz(&path, &dir, &ffmpeg_entry_dest)
                }
            })
            .await
            .map_err(|e| ClipyError::Other(format!("Extraction task failed: {}", e)))??;
            debug!("Extracted {:?}", written);
        }
        FfmpegSource::MartinRiedl { arch } => {
            for tool in ["ffmpeg", "ffprobe"] {
                let location =
                    resolve_redirect(&martin_riedl_latest_url(&src.martin_riedl, arch, tool))
                        .await?;
                let url = martin_riedl_resolve(&src.martin_riedl, &location).ok_or_else(|| {
                    ClipyError::Other(format!("Unexpected FFmpeg redirect: {location}"))
                })?;
                let sums = fetch_text(&client, &format!("{url}.sha256")).await?;
                let zip_name = format!("{tool}.zip");
                let expected = parse_checksum_file(&sums, &zip_name).ok_or_else(|| {
                    ClipyError::Other(format!("No checksum for {zip_name} at {url}.sha256"))
                })?;
                let archive = download_archive(&client, &url, binaries_dir, &expected).await?;
                let dir = binaries_dir.to_path_buf();
                let path = archive.path().to_path_buf();
                tokio::task::spawn_blocking(move || extract_zip(&path, &dir, &ffmpeg_entry_dest))
                    .await
                    .map_err(|e| ClipyError::Other(format!("Extraction task failed: {}", e)))??;
            }
        }
    }

    let target = binaries_dir.join(exe_name("ffmpeg"));
    if !target.exists() {
        return Err(ClipyError::Other(
            "FFmpeg binary not found in downloaded archive".into(),
        ));
    }
    info!("FFmpeg installed to {:?}", target);
    Ok(target)
}

/// Download an archive into a verified temp file inside `dir` (removed when
/// the returned handle drops).
async fn download_archive(
    client: &reqwest::Client,
    url: &str,
    dir: &Path,
    expected_sha256: &str,
) -> Result<tempfile::NamedTempFile> {
    let (tmp, actual) = download_to_temp(client, url, dir, MAX_BINARY_DOWNLOAD).await?;
    verify_sha256(&actual, expected_sha256, url)?;
    Ok(tmp)
}

/// Download and install yt-dlp
pub async fn install_ytdlp<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    let dir = paths::get_binaries_dir(app)?;
    install_ytdlp_into(
        &Sources::upstream(),
        &dir,
        std::env::consts::OS,
        std::env::consts::ARCH,
    )
    .await
}

/// Install the latest verified yt-dlp for `os`/`arch` from `src` into
/// `binaries_dir`.
pub(crate) async fn install_ytdlp_into(
    src: &Sources,
    binaries_dir: &Path,
    os: &str,
    arch: &str,
) -> Result<PathBuf> {
    info!("Installing yt-dlp for {os}/{arch}");
    std::fs::create_dir_all(binaries_dir)?;
    let asset = ytdlp_asset_name(os, arch).ok_or_else(|| {
        ClipyError::Other(format!(
            "No yt-dlp build for {os}/{arch}; install it on PATH"
        ))
    })?;
    let client = http_client()?;

    let releases = &src.ytdlp_releases;
    let location = resolve_redirect(&format!("{releases}/latest")).await?;
    let tag = parse_release_tag(&location)
        .ok_or_else(|| ClipyError::Other(format!("Unexpected yt-dlp redirect: {location}")))?;
    let sums = fetch_text(&client, &format!("{releases}/download/{tag}/SHA2-256SUMS")).await?;
    let expected = parse_checksum_file(&sums, asset)
        .ok_or_else(|| ClipyError::Other(format!("{asset} missing from SHA2-256SUMS ({tag})")))?;

    let target = binaries_dir.join(exe_name("yt-dlp"));
    download_verified(
        &client,
        &format!("{releases}/download/{tag}/{asset}"),
        &target,
        &expected,
        MAX_BINARY_DOWNLOAD,
    )
    .await?;
    set_executable(&target)?;
    info!("yt-dlp {} installed to {:?}", tag, target);
    Ok(target)
}

/// Update yt-dlp to latest version.
///
/// NOTE: delegates to `yt-dlp -U`, whose updater verifies the release's
/// `SHA2-256SUMS` itself.
pub async fn update_ytdlp<R: Runtime>(app: &AppHandle<R>) -> Result<String> {
    info!("Updating yt-dlp to latest version");
    let ytdlp_path = get_ytdlp_path(app)?;
    let output = tokio::process::Command::new(&ytdlp_path)
        .arg("-U")
        .output()
        .await
        .map_err(|e| {
            ClipyError::BinaryExecutionFailed(format!("Failed to update yt-dlp: {}", e))
        })?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    debug!("yt-dlp update stdout: {}", stdout);
    if output.status.success() {
        info!("yt-dlp updated successfully");
        Ok(stdout.to_string())
    } else {
        warn!("yt-dlp update failed: {}", stderr);
        Err(ClipyError::BinaryExecutionFailed(format!(
            "Update failed: {}",
            stderr
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{
        build_zip, fake_tool, mock_app_in_tempdir, sha256_hex, Route, Script, TestServer,
    };

    const HASH_A: &str = "1fa6733c37ea6fb51c99ad8fe785e7b7e5f3246c9b980230329d4fb72ed8d4d6";
    const HASH_B: &str = "66674953FE251B89F4D08C5F0E35E0728679BD67AB3D7D05C0562AF101DD3E7A";

    #[test]
    fn checksum_listing_parsing() {
        let listing = format!(
            "{HASH_A}  yt-dlp\n{HASH_B} *yt-dlp.exe\nnot-a-hash  yt-dlp_macos\n\n{HASH_A}  dir/sub/ffmpeg.zip\n"
        );
        assert_eq!(
            parse_checksum_file(&listing, "yt-dlp").as_deref(),
            Some(HASH_A)
        );
        assert_eq!(
            parse_checksum_file(&listing, "yt-dlp.exe"),
            Some(HASH_B.to_ascii_lowercase())
        );
        assert_eq!(parse_checksum_file(&listing, "yt-dlp_macos"), None);
        assert_eq!(parse_checksum_file(&listing, "yt-dlp_linux"), None);
        assert_eq!(
            parse_checksum_file(&listing, "ffmpeg.zip").as_deref(),
            Some(HASH_A)
        );
        assert_eq!(parse_checksum_file("", "x"), None);
        assert_eq!(parse_checksum_file(HASH_A, "x"), None);
    }

    #[test]
    fn sha256_helpers() {
        assert!(is_sha256_hex(HASH_A));
        assert!(is_sha256_hex(HASH_B));
        assert!(!is_sha256_hex(&HASH_A[1..]));
        assert!(!is_sha256_hex(&format!("{}z", &HASH_A[1..])));
        assert!(verify_sha256(HASH_A, HASH_A, "x").is_ok());
        assert!(verify_sha256(&HASH_B.to_lowercase(), HASH_B, "x").is_ok());
        assert!(verify_sha256(HASH_A, HASH_B, "x").is_err());
        assert!(verify_sha256("", "", "x").is_err());

        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("abc");
        std::fs::write(&f, b"abc").unwrap();
        assert_eq!(
            sha256_file(&f).unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(sha256_file(&dir.path().join("missing")).is_err());
    }

    #[test]
    fn release_tag_parsing() {
        assert_eq!(
            parse_release_tag("https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19")
                .as_deref(),
            Some("2026.08.19")
        );
        assert_eq!(
            parse_release_tag("/yt-dlp/yt-dlp/releases/tag/v1.2-rc_1?x=1").as_deref(),
            Some("v1.2-rc_1")
        );
        assert_eq!(parse_release_tag("https://github.com/x/releases"), None);
        assert_eq!(parse_release_tag("https://x/releases/tag/"), None);
        assert_eq!(parse_release_tag("https://x/releases/tag/..%2f"), None);
        assert_eq!(parse_release_tag("https://x/releases/tag/a b"), None);
    }

    #[test]
    fn ytdlp_asset_selection() {
        assert_eq!(ytdlp_asset_name("windows", "x86_64"), Some("yt-dlp.exe"));
        assert_eq!(
            ytdlp_asset_name("windows", "aarch64"),
            Some("yt-dlp_arm64.exe")
        );
        assert_eq!(ytdlp_asset_name("windows", "x86"), Some("yt-dlp_x86.exe"));
        assert_eq!(ytdlp_asset_name("macos", "aarch64"), Some("yt-dlp_macos"));
        assert_eq!(ytdlp_asset_name("macos", "x86_64"), Some("yt-dlp_macos"));
        assert_eq!(ytdlp_asset_name("linux", "x86_64"), Some("yt-dlp_linux"));
        assert_eq!(
            ytdlp_asset_name("linux", "aarch64"),
            Some("yt-dlp_linux_aarch64")
        );
        assert_eq!(ytdlp_asset_name("linux", "riscv64"), None);
        assert_eq!(ytdlp_asset_name("freebsd", "x86_64"), None);
        assert!(ytdlp_asset_name(std::env::consts::OS, std::env::consts::ARCH).is_some());
    }

    #[test]
    fn ffmpeg_source_selection() {
        assert_eq!(
            ffmpeg_source("windows", "x86_64"),
            Some(FfmpegSource::BtbN {
                asset: "ffmpeg-master-latest-win64-gpl.zip"
            })
        );
        assert_eq!(
            ffmpeg_source("windows", "aarch64"),
            Some(FfmpegSource::BtbN {
                asset: "ffmpeg-master-latest-winarm64-gpl.zip"
            })
        );
        assert_eq!(
            ffmpeg_source("linux", "x86_64"),
            Some(FfmpegSource::BtbN {
                asset: "ffmpeg-master-latest-linux64-gpl.tar.xz"
            })
        );
        assert_eq!(
            ffmpeg_source("linux", "aarch64"),
            Some(FfmpegSource::BtbN {
                asset: "ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
            })
        );
        assert_eq!(
            ffmpeg_source("macos", "aarch64"),
            Some(FfmpegSource::MartinRiedl { arch: "arm64" })
        );
        assert_eq!(
            ffmpeg_source("macos", "x86_64"),
            Some(FfmpegSource::MartinRiedl { arch: "amd64" })
        );
        assert_eq!(ffmpeg_source("windows", "x86"), None);
        assert_eq!(ffmpeg_source("linux", "arm"), None);
        assert!(ffmpeg_source(std::env::consts::OS, std::env::consts::ARCH).is_some());
    }

    #[test]
    fn martin_riedl_urls() {
        let origin = &Sources::upstream().martin_riedl;
        assert_eq!(
            martin_riedl_latest_url(origin, "arm64", "ffprobe"),
            "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffprobe.zip"
        );
        assert_eq!(
            martin_riedl_resolve(origin, "/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip")
                .as_deref(),
            Some("https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip")
        );
        assert_eq!(
            martin_riedl_resolve(origin, "https://evil.example/ffmpeg.zip"),
            None
        );
        assert_eq!(
            martin_riedl_resolve(origin, "http://ffmpeg.martin-riedl.de/x.zip"),
            None
        );
        assert_eq!(martin_riedl_resolve("not a url", "/x.zip"), None);
    }

    #[test]
    fn version_parsing() {
        assert_eq!(
            parse_ffmpeg_version("ffmpeg version 8.0.1-full_build Copyright\nmore"),
            Some("8.0.1-full_build".into())
        );
        assert_eq!(parse_ffmpeg_version("something else"), None);
        assert_eq!(parse_ffmpeg_version("ffmpeg version"), None);
        assert_eq!(parse_ffmpeg_version(""), None);
        assert_eq!(
            parse_ytdlp_version("2026.08.19\n"),
            Some("2026.08.19".into())
        );
        assert_eq!(parse_ytdlp_version("  \n"), None);
    }

    #[test]
    fn locating_binaries() {
        let dir = tempfile::tempdir().unwrap();
        let local = dir.path().join(exe_name("clipy-fake-tool"));
        std::fs::write(&local, b"").unwrap();
        assert_eq!(
            find_binary(dir.path(), "clipy-fake-tool"),
            Some(local.clone())
        );
        assert_eq!(
            find_binary(dir.path(), "clipy-definitely-missing-tool"),
            None
        );
        assert_eq!(run_version(&dir.path().join("nope"), "--version"), None);
        let probe = probe_binary(dir.path(), "clipy-fake-tool", "-v", parse_ytdlp_version);
        assert_eq!(probe, (false, None, None));

        let listing = format!("\n{}\nC:/nope\n", local.display());
        assert_eq!(first_existing_line(&listing), Some(local));
        assert_eq!(first_existing_line("/no/such\n"), None);

        // Exercises the PATH fallback; the result depends on the host.
        let status = check_binaries_in(dir.path());
        assert_eq!(status.ffmpeg_installed, status.ffmpeg_path.is_some());
    }

    #[test]
    fn ffmpeg_entry_selection() {
        assert_eq!(
            ffmpeg_entry_dest("ffmpeg-master/bin/ffmpeg.exe"),
            Some(exe_name("ffmpeg"))
        );
        assert_eq!(
            ffmpeg_entry_dest("x\\bin\\ffprobe"),
            Some(exe_name("ffprobe"))
        );
        assert_eq!(ffmpeg_entry_dest("bin/ffplay.exe"), None);
        assert_eq!(ffmpeg_entry_dest("doc/ffmpeg.html"), None);
        assert_eq!(entry_basename("a/b\\c"), "c");
        assert_eq!(entry_basename("plain"), "plain");
    }

    // ---- archive extraction with in-test archives ----

    fn build_tar_xz(
        dir: &Path,
        entries: &[(&str, &[u8])],
        symlink: Option<(&str, &str)>,
    ) -> PathBuf {
        let path = dir.join("a.tar.xz");
        let file = std::fs::File::create(&path).unwrap();
        let enc = xz2::write::XzEncoder::new(file, 1);
        let mut b = tar::Builder::new(enc);
        for (name, data) in entries {
            let mut h = tar::Header::new_gnu();
            h.set_size(data.len() as u64);
            h.set_mode(0o644);
            h.set_entry_type(tar::EntryType::Regular);
            // `append_data` validates paths; write the raw name to model a
            // malicious archive with `..` components.
            let name_bytes = name.as_bytes();
            h.as_old_mut().name[..name_bytes.len()].copy_from_slice(name_bytes);
            h.set_cksum();
            b.append(&h, *data).unwrap();
        }
        if let Some((name, target)) = symlink {
            let mut h = tar::Header::new_gnu();
            h.set_entry_type(tar::EntryType::Symlink);
            h.set_size(0);
            b.append_link(&mut h, name, target).unwrap();
        }
        b.into_inner().unwrap().finish().unwrap();
        path
    }

    fn dir_names(dir: &Path) -> Vec<String> {
        let mut v: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        v.sort();
        v
    }

    #[test]
    fn zip_extraction_keeps_only_selected_basenames() {
        let work = tempfile::tempdir().unwrap();
        let out = work.path().join("out");
        std::fs::create_dir(&out).unwrap();
        let archive = work.path().join("a.zip");
        std::fs::write(
            &archive,
            build_zip(
                &[
                    ("ffmpeg-x/", b""),
                    ("ffmpeg-x/bin/ffmpeg.exe", b"FFMPEG"),
                    ("ffmpeg-x/bin/ffprobe.exe", b"FFPROBE"),
                    ("ffmpeg-x/bin/ffplay.exe", b"no"),
                    ("../../evil/ffmpeg", b"SLIP"),
                ],
                Some(("ffmpeg-x/bin/ffprobe", "/etc/passwd")),
            ),
        )
        .unwrap();
        let written = extract_zip(&archive, &out, &ffmpeg_entry_dest).unwrap();
        assert_eq!(written.len(), 3);
        let mut expect = vec![exe_name("ffmpeg"), exe_name("ffprobe")];
        expect.sort();
        assert_eq!(dir_names(&out), expect);
        // The zip-slip entry was written by basename inside `out`, last wins.
        assert_eq!(
            std::fs::read(out.join(exe_name("ffmpeg"))).unwrap(),
            b"SLIP"
        );
        assert_eq!(
            std::fs::read(out.join(exe_name("ffprobe"))).unwrap(),
            b"FFPROBE"
        );
        assert!(!work.path().join("evil").exists());
    }

    #[test]
    fn tar_xz_extraction_skips_symlinks_and_contains_traversal() {
        let work = tempfile::tempdir().unwrap();
        let out = work.path().join("out");
        std::fs::create_dir(&out).unwrap();
        let archive = build_tar_xz(
            work.path(),
            &[
                ("ffmpeg-linux64/bin/ffmpeg", b"FFMPEG"),
                ("ffmpeg-linux64/doc/readme.txt", b"doc"),
                ("../../ffprobe", b"SLIP"),
            ],
            Some(("ffmpeg-linux64/bin/ffprobe", "/etc/shadow")),
        );
        let written = extract_tar_xz(&archive, &out, &ffmpeg_entry_dest).unwrap();
        assert_eq!(written.len(), 2);
        assert_eq!(
            std::fs::read(out.join(exe_name("ffprobe"))).unwrap(),
            b"SLIP"
        );
        assert_eq!(
            std::fs::read(out.join(exe_name("ffmpeg"))).unwrap(),
            b"FFMPEG"
        );
        assert!(!work.path().join("ffprobe").exists());
        assert!(!work.path().parent().unwrap().join("ffprobe").exists());
    }

    #[test]
    fn extraction_errors() {
        let work = tempfile::tempdir().unwrap();
        let junk = work.path().join("junk.zip");
        std::fs::write(&junk, b"not an archive").unwrap();
        assert!(extract_zip(&junk, work.path(), &ffmpeg_entry_dest).is_err());
        assert!(extract_tar_xz(&junk, work.path(), &ffmpeg_entry_dest).is_err());
        assert!(extract_zip(
            &work.path().join("missing"),
            work.path(),
            &ffmpeg_entry_dest
        )
        .is_err());

        // A selector that returns an unsafe name is refused at write time.
        let archive = work.path().join("a.zip");
        std::fs::write(&archive, build_zip(&[("x", b"1")], None)).unwrap();
        for bad in ["../x", "a/b", "a\\b", "..", ".", ""] {
            let sel = move |_: &str| Some(bad.to_string());
            assert!(extract_zip(&archive, work.path(), &sel).is_err(), "{bad:?}");
        }
    }

    #[tokio::test]
    async fn download_rejects_unreachable_and_bad_hash() {
        let dir = tempfile::tempdir().unwrap();
        let client = http_client().unwrap();
        let dest = dir.path().join("x");
        // Port 9 on localhost is the discard service; nothing listens there.
        assert!(
            download_verified(&client, "http://127.0.0.1:9/x", &dest, HASH_A, 10)
                .await
                .is_err()
        );
        assert!(fetch_text(&client, "http://127.0.0.1:9/x").await.is_err());
        assert!(resolve_redirect("http://127.0.0.1:9/x").await.is_err());
        assert!(!dest.exists());
        assert!(
            download_verified(&client, "http://127.0.0.1:9/x", Path::new(""), HASH_A, 10)
                .await
                .is_err()
        );
    }

    fn leftovers(dir: &Path) -> Vec<String> {
        dir_names(dir)
            .into_iter()
            .filter(|n| n.starts_with(".clipy-"))
            .collect()
    }

    /// Sources whose every base points at `server`.
    fn local_sources(server: &TestServer) -> Sources {
        Sources {
            ytdlp_releases: server.url("/releases"),
            btbn_latest: server.url("/btbn"),
            martin_riedl: server.base.clone(),
        }
    }

    #[tokio::test]
    async fn installers_refuse_unsupported_platforms() {
        let dir = tempfile::tempdir().unwrap();
        let src = Sources::upstream();
        assert!(install_ffmpeg_into(&src, dir.path(), "plan9", "mips")
            .await
            .is_err());
        assert!(install_ytdlp_into(&src, dir.path(), "plan9", "mips")
            .await
            .is_err());
        assert!(dir_names(dir.path()).is_empty());
    }

    #[test]
    fn app_wrappers_find_tools_in_the_binaries_dir() {
        let app = mock_app_in_tempdir();
        let bin = paths::get_binaries_dir(app.handle()).unwrap();
        let ffmpeg = fake_tool(
            &bin,
            "ffmpeg",
            &Script {
                stdout: "ffmpeg version 9.9-test Copyright\n".into(),
                ..Default::default()
            },
        );
        let ytdlp = fake_tool(
            &bin,
            "yt-dlp",
            &Script {
                stdout: "2099.01.01\n".into(),
                ..Default::default()
            },
        );
        let ffprobe = fake_tool(&bin, "ffprobe", &Script::default());

        let status = check_binaries(app.handle()).unwrap();
        assert!(status.ffmpeg_installed && status.ytdlp_installed);
        assert_eq!(status.ffmpeg_version.as_deref(), Some("9.9-test"));
        assert_eq!(status.ytdlp_version.as_deref(), Some("2099.01.01"));
        assert_eq!(get_ffmpeg_path(app.handle()).unwrap(), ffmpeg);
        assert_eq!(get_ytdlp_path(app.handle()).unwrap(), ytdlp);
        assert_eq!(get_ffprobe_path(app.handle()).unwrap(), ffprobe);
    }

    #[tokio::test]
    async fn update_ytdlp_reports_output_and_failures() {
        let app = mock_app_in_tempdir();
        let bin = paths::get_binaries_dir(app.handle()).unwrap();
        fake_tool(
            &bin,
            "yt-dlp",
            &Script {
                stdout: "Updated yt-dlp to 2099.01.01\n".into(),
                ..Default::default()
            },
        );
        let out = update_ytdlp(app.handle()).await.unwrap();
        assert!(out.contains("Updated yt-dlp to 2099.01.01"), "{out}");

        fake_tool(
            &bin,
            "yt-dlp",
            &Script {
                stderr: "ERROR: unable to write\n".into(),
                exit_code: 1,
                ..Default::default()
            },
        );
        let err = update_ytdlp(app.handle()).await.unwrap_err();
        assert!(matches!(err, ClipyError::BinaryExecutionFailed(_)));
        assert!(err.to_string().contains("ERROR: unable to write"), "{err}");
    }

    #[tokio::test]
    async fn http_helpers_report_status_size_and_redirect_errors() {
        let server = TestServer::start().await;
        server
            .route("/text", Route::ok("hello"))
            .route("/boom", Route::status(500))
            .route("/big", Route::ok(vec![b'x'; 64]))
            .route("/big-unsized", Route::ok(vec![b'x'; 64]).without_length())
            .route("/moved", Route::redirect("/elsewhere"));
        let client = http_client().unwrap();

        assert_eq!(
            fetch_text(&client, &server.url("/text")).await.unwrap(),
            "hello"
        );
        let err = fetch_text(&client, &server.url("/boom")).await.unwrap_err();
        assert!(err.to_string().contains("HTTP 500"), "{err}");

        assert_eq!(
            resolve_redirect(&server.url("/moved")).await.unwrap(),
            "/elsewhere"
        );
        let err = resolve_redirect(&server.url("/text")).await.unwrap_err();
        assert!(err.to_string().contains("Expected a redirect"), "{err}");

        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("f");
        let digest = sha256_hex(&[b'x'; 64]);
        for path in ["/big", "/big-unsized"] {
            let err = download_verified(&client, &server.url(path), &dest, &digest, 63)
                .await
                .unwrap_err();
            assert!(
                err.to_string().contains("exceeds 63 bytes"),
                "{path}: {err}"
            );
        }
        let err = download_verified(&client, &server.url("/boom"), &dest, &digest, 99)
            .await
            .unwrap_err();
        assert!(err.to_string().contains("HTTP 500"), "{err}");
        assert!(dir_names(dir.path()).is_empty());

        download_verified(&client, &server.url("/big"), &dest, &digest, 64)
            .await
            .unwrap();
        assert_eq!(std::fs::read(&dest).unwrap(), vec![b'x'; 64]);
    }

    /// Serve yt-dlp release `tag` whose SUMS file lists `listed_hash` for the
    /// Linux x86_64 asset `body`.
    fn serve_ytdlp_release(server: &TestServer, tag: &str, body: &[u8], listed_hash: &str) {
        server
            .route(
                "/releases/latest",
                Route::redirect(&format!("/releases/tag/{tag}")),
            )
            .route(
                &format!("/releases/download/{tag}/SHA2-256SUMS"),
                Route::ok(format!(
                    "{listed_hash}  yt-dlp_linux\n{HASH_B}  yt-dlp.exe\n"
                )),
            )
            .route(
                &format!("/releases/download/{tag}/yt-dlp_linux"),
                Route::ok(body.to_vec()),
            );
    }

    #[tokio::test]
    async fn ytdlp_install_verifies_the_release_it_resolved() {
        let server = TestServer::start().await;
        let body = b"#!/bin/sh\necho fake yt-dlp\n";
        serve_ytdlp_release(&server, "2099.01.01", body, &sha256_hex(body));
        let dir = tempfile::tempdir().unwrap();

        let path = install_ytdlp_into(&local_sources(&server), dir.path(), "linux", "x86_64")
            .await
            .unwrap();
        assert_eq!(path, dir.path().join(exe_name("yt-dlp")));
        assert_eq!(std::fs::read(&path).unwrap(), body);
        assert!(leftovers(dir.path()).is_empty());
        assert!(server
            .hits()
            .contains(&"/releases/download/2099.01.01/yt-dlp_linux".to_string()));
    }

    #[tokio::test]
    async fn ytdlp_install_with_wrong_hash_installs_nothing() {
        let server = TestServer::start().await;
        serve_ytdlp_release(&server, "2099.01.01", b"tampered", HASH_A);
        let dir = tempfile::tempdir().unwrap();
        let err = install_ytdlp_into(&local_sources(&server), dir.path(), "linux", "x86_64")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("Checksum mismatch"), "{err}");
        assert!(dir_names(dir.path()).is_empty());

        // An asset missing from the listing is refused before downloading.
        let err = install_ytdlp_into(&local_sources(&server), dir.path(), "macos", "aarch64")
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("missing from SHA2-256SUMS"),
            "{err}"
        );
    }

    #[tokio::test]
    async fn ytdlp_install_rejects_unexpected_redirects() {
        let server = TestServer::start().await;
        server.route("/releases/latest", Route::redirect("/releases/tag/..%2f"));
        let dir = tempfile::tempdir().unwrap();
        let err = install_ytdlp_into(&local_sources(&server), dir.path(), "linux", "x86_64")
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("Unexpected yt-dlp redirect"),
            "{err}"
        );
        assert_eq!(server.hits(), ["/releases/latest"]);
    }

    #[tokio::test]
    async fn ffmpeg_install_from_btbn_zip_and_tar_xz() {
        let server = TestServer::start().await;
        let zip = build_zip(
            &[
                ("ffmpeg-x/bin/ffmpeg.exe", b"FFMPEG"),
                ("ffmpeg-x/bin/ffprobe.exe", b"FFPROBE"),
                ("ffmpeg-x/bin/ffplay.exe", b"no"),
            ],
            None,
        );
        let work = tempfile::tempdir().unwrap();
        let tar = std::fs::read(build_tar_xz(
            work.path(),
            &[
                ("ffmpeg-linux64/bin/ffmpeg", b"FF"),
                ("ffmpeg-linux64/bin/ffprobe", b"FP"),
            ],
            None,
        ))
        .unwrap();
        let win = "ffmpeg-master-latest-win64-gpl.zip";
        let linux = "ffmpeg-master-latest-linux64-gpl.tar.xz";
        server
            .route(
                "/btbn/checksums.sha256",
                Route::ok(format!(
                    "{}  {win}\n{}  {linux}\n",
                    sha256_hex(&zip),
                    sha256_hex(&tar)
                )),
            )
            .route(&format!("/btbn/{win}"), Route::ok(zip))
            .route(&format!("/btbn/{linux}"), Route::ok(tar));
        let src = local_sources(&server);
        let mut expect = vec![exe_name("ffmpeg"), exe_name("ffprobe")];
        expect.sort();

        let dir = tempfile::tempdir().unwrap();
        let path = install_ffmpeg_into(&src, dir.path(), "windows", "x86_64")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"FFMPEG");
        assert_eq!(dir_names(dir.path()), expect);

        let dir = tempfile::tempdir().unwrap();
        let path = install_ffmpeg_into(&src, dir.path(), "linux", "x86_64")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"FF");
        assert_eq!(dir_names(dir.path()), expect);

        // Not listed in checksums.sha256: nothing is downloaded.
        let err = install_ffmpeg_into(&src, dir.path(), "linux", "aarch64")
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("missing from checksums.sha256"),
            "{err}"
        );
    }

    #[tokio::test]
    async fn ffmpeg_install_fails_when_archive_lacks_ffmpeg() {
        let server = TestServer::start().await;
        let zip = build_zip(&[("bin/ffprobe.exe", b"FFPROBE")], None);
        let asset = "ffmpeg-master-latest-win64-gpl.zip";
        server
            .route(
                "/btbn/checksums.sha256",
                Route::ok(format!("{}  {asset}\n", sha256_hex(&zip))),
            )
            .route(&format!("/btbn/{asset}"), Route::ok(zip));
        let dir = tempfile::tempdir().unwrap();
        let err = install_ffmpeg_into(&local_sources(&server), dir.path(), "windows", "x86_64")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("FFmpeg binary not found"), "{err}");
        assert!(leftovers(dir.path()).is_empty());
    }

    #[tokio::test]
    async fn ffmpeg_install_from_martin_riedl_resolves_each_tool() {
        let server = TestServer::start().await;
        for (tool, data) in [("ffmpeg", &b"FFMPEG"[..]), ("ffprobe", &b"FFPROBE"[..])] {
            let zip = build_zip(&[(tool, data)], None);
            let versioned = format!("/download/macos/arm64/1_9.0/{tool}.zip");
            server
                .route(
                    &format!("/redirect/latest/macos/arm64/release/{tool}.zip"),
                    Route::redirect(&versioned),
                )
                .route(
                    &format!("{versioned}.sha256"),
                    Route::ok(format!("{}  {tool}.zip\n", sha256_hex(&zip))),
                )
                .route(&versioned, Route::ok(zip));
        }
        let dir = tempfile::tempdir().unwrap();
        let path = install_ffmpeg_into(&local_sources(&server), dir.path(), "macos", "aarch64")
            .await
            .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"FFMPEG");
        assert_eq!(
            std::fs::read(dir.path().join(exe_name("ffprobe"))).unwrap(),
            b"FFPROBE"
        );
    }

    #[tokio::test]
    async fn ffmpeg_install_refuses_foreign_redirects_and_missing_checksums() {
        let server = TestServer::start().await;
        server.route(
            "/redirect/latest/macos/amd64/release/ffmpeg.zip",
            Route::redirect("https://evil.example/ffmpeg.zip"),
        );
        let dir = tempfile::tempdir().unwrap();
        let src = local_sources(&server);
        let err = install_ffmpeg_into(&src, dir.path(), "macos", "x86_64")
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("Unexpected FFmpeg redirect"),
            "{err}"
        );

        server
            .route(
                "/redirect/latest/macos/amd64/release/ffmpeg.zip",
                Route::redirect("/download/v/ffmpeg.zip"),
            )
            .route("/download/v/ffmpeg.zip.sha256", Route::ok("nothing useful"));
        let err = install_ffmpeg_into(&src, dir.path(), "macos", "x86_64")
            .await
            .unwrap_err();
        assert!(
            err.to_string().contains("No checksum for ffmpeg.zip"),
            "{err}"
        );
        assert!(dir_names(dir.path()).is_empty());
    }

    // ---- network: real upstream downloads ----

    #[tokio::test]
    #[ignore = "network: downloads and verifies the real yt-dlp release"]
    async fn network_install_ytdlp_verified() {
        let dir = tempfile::tempdir().unwrap();
        let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
        let path = install_ytdlp_into(&Sources::upstream(), dir.path(), os, arch)
            .await
            .unwrap();
        let version = run_version(&path, "--version").and_then(|o| parse_ytdlp_version(&o));
        assert!(version.is_some() && leftovers(dir.path()).is_empty());
    }

    #[tokio::test]
    #[ignore = "network: downloads and verifies a real ffmpeg build (~100 MB)"]
    async fn network_install_ffmpeg_verified() {
        let dir = tempfile::tempdir().unwrap();
        let (os, arch) = (std::env::consts::OS, std::env::consts::ARCH);
        let path = install_ffmpeg_into(&Sources::upstream(), dir.path(), os, arch)
            .await
            .unwrap();
        let version = run_version(&path, "-version").and_then(|o| parse_ffmpeg_version(&o));
        assert!(version.is_some() && dir.path().join(exe_name("ffprobe")).exists());
    }

    #[tokio::test]
    #[ignore = "network: fetches the real yt-dlp SHA2-256SUMS"]
    async fn network_wrong_hash_is_rejected_and_nothing_installed() {
        let releases = Sources::upstream().ytdlp_releases;
        let location = resolve_redirect(&format!("{releases}/latest"))
            .await
            .unwrap();
        let url = format!(
            "{releases}/download/{}/SHA2-256SUMS",
            parse_release_tag(&location).unwrap()
        );
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("SUMS");
        let err = download_verified(&http_client().unwrap(), &url, &dest, HASH_A, 1 << 20).await;
        assert!(err.unwrap_err().to_string().contains("Checksum mismatch"));
        assert!(dir_names(dir.path()).is_empty());
    }
}
