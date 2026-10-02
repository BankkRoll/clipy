//! Path policy for filesystem paths that arrive over IPC.
//!
//! Every command that takes a raw path from the webview funnels it through one
//! of the `ensure_*` functions here before touching the filesystem or handing
//! the path to ffmpeg/yt-dlp/the OS shell.
//!
//! Responsibilities:
//! - Lexical rejection of things that are not plain local paths: URLs and
//!   protocol specifiers (`http:`, `concat:`, `file:`), option-looking strings
//!   (leading `-`), relative paths, embedded NULs, and on Windows UNC/device
//!   paths and reserved device names (`CON`, `NUL`, `COM1`, ...).
//! - Canonicalization (resolving `..` and symlinks) so checks apply to the
//!   object that is actually opened.
//! - Type restriction by extension: media inputs must be audio/video/image
//!   files, project files must be `.clipy`/`.json`, exports must be media.
//!
//! ## Why save targets are not restricted to fixed roots
//!
//! The user picks save locations through native dialogs and may legitimately
//! choose any folder (another drive, an external disk, the desktop). Root
//! confinement would break that, so output paths are instead restricted by
//! *type*: the extension must match what the command produces, the target may
//! not be a directory or a symlink, and URLs/devices are refused. A compromised
//! webview can therefore at worst write a media/project/JSON file somewhere the
//! user can already write, never an executable, script, or shortcut.
//!
//! ## Why UNC paths are refused (Windows)
//!
//! Merely opening `\\host\share\x.mp4` makes Windows authenticate to `host`
//! over SMB, leaking the user's NTLM hash to whoever controls it. Mapped drive
//! letters still work, so users with network storage keep a supported path.

use crate::error::{ClipyError, Result};
use std::path::{Component, Path, PathBuf};

/// Video container extensions accepted as editor/library inputs.
pub const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "mkv", "webm", "avi", "flv", "wmv", "mpg", "mpeg", "ts", "m2ts", "mts",
    "3gp", "ogv",
];

/// Audio extensions accepted as editor/library inputs.
pub const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "opus", "ogg", "oga", "flac", "wav", "wma", "weba",
];

/// Still-image extensions (thumbnails, image clips).
pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

/// Extensions a saved/loaded editor project may use.
pub const PROJECT_EXTENSIONS: &[&str] = &["clipy", "json"];

/// Extension for JSON exports (library export).
pub const JSON_EXTENSIONS: &[&str] = &["json"];

/// Extensions an editor export or transcode may write.
pub const EXPORT_EXTENSIONS: &[&str] = &[
    "mp4", "m4v", "mov", "mkv", "webm", "avi", "gif", "mp3", "m4a", "wav", "flac", "opus", "ogg",
];

/// Lowercased extension of `path`, if it has one.
pub fn extension_lower(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
}

/// Whether `path` ends in one of `allowed` (case-insensitive).
pub fn has_extension(path: &Path, allowed: &[&str]) -> bool {
    extension_lower(path).is_some_and(|ext| allowed.contains(&ext.as_str()))
}

/// Whether `path` is an audio or video file by extension.
pub fn is_media_extension(path: &Path) -> bool {
    has_extension(path, VIDEO_EXTENSIONS) || has_extension(path, AUDIO_EXTENSIONS)
}

/// Whether `path` is a still image by extension.
pub fn is_image_extension(path: &Path) -> bool {
    has_extension(path, IMAGE_EXTENSIONS)
}

/// Whether `path` may be used as an editor source (audio, video or image).
pub fn is_editor_source_extension(path: &Path) -> bool {
    is_media_extension(path) || is_image_extension(path)
}

