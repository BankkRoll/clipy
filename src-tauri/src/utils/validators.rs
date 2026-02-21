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
            "CON", "PRN", "AUX", "NUL",
            "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
            "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];

        // Check if the path contains any reserved names
        let path_upper = path.to_uppercase();
        if reserved_names.iter().any(|name| path_upper.contains(name)) {
            return false;
        }
    }

    !path.chars().any(|c| invalid_chars.contains(&c))
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
        assert!(is_valid_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assert!(is_valid_youtube_url("https://youtu.be/dQw4w9WgXcQ"));
        assert!(is_valid_youtube_url("https://www.youtube.com/shorts/dQw4w9WgXcQ"));
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
