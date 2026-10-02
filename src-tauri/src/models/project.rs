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
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    /// Auto-caption word timings (seconds, relative to the clip start). Empty
    /// for plain text clips; kept so saved projects reload with karaoke timing.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub caption_words: Vec<CaptionWordTiming>,
    /// Color of the currently spoken caption word.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight_color: Option<String>,
    /// How the currently spoken caption word is emphasised.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight_style: Option<CaptionHighlightStyle>,
    /// Glyph outline color for captions.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outline_color: Option<String>,
}

/// One caption word with timing in seconds relative to its clip's start.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CaptionWordTiming {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

/// Emphasis applied to the currently spoken caption word.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptionHighlightStyle {
    Color,
    Box,
    Scale,
    None,
}

/// Text alignment
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextAlign {
    Left,
    #[default]
    Center,
    Right,
}

/// Vertical alignment
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VerticalAlign {
    Top,
    Middle,
    #[default]
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
    /// Video codec family: "h264", "h265"/"hevc", "vp9", "av1". Defaults to h264.
    #[serde(default)]
    pub video_codec: String,
    /// Constant Rate Factor for software encoders. Accepts `crf` or `crfQuality`.
    #[serde(default, alias = "crfQuality")]
    pub crf: Option<u32>,
    /// Named encoder preset (e.g. "medium", "slow"). Defaults to empty (use quality mapping).
    #[serde(default)]
    pub encoding_preset: String,
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
            video_codec: String::new(),
            crf: None,
            encoding_preset: String::new(),
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn caption_fields_survive_a_save_load_round_trip() {
        let saved = json!({
            "content": "hello world",
            "fontFamily": "Inter",
            "fontSize": 48,
            "fontWeight": 700,
            "color": "#ffffff",
            "backgroundColor": "transparent",
            "align": "center",
            "verticalAlign": "bottom",
            "captionWords": [
                { "text": "hello", "start": 0.0, "end": 0.4 },
                { "text": "world", "start": 0.4, "end": 0.9 }
            ],
            "highlightColor": "#facc15",
            "highlightStyle": "box",
            "outlineColor": "#000000"
        });
        let text: TextProperties = serde_json::from_value(saved.clone()).unwrap();
        assert_eq!(text.caption_words.len(), 2);
        assert_eq!(text.highlight_style, Some(CaptionHighlightStyle::Box));
        assert_eq!(serde_json::to_value(&text).unwrap(), saved);
    }

    #[test]
    fn plain_text_omits_caption_fields_and_loads_old_projects() {
        let old = json!({
            "content": "title",
            "fontFamily": "Inter",
            "fontSize": 32,
            "fontWeight": 400,
            "color": "#fff",
            "backgroundColor": "",
            "align": "left",
            "verticalAlign": "top"
        });
        let text: TextProperties = serde_json::from_value(old.clone()).unwrap();
        assert!(text.caption_words.is_empty());
        assert_eq!(serde_json::to_value(&text).unwrap(), old);
    }
}
