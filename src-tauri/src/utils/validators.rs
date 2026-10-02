//! Input validation utilities

use regex::Regex;
use std::sync::LazyLock;

/// YouTube URL patterns
static YOUTUBE_PATTERNS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        Regex::new(r"^(https?://)?(www\.)?youtube\.com/watch\?v=[\w-]{11}").unwrap(),
        Regex::new(r"^(https?://)?(www\.)?youtube\.com/shorts/[\w-]{11}").unwrap(),
        Regex::new(r"^(https?://)?(www\.)?youtu\.be/[\w-]{11}").unwrap(),
        Regex::new(r"^(https?://)?(www\.)?youtube\.com/embed/[\w-]{11}").unwrap(),
        Regex::new(r"^(https?://)?(www\.)?youtube\.com/v/[\w-]{11}").unwrap(),
    ]
});

/// Video ID extraction pattern
static VIDEO_ID_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:youtube\.com/(?:watch\?v=|shorts/|embed/|v/)|youtu\.be/)([\w-]{11})").unwrap()
});

/// Check if a string is a valid YouTube URL
pub fn is_valid_youtube_url(url: &str) -> bool {
    YOUTUBE_PATTERNS.iter().any(|pattern| pattern.is_match(url))
}

/// Extract the video ID from a YouTube URL
pub fn extract_video_id(url: &str) -> Option<String> {
    VIDEO_ID_PATTERN
        .captures(url)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
}

/// Validate a file path
pub fn is_valid_path(path: &str) -> bool {
    // Check for obviously invalid characters
    let invalid_chars = ['<', '>', '"', '|', '?', '*'];

    // On Windows, also check for reserved names
    #[cfg(target_os = "windows")]
    {
        let reserved_names = [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];

        // Check if the path contains any reserved names
        let path_upper = path.to_uppercase();
        if reserved_names.iter().any(|name| path_upper.contains(name)) {
            return false;
        }
    }

    !path.chars().any(|c| invalid_chars.contains(&c))
}

/// Validate a media page URL that will be handed to yt-dlp.
///
/// Accepts only absolute `http`/`https` URLs with a host. Anything else —
/// option-looking strings (`--exec=...`), other schemes (`file:`, `ftp:`),
/// whitespace/control characters — is rejected so the value can never be
/// interpreted as anything but a URL. Returns the trimmed URL unchanged.
///
/// # Examples
///
/// ```
/// use clipy_lib::utils::validators::validate_media_url;
/// assert!(validate_media_url("https://www.youtube.com/watch?v=jNQXAC9IVRw").is_ok());
/// assert!(validate_media_url("--exec=calc").is_err());
/// assert!(validate_media_url("file:///etc/passwd").is_err());
/// ```
pub fn validate_media_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL is empty".into());
    }
    if trimmed.starts_with('-') {
        return Err("URL must not start with '-'".into());
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("URL contains whitespace or control characters".into());
    }
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("Invalid URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("Unsupported URL scheme: {}", parsed.scheme()));
    }
    match parsed.host_str() {
        Some(host) if !host.is_empty() => {}
        _ => return Err("URL has no host".into()),
    }
    Ok(trimmed.to_string())
}

/// Replace the userinfo (`user:password@`) of a URL with `***@` so proxy
/// credentials never reach logs. Strings that do not parse as URLs with
/// credentials are returned unchanged.
///
/// # Examples
///
/// ```
/// use clipy_lib::utils::validators::redact_url_credentials;
/// assert_eq!(
///     redact_url_credentials("http://bob:hunter2@proxy:8080"),
///     "http://***@proxy:8080/"
/// );
/// assert_eq!(redact_url_credentials("socks5://proxy:1080"), "socks5://proxy:1080");
/// ```
pub fn redact_url_credentials(raw: &str) -> String {
    match url::Url::parse(raw) {
        Ok(mut u) if !u.username().is_empty() || u.password().is_some() => {
            let _ = u.set_password(None);
            let _ = u.set_username("***");
            u.to_string()
        }
        _ => raw.to_string(),
    }
}

/// Validate a quality string
pub fn is_valid_quality(quality: &str) -> bool {
    let valid_qualities = ["2160", "1440", "1080", "720", "480", "360", "240", "144"];
    valid_qualities.contains(&quality)
}

/// Validate a format string
pub fn is_valid_format(format: &str) -> bool {
    let valid_formats = ["mp4", "webm", "mkv", "mp3", "m4a", "opus", "wav", "flac"];
    valid_formats.contains(&format)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_youtube_url_validation() {
        assert!(is_valid_youtube_url(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        ));
        assert!(is_valid_youtube_url("https://youtu.be/dQw4w9WgXcQ"));
        assert!(is_valid_youtube_url(
            "https://www.youtube.com/shorts/dQw4w9WgXcQ"
        ));
        assert!(is_valid_youtube_url("youtube.com/watch?v=dQw4w9WgXcQ"));
        assert!(!is_valid_youtube_url("https://example.com/video"));
        assert!(!is_valid_youtube_url("not a url"));
    }

    #[test]
    fn test_video_id_extraction() {
        assert_eq!(
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(extract_video_id("not a url"), None);
    }

    #[test]
    fn media_url_validation() {
        for ok in [
            "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "http://vimeo.com/123",
            "  https://youtu.be/jNQXAC9IVRw  ",
            "https://example.com/a?b=c&d=-e",
        ] {
            assert!(validate_media_url(ok).is_ok(), "{ok}");
        }
        assert_eq!(
            validate_media_url(" https://x.com/v ").unwrap(),
            "https://x.com/v"
        );
        for bad in [
            "",
            "   ",
            "-o/etc/x",
            "--exec=calc.exe",
            "file:///etc/passwd",
            "ftp://x/y",
            "javascript:alert(1)",
            "youtube.com/watch?v=jNQXAC9IVRw",
            "https://",
            "https://x.com/a b",
            "https://x.com/\nfoo",
            "data:text/html,hi",
        ] {
            assert!(validate_media_url(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn credential_redaction() {
        assert_eq!(
            redact_url_credentials("http://user:pass@1.2.3.4:3128"),
            "http://***@1.2.3.4:3128/"
        );
        assert_eq!(
            redact_url_credentials("socks5://onlyuser@proxy:1080"),
            "socks5://***@proxy:1080"
        );
        assert_eq!(
            redact_url_credentials("http://proxy:3128"),
            "http://proxy:3128"
        );
        assert_eq!(redact_url_credentials("not a url"), "not a url");
        assert_eq!(redact_url_credentials(""), "");
    }

    #[test]
    fn test_quality_validation() {
        assert!(is_valid_quality("1080"));
        assert!(is_valid_quality("720"));
        assert!(!is_valid_quality("1081"));
        assert!(!is_valid_quality("invalid"));
    }

    #[test]
    fn test_format_validation() {
        assert!(is_valid_format("mp4"));
        assert!(is_valid_format("webm"));
        assert!(!is_valid_format("invalid"));
    }
}