/// Whether `s` starts with a URL scheme / ffmpeg protocol prefix such as
/// `http:`, `file:`, `concat:` or `subfile,,start,...:`.
///
/// Single-letter prefixes are treated as Windows drive letters (`C:`), not
/// schemes.
///
/// # Examples
///
/// ```
/// use clipy_lib::utils::path_policy::looks_like_url;
/// assert!(looks_like_url("https://example.com/a.mp4"));
/// assert!(looks_like_url("concat:a.mp4|b.mp4"));
/// assert!(!looks_like_url("C:\\Videos\\a.mp4"));
/// assert!(!looks_like_url("/home/me/a:b.mp4"));
/// ```
pub fn looks_like_url(s: &str) -> bool {
    let Some(colon) = s.find(':') else {
        return false;
    };
    let scheme = &s[..colon];
    if scheme.len() < 2 {
        return false;
    }
    let mut chars = scheme.chars();
    let first_is_alpha = chars.next().is_some_and(|c| c.is_ascii_alphabetic());
    // ffmpeg's `subfile,,start,0,end,0,,:` uses commas in its prefix.
    first_is_alpha
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.' | ','))
}

/// Whether `s` is a UNC (`\\host\share`), device (`\\.\`) or verbatim (`\\?\`)
/// path in either slash style.
pub fn is_unc_or_device_path(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() >= 2 && matches!(b[0], b'\\' | b'/') && matches!(b[1], b'\\' | b'/')
}

/// Whether a single path component is a reserved Windows device name
/// (`CON`, `nul.txt`, `COM1.mp4`, ...). Windows ignores the extension and
/// trailing dots/spaces when matching these.
pub fn is_windows_device_name(component: &str) -> bool {
    let stem = component
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();
    match stem.as_str() {
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$" | "CLOCK$" => true,
        s if (s.starts_with("COM") || s.starts_with("LPT")) && s.len() == 4 => {
            s.as_bytes()[3].is_ascii_digit()
        }
        _ => false,
    }
}

/// Lexically validate a raw path string from IPC without touching the disk.
///
/// Rejects empty strings, embedded NULs, leading `-`, URLs/protocols, relative
/// paths, and (on Windows) UNC/device paths and reserved device names.
pub fn validate_raw_path(raw: &str) -> Result<PathBuf> {
    validate_raw_path_for(raw, cfg!(windows))
}

/// [`validate_raw_path`] with the Windows-specific rules toggled explicitly so
/// both rule sets are testable on any host.
fn validate_raw_path_for(raw: &str, windows_rules: bool) -> Result<PathBuf> {
    let reject = |why: &str| Err(ClipyError::InvalidPath(format!("{why}: {raw:?}")));
    if raw.trim().is_empty() {
        return reject("empty path");
    }
    if raw.contains('\0') {
        return reject("path contains NUL");
    }
    if raw.starts_with('-') {
        return reject("path looks like a command-line option");
    }
    if looks_like_url(raw) {
        return reject("URLs and protocol paths are not allowed");
    }
    if windows_rules {
        if is_unc_or_device_path(raw) {
            return reject("UNC and device paths are not allowed");
        }
        if raw
            .split(['/', '\\'])
            .any(|c| !c.is_empty() && is_windows_device_name(c))
        {
            return reject("reserved device name in path");
        }
    }
    let path = PathBuf::from(raw);
    if !is_absolute_for(raw, windows_rules) {
        return reject("path must be absolute");
    }
    Ok(path)
}

/// Absolute-path test that does not depend on the host OS.
fn is_absolute_for(raw: &str, windows_rules: bool) -> bool {
    if windows_rules {
        let b = raw.as_bytes();
        b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && matches!(b[2], b'\\' | b'/')
    } else {
        raw.starts_with('/')
    }
}

/// Strip the `\\?\` verbatim prefix `canonicalize` adds on Windows when the
/// remainder is a plain drive path, so downstream tools (ffmpeg, Explorer)
/// receive an ordinary path. `\\?\UNC\...` is left untouched so callers can
/// reject it.
pub fn strip_verbatim_prefix(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        let b = rest.as_bytes();
        if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
            return PathBuf::from(rest);
        }
    }
    p
}

/// Canonicalize an existing path (resolving `..` and symlinks) and refuse
/// results that land on a UNC share.
pub fn canonicalize(path: &Path) -> Result<PathBuf> {
    let canon = std::fs::canonicalize(path)
        .map_err(|e| ClipyError::InvalidPath(format!("{}: {}", path.display(), e)))?;
    let canon = strip_verbatim_prefix(canon);
    if cfg!(windows) && is_unc_or_device_path(&canon.to_string_lossy()) {
        return Err(ClipyError::InvalidPath(format!(
            "{} resolves to a network or device path",
            path.display()
        )));
    }
    Ok(canon)
}

