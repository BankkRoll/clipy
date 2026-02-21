//! Library data models

use serde::{Deserialize, Serialize};

/// Video in the library
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryVideo {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub thumbnail: String,
    pub duration: u64,
    pub channel: String,
    pub file_path: String,
    pub file_size: u64,
    pub format: String,
    pub resolution: String,
    pub downloaded_at: String,
    pub source_url: String,
}

impl LibraryVideo {
    /// Create a new library video entry
    pub fn new(
        video_id: String,
        title: String,
        thumbnail: String,
        duration: u64,
        channel: String,
        file_path: String,
        file_size: u64,
        format: String,
        resolution: String,
        source_url: String,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            video_id,
            title,
            thumbnail,
            duration,
            channel,
            file_path,
            file_size,
            format,
            resolution,
            downloaded_at: chrono::Utc::now().to_rfc3339(),
            source_url,
        }
    }
}
