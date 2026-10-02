//! Custom `clipy-media://` URI scheme for serving local media files to the
//! webview, with HTTP range support so `<video>`/`<audio>` can seek.
//!
//! Why not the built-in `asset:` protocol? On Windows, Tauri's asset protocol
//! runs a "URL safety check" that rejects local file URLs containing characters
//! common in download filenames (apostrophes, parentheses, unicode quotes),
//! producing `MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check`.
//! This protocol gives us full control: a tight path policy plus range
//! support. The asset protocol is disabled in `tauri.conf.json`.
//!
//! ## How the URL actually looks at runtime
//!
//! The frontend builds the `<video src>` with Tauri's `convertFileSrc(path,
//! "clipy-media")`. Per the Tauri docs the webview reaches a custom scheme via:
//!   - Windows (WebView2): `http://clipy-media.localhost/<percent-encoded-path>`
//!   - macOS / Linux:       `clipy-media://localhost/<percent-encoded-path>`
//!
//! In every case `request.uri().path()` yields the percent-encoded path
//! component, which we decode ourselves.
//!
//! ## What may be served
//!
//! A request is served only when the *canonical* target (after resolving `..`,
//! percent-encoded traversal and symlinks) is a regular audio/video/image file
//! AND one of the following holds:
//! 1. it lives under a fixed root: the OS Downloads, Videos and temp folders,
//!    the app data/cache dirs or the configured download folder;
//! 2. it was granted this session by a user-driven command (editor import via
//!    `get_video_metadata`, library import, project load, export output);
//! 3. it is a file registered in the library database.
//!
//! The bare home directory used to be a root; it was dropped because it exposed
//! every file under `~` to the webview. Files outside the roots that the user
//! actually works with reach the protocol through (2) or (3) instead.
//!
//! ## Memory bound
//!
//! Tauri's responder takes a fully-buffered body, so each response is capped at
//! [`MAX_CHUNK`] bytes. Larger files are answered with `206 Partial Content`
//! and the media element issues follow-up range requests.

use std::collections::HashSet;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};

use percent_encoding::{percent_decode_str, percent_encode, NON_ALPHANUMERIC};
use tauri::http::{Request, Response};
use tauri::{AppHandle, Manager, UriSchemeContext, UriSchemeResponder};
use tracing::{debug, warn};

use crate::utils::path_policy;

/// The scheme name registered in `lib.rs`.
pub const SCHEME: &str = "clipy-media";

/// Upper bound on a single response body. Open-ended or oversized ranges are
/// truncated to this many bytes; the client follows up with further ranges.
pub const MAX_CHUNK: u64 = 8 * 1024 * 1024;

/// Upper bound on the number of session grants kept in memory.
const MAX_GRANTS: usize = 10_000;

/// Paths granted for this session by user-driven commands, stored in
/// [`compare_key`] form.
static GRANTS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

/// Build a `clipy-media://localhost/<encoded>` URL for an absolute local path.
///
/// Every non-alphanumeric byte is percent-encoded so the URL passes the
/// webview's URL safety check regardless of the filename.
pub fn to_media_url(path: &str) -> String {
    let encoded = percent_encode(path.as_bytes(), NON_ALPHANUMERIC).to_string();
    format!("{}://localhost/{}", SCHEME, encoded)
}

/// Allow the protocol to serve `path` for the rest of this session.
///
/// Called by commands that act on a file the user explicitly picked. Paths
/// that do not canonicalize or are not audio/video/image files are ignored.
pub fn grant(path: &Path) {
    let Ok(canon) = path_policy::canonicalize(path) else {
        return;
    };
    if !path_policy::is_editor_source_extension(&canon) {
        return;
    }
    if let Ok(mut grants) = GRANTS.lock() {
        if grants.len() >= MAX_GRANTS {
            grants.clear();
        }
        grants.insert(compare_key(&canon));
    }
}

fn is_granted(canon: &Path) -> bool {
    GRANTS
        .lock()
        .map(|g| g.contains(&compare_key(canon)))
        .unwrap_or(false)
}

