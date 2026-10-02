//! Error types for Clipy
//!
//! This module defines all error types used throughout the application and the
//! `{ code, message }` wire shape Tauri commands send to the frontend.

use serde::Serialize;
use thiserror::Error;

/// Application-wide error type
#[derive(Error, Debug)]
pub enum ClipyError {
    /// Filesystem or other I/O failure.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// SQLite failure.
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// JSON (de)serialization failure.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Network/HTTP failure.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Malformed URL.
    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),

    /// URL is not a recognised YouTube link.
    #[error("Invalid YouTube URL: {0}")]
    InvalidYouTubeUrl(String),

    /// Requested video does not exist.
    #[error("Video not found: {0}")]
    VideoNotFound(String),

    /// A download finished unsuccessfully.
    #[error("Download failed: {0}")]
    DownloadFailed(String),

    /// An editor export finished unsuccessfully.
    #[error("Export failed: {0}")]
    ExportFailed(String),

    /// A required external binary (ffmpeg, yt-dlp, ...) is missing.
    #[error("Binary not found: {0}")]
    BinaryNotFound(String),

    /// An external binary ran but failed.
    #[error("Binary execution failed: {0}")]
    BinaryExecutionFailed(String),

    /// Spawning or managing a child process failed.
    #[error("Process error: {0}")]
    ProcessError(String),

    /// Legacy configuration error variant; prefer [`ClipyError::Config`].
    #[error("Config error: {0}")]
    ConfigError(String),

    /// Requested editor project does not exist.
    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    /// A path was malformed or could not be resolved.
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    /// The OS refused access.
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// The user cancelled the operation.
    #[error("Cancelled by user")]
    Cancelled,

    /// Error surfaced by the Tauri runtime.
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    /// Catch-all with a free-form message.
    #[error("{0}")]
    Other(String),

    /// FFmpeg invocation failure.
    #[error("FFmpeg error: {0}")]
    FFmpeg(String),

    /// yt-dlp invocation failure.
    #[error("yt-dlp error: {0}")]
    Ytdlp(String),

    /// Download queue/state error.
    #[error("Download error: {0}")]
    Download(String),

    /// Library (database-backed video list) error.
    #[error("Library error: {0}")]
    Library(String),

    /// Configuration load/save/validation error.
    #[error("Config error: {0}")]
    Config(String),
}

impl ClipyError {
    /// Stable machine-readable code for this error.
    ///
    /// The frontend matches on these strings, so they must never change for an
    /// existing variant.
    ///
    /// # Example
    /// ```
    /// use clipy_lib::error::ClipyError;
    /// assert_eq!(ClipyError::Cancelled.code(), "CANCELLED");
    /// ```
    pub fn code(&self) -> &'static str {
        match self {
            ClipyError::Io(_) => "IO_ERROR",
            ClipyError::Database(_) => "DATABASE_ERROR",
            ClipyError::Json(_) => "JSON_ERROR",
            ClipyError::Http(_) => "HTTP_ERROR",
            ClipyError::UrlParse(_) => "URL_PARSE_ERROR",
            ClipyError::InvalidYouTubeUrl(_) => "INVALID_YOUTUBE_URL",
            ClipyError::VideoNotFound(_) => "VIDEO_NOT_FOUND",
            ClipyError::DownloadFailed(_) => "DOWNLOAD_FAILED",
            ClipyError::ExportFailed(_) => "EXPORT_FAILED",
            ClipyError::BinaryNotFound(_) => "BINARY_NOT_FOUND",
            ClipyError::BinaryExecutionFailed(_) => "BINARY_EXECUTION_FAILED",
            ClipyError::ProcessError(_) => "PROCESS_ERROR",
            ClipyError::ConfigError(_) => "CONFIG_ERROR",
            ClipyError::ProjectNotFound(_) => "PROJECT_NOT_FOUND",
            ClipyError::InvalidPath(_) => "INVALID_PATH",
            ClipyError::PermissionDenied(_) => "PERMISSION_DENIED",
            ClipyError::Cancelled => "CANCELLED",
            ClipyError::Tauri(_) => "TAURI_ERROR",
            ClipyError::Other(_) => "UNKNOWN_ERROR",
            ClipyError::FFmpeg(_) => "FFMPEG_ERROR",
            ClipyError::Ytdlp(_) => "YTDLP_ERROR",
            ClipyError::Download(_) => "DOWNLOAD_ERROR",
            ClipyError::Library(_) => "LIBRARY_ERROR",
            ClipyError::Config(_) => "CONFIG_ERROR",
        }
    }
}

/// Serializable error for frontend
#[derive(Serialize, Debug)]
pub struct ErrorResponse {
    /// Stable machine-readable code, see [`ClipyError::code`].
    pub code: String,
    /// Human-readable message, identical to the error's `Display` output.
    pub message: String,
}

impl From<&ClipyError> for ErrorResponse {
    fn from(error: &ClipyError) -> Self {
        ErrorResponse {
            code: error.code().to_string(),
            message: error.to_string(),
        }
    }
}

