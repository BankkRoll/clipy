//! Error types for Clipy
//!
//! This module defines all error types used throughout the application.

use serde::Serialize;
use thiserror::Error;

/// Application-wide error type
#[derive(Error, Debug)]
pub enum ClipyError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("URL parse error: {0}")]
    UrlParse(#[from] url::ParseError),

    #[error("Invalid YouTube URL: {0}")]
    InvalidYouTubeUrl(String),

    #[error("Video not found: {0}")]
    VideoNotFound(String),

    #[error("Download failed: {0}")]
    DownloadFailed(String),

    #[error("Export failed: {0}")]
    ExportFailed(String),

    #[error("Binary not found: {0}")]
    BinaryNotFound(String),

    #[error("Binary execution failed: {0}")]
    BinaryExecutionFailed(String),

    #[error("Process error: {0}")]
    ProcessError(String),

    #[error("Config error: {0}")]
    ConfigError(String),

    #[error("Project not found: {0}")]
    ProjectNotFound(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Cancelled by user")]
    Cancelled,

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("{0}")]
    Other(String),

    // Additional error variants for services
    #[error("FFmpeg error: {0}")]
    FFmpeg(String),

    #[error("yt-dlp error: {0}")]
    Ytdlp(String),

    #[error("Download error: {0}")]
    Download(String),

    #[error("Library error: {0}")]
    Library(String),

    #[error("Config error: {0}")]
    Config(String),
}

/// Serializable error for frontend
#[derive(Serialize, Debug)]
pub struct ErrorResponse {
    pub code: String,
    pub message: String,
}

impl From<ClipyError> for ErrorResponse {
    fn from(error: ClipyError) -> Self {
        let code = match &error {
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
        };

        ErrorResponse {
            code: code.to_string(),
            message: error.to_string(),
        }
    }
}

// Implement Serialize for ClipyError so it can be returned from Tauri commands
impl Serialize for ClipyError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let response = ErrorResponse {
            code: match self {
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
            }.to_string(),
            message: self.to_string(),
        };
        response.serialize(serializer)
    }
}

/// Result type alias for Clipy operations
pub type Result<T> = std::result::Result<T, ClipyError>;

/// Convert anyhow::Error to ClipyError
impl From<anyhow::Error> for ClipyError {
    fn from(error: anyhow::Error) -> Self {
        ClipyError::Other(error.to_string())
    }
}