/// Fixed directories the protocol may serve from.
fn allowed_roots<R: tauri::Runtime>(app: &AppHandle<R>) -> Vec<PathBuf> {
    let p = app.path();
    let mut roots: Vec<PathBuf> = [
        p.download_dir(),
        p.video_dir(),
        p.app_data_dir(),
        p.app_cache_dir(),
        p.temp_dir(),
    ]
    .into_iter()
    .flatten()
    .collect();
    if let Ok(settings) = crate::services::config::get_settings() {
        if !settings.download.download_path.trim().is_empty() {
            roots.push(PathBuf::from(settings.download.download_path));
        }
    }
    roots
}

/// Comparable string form of an already-canonical path: forward slashes and,
/// on Windows, lowercase (case-insensitive filesystem).
fn compare_key(canon: &Path) -> String {
    let s = canon.to_string_lossy();
    if cfg!(windows) {
        s.replace('\\', "/").to_lowercase()
    } else {
        s.into_owned()
    }
}

/// Whether the canonical `target` lies within one of `roots` (roots are
/// canonicalized here; missing roots are skipped).
fn is_under_roots(target: &Path, roots: &[PathBuf]) -> bool {
    let target = compare_key(target);
    roots.iter().any(|r| {
        path_policy::canonicalize(r)
            .map(|root| {
                let root = compare_key(&root);
                let root = root.trim_end_matches('/');
                // Guard against `/a/bc` matching root `/a/b`.
                target == root
                    || target
                        .strip_prefix(root)
                        .is_some_and(|rest| rest.starts_with('/'))
            })
            .unwrap_or(false)
    })
}

fn is_library_file(canon: &Path) -> bool {
    let Ok(videos) = crate::services::database::get_library_videos() else {
        return false;
    };
    let key = compare_key(canon);
    videos.iter().any(|v| {
        path_policy::canonicalize(Path::new(&v.file_path))
            .map(|p| compare_key(&p) == key)
            .unwrap_or(false)
    })
}

/// Reasons a request is refused.
#[derive(Debug, PartialEq, Eq)]
enum Denied {
    /// Path is malformed or does not exist (404).
    NotFound,
    /// Path exists but policy forbids serving it (403).
    Forbidden,
}

/// Resolve and authorize a decoded request path. Returns the canonical path to
/// open; callers must open that path, not the raw one, so a symlink swapped in
/// after this check cannot redirect the read.
fn authorize(
    raw: &Path,
    roots: &[PathBuf],
    extra_allowed: impl Fn(&Path) -> bool,
) -> Result<PathBuf, Denied> {
    let raw_str = raw.to_string_lossy();
    let path = path_policy::validate_raw_path(&raw_str).map_err(|_| Denied::Forbidden)?;
    let canon = path_policy::canonicalize(&path).map_err(|_| Denied::NotFound)?;
    if !canon.is_file() {
        return Err(Denied::NotFound);
    }
    // SECURITY: only media and images, judged on the resolved target.
    if !path_policy::is_editor_source_extension(&canon) {
        return Err(Denied::Forbidden);
    }
    if is_under_roots(&canon, roots) || is_granted(&canon) || extra_allowed(&canon) {
        Ok(canon)
    } else {
        Err(Denied::Forbidden)
    }
}

fn guess_mime(path: &Path) -> &'static str {
    match path_policy::extension_lower(path).as_deref() {
        Some("mp4") | Some("m4v") | Some("mov") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("m4a") | Some("aac") => "audio/mp4",
        Some("mp3") => "audio/mpeg",
        Some("opus") | Some("ogg") | Some("oga") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("wav") => "audio/wav",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

/// Decode the URI path component into a local path.
///
/// On Windows the leading `/` before the drive letter (`/C:/...`) is dropped.
fn decode_request_path(uri_path: &str, windows: bool) -> PathBuf {
    let trimmed = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let mut decoded = percent_decode_str(trimmed).decode_utf8_lossy().to_string();
    if windows {
        decoded = decoded.trim_start_matches('/').to_string();
    } else if !decoded.starts_with('/') {
        decoded.insert(0, '/');
    }
    PathBuf::from(decoded)
}

/// A parsed single `Range` header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RangeSpec {
    /// `bytes=start-` or `bytes=start-end`.
    From(u64, Option<u64>),
    /// `bytes=-n`: the last `n` bytes.
    Suffix(u64),
}

