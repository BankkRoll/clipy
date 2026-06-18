//! Custom `clipy-media://` URI scheme for serving local media files to the
//! webview, with HTTP range support so `<video>`/`<audio>` can seek.
//!
//! Why not the built-in `asset:` protocol? On Windows, Tauri's asset protocol
//! runs a "URL safety check" that rejects local file URLs containing characters
//! common in download filenames (apostrophes, parentheses, unicode quotes),
//! producing `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`.
//! This protocol gives us full control: a tight path allowlist plus range
//! support.
//!
//! ## How the URL actually looks at runtime
//!
//! The frontend builds the `<video src>` with Tauri's `convertFileSrc(path,
//! "clipy-media")`. That does NOT yield `clipy-media://localhost/...`. Per the
//! Tauri docs the webview reaches a custom scheme via, by platform:
//!   - Windows (WebView2): `http://clipy-media.localhost/<percent-encoded-path>`
//!   - macOS / Linux:       `clipy-media://localhost/<percent-encoded-path>`
//! In every case `request.uri().path()` gives us the already-decoded-by-`http`
//! path component starting with `/`, percent-encoded by `convertFileSrc`. We
//! therefore parse with `request.uri().path()` + a standard percent decoder
//! (matching the official Tauri streaming example), NOT by hand-splitting the
//! raw URI string.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use percent_encoding::{percent_decode, percent_encode, NON_ALPHANUMERIC};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager, UriSchemeContext, UriSchemeResponder};
use tracing::{debug, warn};

/// The scheme name registered in `lib.rs`.
pub const SCHEME: &str = "clipy-media";

/// Build a `clipy-media://localhost/<encoded>` URL for an absolute local path.
///
/// This is the canonical form used on macOS/Linux and is also accepted by the
/// frontend `media_url` command. On Windows the webview rewrites this to
/// `http://clipy-media.localhost/<encoded>`, but the encoded path component is
/// identical, so the handler treats both the same way.
///
/// We percent-encode every non-alphanumeric byte (the most conservative,
/// always-safe set) so the resulting URL passes the webview's URL safety check
/// regardless of which characters the original filename contains.
pub fn to_media_url(path: &str) -> String {
    let encoded = percent_encode(path.as_bytes(), NON_ALPHANUMERIC).to_string();
    format!("{}://localhost/{}", SCHEME, encoded)
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

/// Normalize a path for prefix comparison: canonicalize (resolving symlinks /
/// `..`), strip the Windows `\\?\` extended-length prefix that `canonicalize`
/// adds, unify separators to `/`, and lowercase on Windows (case-insensitive FS).
fn normalize_for_compare(p: &Path) -> Option<String> {
    let canon = p.canonicalize().ok()?;
    let mut s = canon.to_string_lossy().to_string();
    if cfg!(windows) {
        // `canonicalize` yields e.g. `\\?\C:\Users\...`; drop the verbatim prefix
        // so both sides of the comparison are in the same shape.
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            s = stripped.to_string();
        }
        s = s.replace('\\', "/").to_lowercase();
    }
    Some(s)
}

