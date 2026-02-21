//! Video-related data models

use serde::{Deserialize, Serialize};

/// Video information from YouTube
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub thumbnail: String,
    pub duration: u64,
    pub channel: String,
    pub channel_id: String,
    pub upload_date: String,
    pub view_count: u64,
    pub like_count: u64,
    pub formats: Vec<VideoFormat>,
    pub is_live: bool,
    pub is_private: bool,
}

/// Available video format/quality
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFormat {
    pub format_id: String,
    pub extension: String,
    pub resolution: String,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub vcodec: String,
    pub acodec: String,
    pub filesize: Option<u64>,
    pub filesize_approx: Option<u64>,
    pub tbr: f64,
    pub has_video: bool,
    pub has_audio: bool,
}

impl Default for VideoInfo {
    fn default() -> Self {
        Self {
            id: String::new(),
            title: String::new(),
            description: String::new(),
            thumbnail: String::new(),
            duration: 0,
            channel: String::new(),
            channel_id: String::new(),
            upload_date: String::new(),
            view_count: 0,
            like_count: 0,
            formats: Vec::new(),
            is_live: false,
            is_private: false,
        }
    }
}