/// Parse a `bytes=...` range header (only the first range is honored).
fn parse_range(h: &str) -> Option<RangeSpec> {
    let rest = h.trim().strip_prefix("bytes=")?;
    let first = rest.split(',').next()?.trim();
    let (start_s, end_s) = first.split_once('-')?;
    let (start_s, end_s) = (start_s.trim(), end_s.trim());
    if start_s.is_empty() {
        return Some(RangeSpec::Suffix(end_s.parse().ok()?));
    }
    let start = start_s.parse().ok()?;
    let end = if end_s.is_empty() {
        None
    } else {
        Some(end_s.parse().ok()?)
    };
    Some(RangeSpec::From(start, end))
}

/// What to send for a request.
#[derive(Debug, PartialEq, Eq)]
enum Plan {
    /// 200 with the whole (small) file.
    Full,
    /// 206 with bytes `start..=end`.
    Partial { start: u64, end: u64 },
    /// 416.
    Unsatisfiable,
}

/// Decide the byte range to serve, capping every body at `max_chunk` bytes.
///
/// Requests without a `Range` header for files larger than `max_chunk` get the
/// first chunk as a 206 so a multi-GB file is never buffered in memory.
fn plan_response(range: Option<RangeSpec>, total: u64, max_chunk: u64) -> Plan {
    let cap = |start: u64, end: u64| end.min(start.saturating_add(max_chunk - 1));
    match range {
        None if total <= max_chunk => Plan::Full,
        None => Plan::Partial {
            start: 0,
            end: max_chunk - 1,
        },
        Some(_) if total == 0 => Plan::Unsatisfiable,
        Some(RangeSpec::From(start, end)) => {
            let last = total - 1;
            let end = end.unwrap_or(last).min(last);
            if start > end {
                Plan::Unsatisfiable
            } else {
                Plan::Partial {
                    start,
                    end: cap(start, end),
                }
            }
        }
        Some(RangeSpec::Suffix(0)) => Plan::Unsatisfiable,
        Some(RangeSpec::Suffix(n)) => {
            let start = total.saturating_sub(n);
            Plan::Partial {
                start,
                end: cap(start, total - 1),
            }
        }
    }
}

fn empty(status: u16) -> Response<Vec<u8>> {
    Response::builder().status(status).body(Vec::new()).unwrap()
}

/// Read and package the planned bytes of an already-authorized file.
fn serve_file(canon: &Path, range_header: Option<&str>, max_chunk: u64) -> Response<Vec<u8>> {
    let mut file = match File::open(canon) {
        Ok(f) => f,
        Err(e) => {
            warn!("clipy-media: open failed {:?}: {}", canon, e);
            return empty(404);
        }
    };
    let total = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return empty(404),
    };
    let mime = guess_mime(canon);
    let range = range_header.and_then(parse_range);

    match plan_response(range, total, max_chunk) {
        Plan::Unsatisfiable => Response::builder()
            .status(416)
            .header("Content-Range", format!("bytes */{}", total))
            .body(Vec::new())
            .unwrap(),
        Plan::Full => {
            let mut buf = Vec::with_capacity(total as usize);
            if file.read_to_end(&mut buf).is_err() {
                return empty(404);
            }
            debug!("clipy-media: 200 {} bytes {:?}", total, canon);
            Response::builder()
                .status(200)
                .header("Content-Type", mime)
                .header("Accept-Ranges", "bytes")
                .header("Content-Length", buf.len().to_string())
                .body(buf)
                .unwrap()
        }
        Plan::Partial { start, end } => {
            let len = end - start + 1;
            let mut buf = vec![0u8; len as usize];
            if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
                return empty(404);
            }
            debug!("clipy-media: 206 {}-{}/{} {:?}", start, end, total, canon);
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
    }
}