fn is_allowed(path: &Path, roots: &[PathBuf]) -> bool {
    let Some(target) = normalize_for_compare(path) else {
        return false;
    };
    roots.iter().any(|r| {
        normalize_for_compare(r)
            .map(|root| {
                // Guard against `/a/bc` matching root `/a/b`: require the match
                // to be the whole root or end on a separator boundary.
                target == root
                    || target.strip_prefix(&root).is_some_and(|rest| rest.starts_with('/'))
            })
            .unwrap_or(false)
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

/// Extract the absolute local path from a request URI.
///
/// `request.uri().path()` returns the path component already separated from the
/// scheme/host (works for both `http://clipy-media.localhost/...` on Windows and
/// `clipy-media://localhost/...` elsewhere), still percent-encoded by
/// `convertFileSrc`. We strip the leading `/` and percent-decode, then on
/// Windows drop the extra leading slash that precedes the drive letter
/// (`/C:/...` -> `C:/...`).
fn path_from_request(request: &Request<Vec<u8>>) -> PathBuf {
    let raw = request.uri().path();
    let trimmed = raw.strip_prefix('/').unwrap_or(raw);
    let mut decoded = percent_decode(trimmed.as_bytes())
        .decode_utf8_lossy()
        .to_string();
    if cfg!(windows) {
        decoded = decoded.trim_start_matches('/').to_string();
    }
    PathBuf::from(decoded)
}

/// Synchronous core: turn a request into a response. Pulled out so it can run on
/// a worker thread under the asynchronous responder (range reads do blocking IO).
fn build_response<R: tauri::Runtime>(
    app: &AppHandle<R>,
    request: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let not_found = || Response::builder().status(404).body(Vec::new()).unwrap();
    let forbidden = || Response::builder().status(403).body(Vec::new()).unwrap();

    let path = path_from_request(request);

    let roots = allowed_roots(app);
    if !is_allowed(&path, &roots) {
        warn!("clipy-media: blocked path outside allowed roots: {:?}", path);
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
            if start > end || start >= total {
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
                .header("Content-Range", format!("bytes {}-{}/{}", start, end, total))
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

/// Asynchronous protocol handler. Registered via
/// `register_asynchronous_uri_scheme_protocol` so large reads / seeks don't
/// block the webview thread (this is the pattern the official Tauri streaming
/// example uses for media).
pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    std::thread::spawn(move || {
        let response = build_response(&app, &request);
        responder.respond(response);
    });
}

/// Parse a `bytes=start-end` range header (single range only).
fn parse_range(h: &str) -> Option<(u64, Option<u64>)> {
    let h = h.trim();
    let rest = h.strip_prefix("bytes=")?;
    // Only the first range is honored; multi-range is uncommon for <video>.
    let first = rest.split(',').next()?.trim();
    let (start_s, end_s) = first.split_once('-')?;
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
    fn url_encodes_special_chars() {
        let p = "C:/Users/x/Videos/Clipy/Justin (Suga's Reaction).mp4";
        let url = to_media_url(p);
        assert!(url.starts_with("clipy-media://localhost/"));
        // Spaces, parens and apostrophes must be encoded so the webview's URL
        // safety check accepts the URL.
        assert!(!url.contains(' '));
        assert!(!url.contains('('));
        assert!(!url.contains('\''));
        // And it must round-trip back to the original path.
        let after = url.strip_prefix("clipy-media://localhost/").unwrap();
        let decoded = percent_decode(after.as_bytes()).decode_utf8_lossy().to_string();
        assert_eq!(decoded, p);
    }

    #[test]
    fn decodes_windows_localhost_uri() {
        // Mirrors what Tauri's convertFileSrc emits on Windows after we
        // forward-slash-normalize: http://clipy-media.localhost/<encodeURIComponent>.
        // encodeURIComponent turns "C:/Users/x/My Clip (Suga's).mp4" into the
        // string below (':' -> %3A, '/' -> %2F, ' ' -> %20, '(' -> %28, etc.).
        let req = Request::builder()
            .uri("http://clipy-media.localhost/C%3A%2FUsers%2Fx%2FMy%20Clip%20%28Suga's%29.mp4")
            .body(Vec::new())
            .unwrap();
        let p = path_from_request(&req);
        assert_eq!(
            p.to_string_lossy().replace('\\', "/"),
            "C:/Users/x/My Clip (Suga's).mp4"
        );
    }

    #[test]
    fn parse_range_variants() {
        assert_eq!(parse_range("bytes=0-499"), Some((0, Some(499))));
        assert_eq!(parse_range("bytes=500-"), Some((500, None)));
        assert_eq!(parse_range("bytes=0-499,600-999"), Some((0, Some(499))));
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
