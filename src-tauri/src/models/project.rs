//! Editor project data models

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Editor project
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub modified_at: String,
    pub duration: f64,
    pub tracks: Vec<Track>,
    pub settings: ProjectSettings,
}

/// Project settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub sample_rate: u32,
}

impl Default for ProjectSettings {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            fps: 30,
            sample_rate: 48000,
        }
    }
}

/// Timeline track
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub track_type: TrackType,
    pub name: String,
    pub clips: Vec<Clip>,
    pub muted: bool,
    pub locked: bool,
    pub volume: f64,
    pub height: u32,
}

/// Track type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrackType {
    Video,
    Audio,
    Text,
    Effect,
}

/// Clip on a track
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub track_id: String,
    pub clip_type: ClipType,
    pub name: String,
    pub start_time: f64,
    pub end_time: f64,
    pub source_start: f64,
    pub source_end: f64,
    pub source_path: String,
    pub thumbnails: Vec<String>,
    pub properties: ClipProperties,
}

/// Clip type
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClipType {
    Video,
    Audio,
    Text,
    Image,
}

/// Clip properties
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipProperties {
    pub volume: f64,
    pub opacity: f64,
    pub speed: f64,
    pub fade_in: f64,
    pub fade_out: f64,
    pub filters: Vec<Filter>,
    pub transform: Transform,
    pub text: Option<TextProperties>,
}

impl Default for ClipProperties {
    fn default() -> Self {
        Self {
            volume: 1.0,
            opacity: 1.0,
            speed: 1.0,
            fade_in: 0.0,
            fade_out: 0.0,
            filters: Vec::new(),
            transform: Transform::default(),
            text: None,
        }
    }
}

/// Transform properties
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
        }
    }
}

/// Text properties for text clips
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextProperties {
    pub content: String,
    pub font_family: String,
    pub font_size: u32,
    pub font_weight: u32,
    pub color: String,
    pub background_color: String,
    pub align: TextAlign,
    pub vertical_align: VerticalAlign,
}

/// Text alignment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

/// Vertical alignment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    Bottom,
}

/// Filter/effect
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
    pub id: String,
    pub filter_type: String,
    pub enabled: bool,
    pub params: HashMap<String, serde_json::Value>,
}

/// Export settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub format: String,
    pub quality: String,
    pub resolution: String,
    pub fps: u32,
    pub video_bitrate: u32,
    pub audio_bitrate: u32,
    pub use_hardware_acceleration: bool,
    pub output_path: String,
}

impl Default for ExportSettings {
    fn default() -> Self {
        Self {
            format: "mp4".to_string(),
            quality: "high".to_string(),
            resolution: "1920x1080".to_string(),
            fps: 30,
            video_bitrate: 12000,
            audio_bitrate: 256,
            use_hardware_acceleration: true,
            output_path: String::new(),
        }
    }
}

/// Export progress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub project_id: String,
    pub progress: f64,
    pub current_frame: u64,
    pub total_frames: u64,
    pub elapsed_time: u64,
    pub estimated_time: u64,
    pub status: ExportStatus,
    pub error: Option<String>,
}

/// Export status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportStatus {
    Preparing,
    Exporting,
    Finalizing,
    Completed,
    Failed,
    Cancelled,
}