/// Authorize and serve a request against an explicit root list.
fn respond(
    request: &Request<Vec<u8>>,
    roots: &[PathBuf],
    extra_allowed: impl Fn(&Path) -> bool,
) -> Response<Vec<u8>> {
    let raw = decode_request_path(request.uri().path(), cfg!(windows));
    let canon = match authorize(&raw, roots, extra_allowed) {
        Ok(c) => c,
        Err(Denied::NotFound) => return empty(404),
        Err(Denied::Forbidden) => {
            warn!("clipy-media: blocked {:?}", raw);
            return empty(403);
        }
    };
    let range = request.headers().get("range").and_then(|v| v.to_str().ok());
    serve_file(&canon, range, MAX_CHUNK)
}

/// Asynchronous protocol handler, registered via
/// `register_asynchronous_uri_scheme_protocol` so file IO stays off the
/// webview thread.
pub fn handle<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let app = ctx.app_handle().clone();
    std::thread::spawn(move || {
        let roots = allowed_roots(&app);
        let response = respond(&request, &roots, |canon| {
            let hit = is_library_file(canon);
            if hit {
                grant(canon);
            }
            hit
        });
        responder.respond(response);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn req(uri: &str, range: Option<&str>) -> Request<Vec<u8>> {
        let mut b = Request::builder().uri(uri);
        if let Some(r) = range {
            b = b.header("range", r);
        }
        b.body(Vec::new()).unwrap()
    }

    /// Build the URI the webview would request for `path` on this platform.
    fn uri_for(path: &Path) -> String {
        let s = path.to_string_lossy().replace('\\', "/");
        let enc = percent_encode(s.as_bytes(), NON_ALPHANUMERIC).to_string();
        format!("http://clipy-media.localhost/{enc}")
    }

    fn deny(_: &Path) -> bool {
        false
    }

    #[test]
    fn url_encodes_special_chars() {
        let p = "C:/Users/x/Videos/Clipy/Justin (Suga's Reaction).mp4";
        let url = to_media_url(p);
        assert!(url.starts_with("clipy-media://localhost/"));
        assert!(!url.contains(' '));
        assert!(!url.contains('('));
        assert!(!url.contains('\''));
        let after = url.strip_prefix("clipy-media://localhost/").unwrap();
        assert_eq!(percent_decode_str(after).decode_utf8_lossy(), p);
    }

    #[test]
    fn decodes_windows_and_unix_uris() {
        assert_eq!(
            decode_request_path("/C%3A%2FUsers%2Fx%2FMy%20Clip%20%28Suga's%29.mp4", true),
            PathBuf::from("C:/Users/x/My Clip (Suga's).mp4")
        );
        assert_eq!(
            decode_request_path("/%2FC%3A%2Fa.mp4", true),
            PathBuf::from("C:/a.mp4")
        );
        assert_eq!(
            decode_request_path("/%2Fhome%2Fme%2Fa.mp4", false),
            PathBuf::from("/home/me/a.mp4")
        );
        assert_eq!(
            decode_request_path("/home/me/a.mp4", false),
            PathBuf::from("/home/me/a.mp4")
        );
    }

    #[test]
    fn parse_range_variants() {
        assert_eq!(
            parse_range("bytes=0-499"),
            Some(RangeSpec::From(0, Some(499)))
        );
        assert_eq!(parse_range("bytes=500-"), Some(RangeSpec::From(500, None)));
        assert_eq!(
            parse_range(" bytes= 1 - 2 "),
            Some(RangeSpec::From(1, Some(2)))
        );
        assert_eq!(
            parse_range("bytes=0-499,600-999"),
            Some(RangeSpec::From(0, Some(499)))
        );
        assert_eq!(parse_range("bytes=-500"), Some(RangeSpec::Suffix(500)));
        assert_eq!(parse_range("bytes=abc"), None);
        assert_eq!(parse_range("bytes=1-x"), None);
        assert_eq!(parse_range("bytes=-"), None);
        assert_eq!(parse_range("0-1"), None);
        assert_eq!(parse_range("items=0-1"), None);
    }

    #[test]
    fn plan_caps_every_range() {
        let m = 100;
        assert_eq!(plan_response(None, 50, m), Plan::Full);
        assert_eq!(plan_response(None, 100, m), Plan::Full);
        assert_eq!(
            plan_response(None, 10_000, m),
            Plan::Partial { start: 0, end: 99 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(0, None)), 10_000, m),
            Plan::Partial { start: 0, end: 99 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(9_950, None)), 10_000, m),
            Plan::Partial {
                start: 9_950,
                end: 9_999
            }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(10, Some(20))), 10_000, m),
            Plan::Partial { start: 10, end: 20 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(0, Some(5_000))), 10_000, m),
            Plan::Partial { start: 0, end: 99 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(5, Some(1_000_000))), 50, m),
            Plan::Partial { start: 5, end: 49 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::Suffix(10)), 10_000, m),
            Plan::Partial {
                start: 9_990,
                end: 9_999
            }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::Suffix(5_000)), 10_000, m),
            Plan::Partial {
                start: 5_000,
                end: 5_099
            }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::Suffix(500)), 50, m),
            Plan::Partial { start: 0, end: 49 }
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(10_000, None)), 10_000, m),
            Plan::Unsatisfiable
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(20, Some(10))), 10_000, m),
            Plan::Unsatisfiable
        );
        assert_eq!(
            plan_response(Some(RangeSpec::Suffix(0)), 10, m),
            Plan::Unsatisfiable
        );
        assert_eq!(
            plan_response(Some(RangeSpec::From(0, None)), 0, m),
            Plan::Unsatisfiable
        );
        assert_eq!(plan_response(None, 0, m), Plan::Full);
    }

    #[test]
    fn mime_by_ext() {
        for (f, m) in [
            ("a.mp4", "video/mp4"),
            ("a.MOV", "video/mp4"),
            ("a.webm", "video/webm"),
            ("a.mkv", "video/x-matroska"),
            ("a.avi", "video/x-msvideo"),
            ("a.m4a", "audio/mp4"),
            ("a.mp3", "audio/mpeg"),
            ("a.opus", "audio/ogg"),
            ("a.flac", "audio/flac"),
            ("a.wav", "audio/wav"),
            ("a.jpg", "image/jpeg"),
            ("a.png", "image/png"),
            ("a.webp", "image/webp"),
            ("a.gif", "image/gif"),
            ("a.bmp", "image/bmp"),
            ("a.bin", "application/octet-stream"),
        ] {
            assert_eq!(guess_mime(Path::new(f)), m, "{f}");
        }
    }

    #[test]
    fn roots_require_separator_boundary() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("ab");
        let sibling = dir.path().join("abc");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&sibling).unwrap();
        let inside = root.join("x.mp4");
        let outside = sibling.join("x.mp4");
        fs::write(&inside, b"1").unwrap();
        fs::write(&outside, b"1").unwrap();
        let roots = vec![root.clone(), dir.path().join("missing-root")];
        let canon_in = path_policy::canonicalize(&inside).unwrap();
        let canon_out = path_policy::canonicalize(&outside).unwrap();
        assert!(is_under_roots(&canon_in, &roots));
        assert!(!is_under_roots(&canon_out, &roots));
    }

    #[test]
    fn authorize_rules() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("root");
        let outside = dir.path().join("outside");
        fs::create_dir_all(root.join("sub")).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(root.join("ok.mp4"), b"data").unwrap();
        fs::write(root.join("secret.txt"), b"data").unwrap();
        fs::write(outside.join("o.mp4"), b"data").unwrap();
        let roots = vec![root.clone()];

        assert!(authorize(&root.join("ok.mp4"), &roots, deny).is_ok());
        assert_eq!(
            authorize(&root.join("secret.txt"), &roots, deny),
            Err(Denied::Forbidden)
        );
        assert_eq!(
            authorize(&root.join("missing.mp4"), &roots, deny),
            Err(Denied::NotFound)
        );
        assert_eq!(
            authorize(&root.join("sub"), &roots, deny),
            Err(Denied::NotFound)
        );
        // Traversal out of the root is resolved before the root check.
        let escape = root
            .join("sub")
            .join("..")
            .join("..")
            .join("outside")
            .join("o.mp4");
        assert_eq!(authorize(&escape, &roots, deny), Err(Denied::Forbidden));
        // ...but the same file is allowed when the extra predicate vouches.
        assert!(authorize(&escape, &roots, |_| true).is_ok());
        // Relative and URL-like paths are refused outright.
        assert_eq!(
            authorize(Path::new("relative.mp4"), &roots, |_| true),
            Err(Denied::Forbidden)
        );
        assert_eq!(
            authorize(Path::new("file:x.mp4"), &roots, |_| true),
            Err(Denied::Forbidden)
        );
    }

    #[test]
    fn grants_allow_files_outside_roots() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("granted-clip.mkv");
        let txt = dir.path().join("granted.txt");
        fs::write(&f, b"x").unwrap();
        fs::write(&txt, b"x").unwrap();
        assert_eq!(authorize(&f, &[], deny), Err(Denied::Forbidden));
        grant(&f);
        grant(&txt);
        grant(&dir.path().join("never-existed.mp4"));
        assert!(authorize(&f, &[], deny).is_ok());
        assert_eq!(authorize(&txt, &[], deny), Err(Denied::Forbidden));
    }

    #[test]
    fn respond_serves_ranges_and_blocks_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("root");
        fs::create_dir_all(root.join("sub")).unwrap();
        let data: Vec<u8> = (0..=255u8).collect();
        fs::write(root.join("v.webm"), &data).unwrap();
        let outside = dir.path().join("outside.mp4");
        fs::write(&outside, b"nope").unwrap();
        let roots = vec![root.clone()];

        let r = respond(&req(&uri_for(&root.join("v.webm")), None), &roots, deny);
        assert_eq!(r.status(), 200);
        assert_eq!(r.body(), &data);
        assert_eq!(r.headers()["content-type"], "video/webm");

        let r = respond(
            &req(&uri_for(&root.join("v.webm")), Some("bytes=10-19")),
            &roots,
            deny,
        );
        assert_eq!(r.status(), 206);
        assert_eq!(r.body(), &data[10..20]);
        assert_eq!(r.headers()["content-range"], "bytes 10-19/256");

        let r = respond(
            &req(&uri_for(&root.join("v.webm")), Some("bytes=-6")),
            &roots,
            deny,
        );
        assert_eq!(r.body(), &data[250..]);

        let r = respond(
            &req(&uri_for(&root.join("v.webm")), Some("bytes=999-")),
            &roots,
            deny,
        );
        assert_eq!(r.status(), 416);
        assert_eq!(r.headers()["content-range"], "bytes */256");

        // Percent-encoded `..` traversal.
        let root_s = root.to_string_lossy().replace('\\', "/");
        let enc_root = percent_encode(root_s.as_bytes(), NON_ALPHANUMERIC).to_string();
        let trav = format!(
            "http://clipy-media.localhost/{enc_root}%2Fsub%2F%2e%2e%2F%2e%2e%2Foutside.mp4"
        );
        assert_eq!(respond(&req(&trav, None), &roots, deny).status(), 403);

        // Mixed separators still resolve to the same in-root file.
        let mixed = format!("{}\\sub/..\\v.webm", root.to_string_lossy());
        if cfg!(windows) {
            let r = respond(&req(&uri_for(Path::new(&mixed)), None), &roots, deny);
            assert_eq!(r.status(), 200);
        }

        // UNC host.
        let unc = format!(
            "http://clipy-media.localhost/{}",
            percent_encode(br"\\evil\share\a.mp4", NON_ALPHANUMERIC)
        );
        let status = respond(&req(&unc, None), &roots, deny).status();
        assert!(status == 403 || status == 404, "{status}");

        assert_eq!(
            respond(&req(&uri_for(&root.join("gone.mp4")), None), &roots, deny).status(),
            404
        );
    }

    #[test]
    fn serve_file_chunks_large_files() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("big.mp4");
        fs::write(&f, vec![7u8; 1000]).unwrap();
        let r = serve_file(&f, None, 100);
        assert_eq!(r.status(), 206);
        assert_eq!(r.body().len(), 100);
        assert_eq!(r.headers()["content-range"], "bytes 0-99/1000");
        let r = serve_file(&f, Some("bytes=950-"), 100);
        assert_eq!(r.body().len(), 50);
        assert_eq!(
            serve_file(&dir.path().join("x.mp4"), None, 100).status(),
            404
        );
    }
}
