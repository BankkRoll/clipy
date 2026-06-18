//! Custom `clipy-media://` URI scheme for serving local media files to the
//! webview.
//!
//! Why not the built-in `asset:` protocol? On Windows, Tauri's asset protocol
//! runs a "URL safety check" that rejects local file URLs containing characters
//! common in download filenames (apostrophes, parentheses, unicode quotes),
//! producing `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`.
//! This protocol gives us full control: a tight path allowlist plus HTTP range
//! support so the `<video>`/`<audio>` elements can seek.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager, UriSchemeContext};
use tracing::{debug, warn};

/// URL form: `clipy-media://localhost/<percent-encoded-absolute-path>`
pub const SCHEME: &str = "clipy-media";

/// Build a `clipy-media://` URL for an absolute local path (used by the frontend
/// via a command, or constructed in JS). Kept here so the encoding stays in one
/// place if the frontend ever needs the Rust-side helper.
pub fn to_media_url(path: &str) -> String {
    let encoded = urlencode_path(path);
    format!("{}://localhost/{}", SCHEME, encoded)
}

fn urlencode_path(path: &str) -> String {
    // Encode everything that isn't an unreserved URL char. We keep it simple and
    // dependency-free; the handler decodes with the same rules.
    let mut out = String::with_capacity(path.len() * 2);
    for b in path.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~' | '/' | '\\' | ':') {
            out.push(c);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", b));
        }
    }
    out
}

fn urldecode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Directories the protocol is allowed to serve from. Anything outside these is
/// rejected (defense-in-depth against path traversal).
fn allowed_roots<R: tauri::Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    let p = app.path();
    if let Ok(d) = p.download_dir() {
        roots.push(d);
    }
    if let Ok(d) = p.video_dir() {
        roots.push(d);
    }
    if let Ok(d) = p.home_dir() {
        roots.push(d);
    }
    if let Ok(d) = p.app_data_dir() {
        roots.push(d);
    }
    if let Ok(d) = p.temp_dir() {
        roots.push(d);
    }
    // The configured download path (may live outside the dirs above).
    if let Ok(settings) = crate::services::config::get_settings() {
        if !settings.download.download_path.trim().is_empty() {
            roots.push(PathBuf::from(settings.download.download_path));
        }
    }
    roots
}

fn is_allowed(path: &Path, roots: &[PathBuf]) -> bool {
    let Ok(canon) = path.canonicalize() else {
        return false;
    };
    let norm = |p: &Path| -> String {
        let s = p.to_string_lossy().to_string();
        if cfg!(windows) {
            s.to_lowercase()
        } else {
            s
        }
    };
    let target = norm(&canon);
    roots.iter().any(|r| {
        if let Ok(rc) = r.canonicalize() {
            target.starts_with(&norm(&rc))
        } else {
            false
        }
    })
}

fn guess_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") | Some("mov") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("m4a") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("opus") | Some("ogg") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
}

/// The protocol handler. Supports a single `Range: bytes=start-end` header so
/// the media element can seek without downloading the whole file.
pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let app = ctx.app_handle();

    let not_found = || Response::builder().status(404).body(Vec::new()).unwrap();
    let forbidden = || Response::builder().status(403).body(Vec::new()).unwrap();

    // Parse path out of clipy-media://localhost/<encoded path>
    let uri = request.uri().to_string();
    let after_scheme = match uri.split_once("://") {
        Some((_, rest)) => rest,
        None => return not_found(),
    };
    // strip the host ("localhost") up to the first '/'
    let path_part = match after_scheme.split_once('/') {
        Some((_, p)) => p,
        None => return not_found(),
    };
    // drop any query string
    let path_part = path_part.split('?').next().unwrap_or(path_part);
    let decoded = urldecode(path_part);

    // On Windows the leading slash before the drive letter must go.
    let mut file_path = decoded;
    if cfg!(windows) {
        file_path = file_path.trim_start_matches('/').to_string();
    }
    let path = PathBuf::from(&file_path);

    let roots = allowed_roots(app);
    if !is_allowed(&path, &roots) {
        warn!(
            "clipy-media: blocked path outside allowed roots: {:?}",
            path
        );
        return forbidden();
    }

    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            warn!("clipy-media: open failed {:?}: {}", path, e);
            return not_found();
        }
    };
    let total = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return not_found(),
    };
    let mime = guess_mime(&path);

    // Range support.
    let range = request
        .headers()
        .get("range")
        .and_then(|v| v.to_str().ok())
        .and_then(parse_range);

    match range {
        Some((start, end_opt)) => {
            let end = end_opt
                .unwrap_or(total.saturating_sub(1))
                .min(total.saturating_sub(1));
            if start > end {
                return Response::builder()
                    .status(416)
                    .header("Content-Range", format!("bytes */{}", total))
                    .body(Vec::new())
                    .unwrap();
            }
            let len = end - start + 1;
            let mut buf = vec![0u8; len as usize];
            if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
                return not_found();
            }
            debug!("clipy-media: 206 {}-{}/{} {:?}", start, end, total, path);
            Response::builder()
                .status(206)
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header(
                    "Content-Range",
                    format!("bytes {}-{}/{}", start, end, total),
                )
                .header("Content-Length", len.to_string())
                .body(buf)
                .unwrap()
        }
        None => {
            let mut buf = Vec::with_capacity(total as usize);
            if file.read_to_end(&mut buf).is_err() {
                return not_found();
            }
            debug!("clipy-media: 200 {} bytes {:?}", total, path);
            Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", total.to_string())
                .body(buf)
                .unwrap()
        }
    }
}

/// Parse a `bytes=start-end` range header (single range only).
fn parse_range(h: &str) -> Option<(u64, Option<u64>)> {
    let h = h.trim();
    let rest = h.strip_prefix("bytes=")?;
    let (start_s, end_s) = rest.split_once('-')?;
    let start: u64 = start_s.trim().parse().ok()?;
    let end = {
        let e = end_s.trim();
        if e.is_empty() {
            None
        } else {
            Some(e.parse().ok()?)
        }
    };
    Some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encode_decode() {
        let p = "C:/Users/x/Videos/Clipy/Justin (Suga's Reaction).mp4";
        let url = to_media_url(p);
        assert!(url.starts_with("clipy-media://localhost/"));
        let after = url.strip_prefix("clipy-media://localhost/").unwrap();
        assert_eq!(urldecode(after), p);
    }

    #[test]
    fn parse_range_variants() {
        assert_eq!(parse_range("bytes=0-499"), Some((0, Some(499))));
        assert_eq!(parse_range("bytes=500-"), Some((500, None)));
        assert_eq!(parse_range("bytes=abc"), None);
        assert_eq!(parse_range("0-1"), None);
    }

    #[test]
    fn mime_by_ext() {
        assert_eq!(guess_mime(Path::new("a.mp4")), "video/mp4");
        assert_eq!(guess_mime(Path::new("a.webm")), "video/webm");
        assert_eq!(guess_mime(Path::new("a.m4a")), "audio/mp4");
        assert_eq!(guess_mime(Path::new("a.png")), "image/png");
    }
}