/// Require `raw` to be an existing local regular file whose *resolved* name has
/// one of `allowed` extensions. Returns the canonical path, which callers
/// should use for the actual open to avoid re-resolving the raw string.
pub fn ensure_local_file(raw: &str, allowed: &[&str]) -> Result<PathBuf> {
    ensure_file_where(raw, |p| has_extension(p, allowed))
}

/// [`ensure_local_file`] for audio/video files.
pub fn ensure_media_file(raw: &str) -> Result<PathBuf> {
    ensure_file_where(raw, is_media_extension)
}

/// [`ensure_local_file`] for editor sources (audio, video or image).
pub fn ensure_editor_source(raw: &str) -> Result<PathBuf> {
    ensure_file_where(raw, is_editor_source_extension)
}

/// Shared body of the `ensure_*_file` helpers: validate, canonicalize, require
/// a regular file, then apply the type predicate.
fn ensure_file_where(raw: &str, type_ok: impl Fn(&Path) -> bool) -> Result<PathBuf> {
    let canon = ensure_existing_file(raw)?;
    // SECURITY: check the extension of the canonical path so a symlink named
    // `x.mp4` pointing at an executable or secret is rejected.
    if !type_ok(&canon) {
        return Err(ClipyError::InvalidPath(format!(
            "unsupported file type: {raw}"
        )));
    }
    Ok(canon)
}

/// Validate, canonicalize and require a regular file, without a type check.
fn ensure_existing_file(raw: &str) -> Result<PathBuf> {
    let canon = canonicalize(&validate_raw_path(raw)?)?;
    if !canon.is_file() {
        return Err(ClipyError::InvalidPath(format!("not a regular file: {raw}")));
    }
    Ok(canon)
}

/// Require `raw` to be an existing local directory. Returns the canonical path.
pub fn ensure_local_dir(raw: &str) -> Result<PathBuf> {
    let canon = canonicalize(&validate_raw_path(raw)?)?;
    if !canon.is_dir() {
        return Err(ClipyError::InvalidPath(format!("not a directory: {raw}")));
    }
    Ok(canon)
}

/// Validate a path the app is about to *write*.
///
/// The parent directory must exist (it is canonicalized, which neutralizes
/// `..` and symlinked parents), the file name must carry one of `allowed`
/// extensions, and an existing target must be a regular file — never a
/// directory or a symlink that would redirect the write elsewhere.
pub fn ensure_output_path(raw: &str, allowed: &[&str]) -> Result<PathBuf> {
    let path = validate_raw_path(raw)?;
    let file_name = match path.components().next_back() {
        Some(Component::Normal(name)) => name.to_owned(),
        _ => {
            return Err(ClipyError::InvalidPath(format!(
                "output path has no file name: {raw}"
            )))
        }
    };
    if !has_extension(Path::new(&file_name), allowed) {
        return Err(ClipyError::InvalidPath(format!(
            "output must be one of [{}]: {raw}",
            allowed.join(", ")
        )));
    }
    let parent = path
        .parent()
        .ok_or_else(|| ClipyError::InvalidPath(format!("output path has no parent: {raw}")))?;
    let parent = canonicalize(parent)?;
    if !parent.is_dir() {
        return Err(ClipyError::InvalidPath(format!(
            "output directory does not exist: {}",
            parent.display()
        )));
    }
    let target = parent.join(&file_name);
    if let Ok(meta) = std::fs::symlink_metadata(&target) {
        if meta.file_type().is_symlink() {
            return Err(ClipyError::InvalidPath(format!(
                "refusing to write through a symlink: {}",
                target.display()
            )));
        }
        if !meta.is_file() {
            return Err(ClipyError::InvalidPath(format!(
                "output exists and is not a regular file: {}",
                target.display()
            )));
        }
    }
    Ok(target)
}