impl From<ClipyError> for ErrorResponse {
    fn from(error: ClipyError) -> Self {
        ErrorResponse::from(&error)
    }
}

// Tauri commands serialize their error type straight to the frontend, so the
// wire shape is the `{ code, message }` object rather than a bare string.
impl Serialize for ClipyError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        ErrorResponse::from(self).serialize(serializer)
    }
}

/// Result type alias for Clipy operations
pub type Result<T> = std::result::Result<T, ClipyError>;

impl From<anyhow::Error> for ClipyError {
    fn from(error: anyhow::Error) -> Self {
        ClipyError::Other(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn every_variant() -> Vec<(ClipyError, &'static str)> {
        let io = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
        let json = serde_json::from_str::<i32>("not json").unwrap_err();
        let url = url::Url::parse("").unwrap_err();
        let http = reqwest::Client::new()
            .get("::not a url::")
            .build()
            .unwrap_err();
        vec![
            (ClipyError::Io(io), "IO_ERROR"),
            (
                ClipyError::Database(rusqlite::Error::QueryReturnedNoRows),
                "DATABASE_ERROR",
            ),
            (ClipyError::Json(json), "JSON_ERROR"),
            (ClipyError::Http(http), "HTTP_ERROR"),
            (ClipyError::UrlParse(url), "URL_PARSE_ERROR"),
            (
                ClipyError::InvalidYouTubeUrl("u".into()),
                "INVALID_YOUTUBE_URL",
            ),
            (ClipyError::VideoNotFound("v".into()), "VIDEO_NOT_FOUND"),
            (ClipyError::DownloadFailed("d".into()), "DOWNLOAD_FAILED"),
            (ClipyError::ExportFailed("e".into()), "EXPORT_FAILED"),
            (ClipyError::BinaryNotFound("b".into()), "BINARY_NOT_FOUND"),
            (
                ClipyError::BinaryExecutionFailed("b".into()),
                "BINARY_EXECUTION_FAILED",
            ),
            (ClipyError::ProcessError("p".into()), "PROCESS_ERROR"),
            (ClipyError::ConfigError("c".into()), "CONFIG_ERROR"),
            (ClipyError::ProjectNotFound("p".into()), "PROJECT_NOT_FOUND"),
            (ClipyError::InvalidPath("p".into()), "INVALID_PATH"),
            (
                ClipyError::PermissionDenied("p".into()),
                "PERMISSION_DENIED",
            ),
            (ClipyError::Cancelled, "CANCELLED"),
            (
                ClipyError::Tauri(tauri::Error::WindowNotFound),
                "TAURI_ERROR",
            ),
            (ClipyError::Other("o".into()), "UNKNOWN_ERROR"),
            (ClipyError::FFmpeg("f".into()), "FFMPEG_ERROR"),
            (ClipyError::Ytdlp("y".into()), "YTDLP_ERROR"),
            (ClipyError::Download("d".into()), "DOWNLOAD_ERROR"),
            (ClipyError::Library("l".into()), "LIBRARY_ERROR"),
            (ClipyError::Config("c".into()), "CONFIG_ERROR"),
        ]
    }

    #[test]
    fn every_variant_has_a_stable_code() {
        for (error, code) in every_variant() {
            assert_eq!(error.code(), code, "{error:?}");
        }
    }

    #[test]
    fn serialize_and_error_response_agree() {
        for (error, code) in every_variant() {
            let message = error.to_string();
            let json = serde_json::to_value(&error).unwrap();
            assert_eq!(json["code"], code);
            assert_eq!(json["message"], message);

            let response = ErrorResponse::from(error);
            assert_eq!(response.code, code);
            assert_eq!(response.message, message);
        }
    }

    #[test]
    fn display_messages_include_context() {
        assert_eq!(ClipyError::Cancelled.to_string(), "Cancelled by user");
        assert_eq!(ClipyError::Other("raw".into()).to_string(), "raw");
        assert_eq!(
            ClipyError::Download("boom".into()).to_string(),
            "Download error: boom"
        );
    }

    #[test]
    fn from_conversions_pick_the_matching_variant() {
        let e: ClipyError = std::io::Error::other("x").into();
        assert!(matches!(e, ClipyError::Io(_)));
        let e: ClipyError = serde_json::from_str::<i32>("x").unwrap_err().into();
        assert!(matches!(e, ClipyError::Json(_)));
        let e: ClipyError = url::Url::parse("").unwrap_err().into();
        assert!(matches!(e, ClipyError::UrlParse(_)));
        let e: ClipyError = rusqlite::Error::InvalidQuery.into();
        assert!(matches!(e, ClipyError::Database(_)));
        let e: ClipyError = anyhow::anyhow!("wrapped").into();
        assert!(matches!(e, ClipyError::Other(ref m) if m == "wrapped"));
        let e: ClipyError = tauri::Error::WindowNotFound.into();
        assert!(matches!(e, ClipyError::Tauri(_)));
    }
}