/// Validate a library file the user asked to delete from disk.
///
/// Only regular audio/video files qualify; directories and symlinks are
/// refused so a tampered library row cannot be used to delete arbitrary data.
pub fn ensure_deletable_media_file(raw: &str) -> Result<PathBuf> {
    let path = validate_raw_path(raw)?;
    let meta = std::fs::symlink_metadata(&path)
        .map_err(|e| ClipyError::InvalidPath(format!("{}: {}", path.display(), e)))?;
    if meta.file_type().is_symlink() {
        return Err(ClipyError::InvalidPath(format!(
            "refusing to delete a symlink: {}",
            path.display()
        )));
    }
    if !meta.is_file() {
        return Err(ClipyError::InvalidPath(format!(
            "refusing to delete a non-file: {}",
            path.display()
        )));
    }
    if !is_media_extension(&path) {
        return Err(ClipyError::InvalidPath(format!(
            "refusing to delete a non-media file: {}",
            path.display()
        )));
    }
    canonicalize(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn s(p: &Path) -> String {
        p.to_string_lossy().into_owned()
    }

    /// Create a symlink, or return false where the host forbids it (Windows
    /// without Developer Mode).
    fn try_symlink(target: &Path, link: &Path) -> bool {
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(target, link).is_ok()
        }
        #[cfg(windows)]
        {
            if target.is_dir() {
                std::os::windows::fs::symlink_dir(target, link).is_ok()
            } else {
                std::os::windows::fs::symlink_file(target, link).is_ok()
            }
        }
    }

    #[test]
    fn extension_helpers() {
        assert!(is_media_extension(Path::new("a.MP4")));
        assert!(is_media_extension(Path::new("a.flac")));
        assert!(!is_media_extension(Path::new("a.png")));
        assert!(is_image_extension(Path::new("a.JPEG")));
        assert!(is_editor_source_extension(Path::new("a.png")));
        assert!(is_editor_source_extension(Path::new("a.wav")));
        assert!(!is_editor_source_extension(Path::new("a.exe")));
        assert!(!is_editor_source_extension(Path::new("noext")));
        assert_eq!(
            extension_lower(Path::new("x.Clipy")).as_deref(),
            Some("clipy")
        );
        assert!(has_extension(Path::new("p.CLIPY"), PROJECT_EXTENSIONS));
        assert!(!has_extension(Path::new("p.lnk"), PROJECT_EXTENSIONS));
    }

    #[test]
    fn export_extensions_are_all_media_or_gif() {
        for ext in EXPORT_EXTENSIONS {
            let p = PathBuf::from(format!("x.{ext}"));
            assert!(is_editor_source_extension(&p), "{ext}");
        }
    }

    #[test]
    fn url_detection() {
        for url in [
            "http://x/a.mp4",
            "https://x/a.mp4",
            "file:///etc/passwd",
            "file:C:/x.mp4",
            "concat:a.mp4|b.mp4",
            "subfile,,start,0,end,0,,:/etc/passwd",
            "data:text/plain,hi",
            "smb://host/share",
            "tcp://1.2.3.4:5",
        ] {
            assert!(looks_like_url(url), "{url}");
        }
        for path in ["C:\\a.mp4", "c:/a.mp4", "/home/a:b.mp4", "relative", "", ":x"] {
            assert!(!looks_like_url(path), "{path}");
        }
    }

    #[test]
    fn unc_and_device_detection() {
        for p in [
            r"\\server\share\a.mp4",
            "//server/share/a.mp4",
            r"\\?\C:\a.mp4",
            r"\\.\PhysicalDrive0",
            r"/\server\x",
        ] {
            assert!(is_unc_or_device_path(p), "{p}");
        }
        assert!(!is_unc_or_device_path(r"C:\a.mp4"));
        assert!(!is_unc_or_device_path("/a"));
        assert!(!is_unc_or_device_path("\\"));
    }

    #[test]
    fn windows_device_names() {
        for n in [
            "CON", "con", "nul.txt", "COM1", "com9.mp4", "LPT3", "AUX", "PRN.", "NUL ", "CONIN$",
            "conout$", "CLOCK$",
        ] {
            assert!(is_windows_device_name(n), "{n}");
        }
        for n in [
            "CONSOLE",
            "COM",
            "COM10",
            "LPTX",
            "video.mp4",
            "nullable.mp4",
            "",
        ] {
            assert!(!is_windows_device_name(n), "{n}");
        }
    }

    #[test]
    fn raw_path_rules_unix() {
        assert!(validate_raw_path_for("/home/a/v.mp4", false).is_ok());
        for bad in [
            "",
            "   ",
            "rel/v.mp4",
            "-version",
            "--exec=x",
            "http://evil/x.mp4",
            "concat:/a|/b",
            "/a\0b",
        ] {
            assert!(validate_raw_path_for(bad, false).is_err(), "{bad:?}");
        }
        // Device names are only special on Windows.
        assert!(validate_raw_path_for("/tmp/con.mp4", false).is_ok());
    }

    #[test]
    fn raw_path_rules_windows() {
        assert!(validate_raw_path_for(r"C:\Users\a\v.mp4", true).is_ok());
        assert!(validate_raw_path_for("d:/v.mp4", true).is_ok());
        for bad in [
            r"\\attacker\share\v.mp4",
            "//attacker/share/v.mp4",
            r"\\.\pipe\x",
            r"\\?\UNC\host\share\x.mp4",
            r"C:\dir\NUL.mp4",
            r"C:\COM1\x.mp4",
            r"C:relative.mp4",
            r"\rooted-no-drive.mp4",
            "/unix/style.mp4",
            "-i",
            "file:C:/x.mp4",
        ] {
            assert!(validate_raw_path_for(bad, true).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn verbatim_prefix_is_stripped_only_for_drive_paths() {
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from(r"\\?\C:\a\b.mp4")),
            PathBuf::from(r"C:\a\b.mp4")
        );
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from(r"\\?\UNC\h\s\x")),
            PathBuf::from(r"\\?\UNC\h\s\x")
        );
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from("/plain/path")),
            PathBuf::from("/plain/path")
        );
    }

    #[test]
    fn ensure_local_file_accepts_media_and_resolves_dotdot() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let f = dir.path().join("clip.mp4");
        fs::write(&f, b"x").unwrap();

        let via_dotdot = sub.join("..").join("clip.mp4");
        let got = ensure_media_file(&s(&via_dotdot)).unwrap();
        assert_eq!(got, canonicalize(&f).unwrap());
        assert!(!s(&got).contains(".."));

        assert!(ensure_editor_source(&s(&f)).is_ok());
        assert!(ensure_local_file(&s(&f), VIDEO_EXTENSIONS).is_ok());
        assert!(ensure_local_file(&s(&f), IMAGE_EXTENSIONS).is_err());
    }

    #[test]
    fn ensure_local_file_rejects_wrong_type_dirs_and_missing() {
        let dir = tempfile::tempdir().unwrap();
        let exe = dir.path().join("run.exe");
        fs::write(&exe, b"MZ").unwrap();
        let img = dir.path().join("p.png");
        fs::write(&img, b"x").unwrap();
        let folder = dir.path().join("folder.mp4");
        fs::create_dir(&folder).unwrap();

        assert!(ensure_media_file(&s(&exe)).is_err());
        assert!(ensure_editor_source(&s(&exe)).is_err());
        assert!(ensure_media_file(&s(&img)).is_err());
        assert!(ensure_editor_source(&s(&img)).is_ok());
        assert!(ensure_media_file(&s(&folder)).is_err());
        assert!(ensure_media_file(&s(&dir.path().join("missing.mp4"))).is_err());
        assert!(ensure_media_file("relative.mp4").is_err());
    }

    #[test]
    fn symlink_named_like_media_to_non_media_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let secret = dir.path().join("id_rsa");
        fs::write(&secret, b"KEY").unwrap();
        let link = dir.path().join("innocent.mp4");
        if !try_symlink(&secret, &link) {
            return;
        }
        assert!(ensure_media_file(&s(&link)).is_err());
        assert!(ensure_deletable_media_file(&s(&link)).is_err());
        assert!(ensure_output_path(&s(&link), VIDEO_EXTENSIONS).is_err());
    }

    #[test]
    fn ensure_local_dir_rules() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("a.mp4");
        fs::write(&f, b"x").unwrap();
        assert_eq!(
            ensure_local_dir(&s(dir.path())).unwrap(),
            canonicalize(dir.path()).unwrap()
        );
        assert!(ensure_local_dir(&s(&f)).is_err());
        assert!(ensure_local_dir(&s(&dir.path().join("nope"))).is_err());
        assert!(ensure_local_dir("-n").is_err());
    }

    #[test]
    fn ensure_output_path_rules() {
        let dir = tempfile::tempdir().unwrap();
        let parent = canonicalize(dir.path()).unwrap();

        let ok = ensure_output_path(&s(&dir.path().join("out.mp4")), EXPORT_EXTENSIONS).unwrap();
        assert_eq!(ok, parent.join("out.mp4"));

        // `..` in the raw path is resolved through the canonical parent.
        fs::create_dir(dir.path().join("sub")).unwrap();
        let dotted = dir.path().join("sub").join("..").join("p.clipy");
        assert_eq!(
            ensure_output_path(&s(&dotted), PROJECT_EXTENSIONS).unwrap(),
            parent.join("p.clipy")
        );

        // Existing regular file may be overwritten.
        fs::write(dir.path().join("exists.json"), b"{}").unwrap();
        assert!(ensure_output_path(&s(&dir.path().join("exists.json")), JSON_EXTENSIONS).is_ok());

        for bad in [
            dir.path().join("evil.exe"),
            dir.path().join("evil.bat"),
            dir.path().join("evil.lnk"),
            dir.path().join("noext"),
            dir.path().join("missing-dir").join("a.mp4"),
        ] {
            assert!(
                ensure_output_path(&s(&bad), EXPORT_EXTENSIONS).is_err(),
                "{bad:?}"
            );
        }
        fs::create_dir(dir.path().join("isdir.mp4")).unwrap();
        assert!(ensure_output_path(&s(&dir.path().join("isdir.mp4")), EXPORT_EXTENSIONS).is_err());
        assert!(ensure_output_path("https://x/out.mp4", EXPORT_EXTENSIONS).is_err());
        assert!(ensure_output_path("-y.mp4", EXPORT_EXTENSIONS).is_err());
        let root = if cfg!(windows) { "C:\\" } else { "/" };
        assert!(ensure_output_path(root, EXPORT_EXTENSIONS).is_err());
        let trailing_dotdot = format!("{}{}..", s(dir.path()), std::path::MAIN_SEPARATOR);
        assert!(ensure_output_path(&trailing_dotdot, EXPORT_EXTENSIONS).is_err());
    }

    #[test]
    fn ensure_output_path_refuses_symlink_target() {
        let dir = tempfile::tempdir().unwrap();
        let real = dir.path().join("real.mp4");
        fs::write(&real, b"x").unwrap();
        let link = dir.path().join("link.mp4");
        if !try_symlink(&real, &link) {
            return;
        }
        assert!(ensure_output_path(&s(&link), VIDEO_EXTENSIONS).is_err());
    }

    #[test]
    fn deletable_media_rules() {
        let dir = tempfile::tempdir().unwrap();
        let v = dir.path().join("v.webm");
        fs::write(&v, b"x").unwrap();
        let txt = dir.path().join("notes.txt");
        fs::write(&txt, b"x").unwrap();
        let folder = dir.path().join("folder.mp4");
        fs::create_dir(&folder).unwrap();

        assert_eq!(
            ensure_deletable_media_file(&s(&v)).unwrap(),
            canonicalize(&v).unwrap()
        );
        assert!(ensure_deletable_media_file(&s(&txt)).is_err());
        assert!(ensure_deletable_media_file(&s(&folder)).is_err());
        assert!(ensure_deletable_media_file(&s(&dir.path().join("gone.mp4"))).is_err());
        assert!(ensure_deletable_media_file("ftp://h/v.mp4").is_err());
    }

    #[test]
    fn canonicalize_missing_is_error() {
        assert!(canonicalize(Path::new("/definitely/not/here/x.mp4")).is_err());
    }
}
