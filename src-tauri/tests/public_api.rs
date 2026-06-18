//! Integration tests exercising the public crate API of `clipy_lib`.
//!
//! Covers pure helpers reachable without a Tauri `AppHandle`: filename
//! sanitization, validators, error-code mapping, model serde round-trips and
//! camelCase key contracts with the frontend, and the URL command helpers.
//!
//! NOTE: Windows-active code paths (reserved-name validation, sanitize) are
//! asserted here. The non-Windows `cfg` branches in `validators::is_valid_path`
//! need CI runs on macOS/Linux to cover their absence of reserved-name checks.

use clipy_lib::commands::download::{extract_video_id, validate_url};
use clipy_lib::error::{ClipyError, ErrorResponse};
use clipy_lib::models::download::{DownloadOptions, DownloadStatus, DownloadTask};
use clipy_lib::models::library::LibraryVideo;
use clipy_lib::models::project::{ClipType, ExportSettings, Project, ProjectSettings, TrackType};
use clipy_lib::models::settings::AppSettings;
use clipy_lib::utils::paths::sanitize_filename;
use clipy_lib::utils::validators;

// ---------------------------------------------------------------------------
// sanitize_filename
// ---------------------------------------------------------------------------

#[test]
fn sanitize_replaces_illegal_chars() {
    assert_eq!(
        sanitize_filename("a<b>c:d\"e/f\\g|h?i*j"),
        "a_b_c_d_e_f_g_h_i_j"
    );
}

#[test]
fn sanitize_keeps_normal_chars() {
    assert_eq!(sanitize_filename("My Video 2024.mp4"), "My Video 2024.mp4");
}

#[test]
fn sanitize_replaces_control_chars() {
    assert_eq!(sanitize_filename("a\nb\tc"), "a_b_c");
}

#[test]
fn sanitize_trims_whitespace() {
    assert_eq!(sanitize_filename("  hello  "), "hello");
}

#[test]
fn sanitize_limits_length_to_200() {
    let long = "x".repeat(500);
    assert_eq!(sanitize_filename(&long).chars().count(), 200);
}

// ---------------------------------------------------------------------------
// validators
// ---------------------------------------------------------------------------

#[test]
fn validators_youtube_urls() {
    assert!(validators::is_valid_youtube_url(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    ));
    assert!(validators::is_valid_youtube_url(
        "https://www.youtube.com/embed/dQw4w9WgXcQ"
    ));
    assert!(validators::is_valid_youtube_url(
        "https://www.youtube.com/v/dQw4w9WgXcQ"
    ));
    assert!(!validators::is_valid_youtube_url("https://vimeo.com/12345"));
}

#[test]
fn validators_extract_id_from_all_forms() {
    assert_eq!(
        validators::extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ"),
        Some("dQw4w9WgXcQ".into())
    );
    assert_eq!(
        validators::extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
        Some("dQw4w9WgXcQ".into())
    );
    assert_eq!(
        validators::extract_video_id("https://youtu.be/dQw4w9WgXcQ"),
        Some("dQw4w9WgXcQ".into())
    );
}

#[test]
fn validators_quality_and_format() {
    assert!(validators::is_valid_quality("2160"));
    assert!(!validators::is_valid_quality("9999"));
    assert!(validators::is_valid_format("mkv"));
    assert!(!validators::is_valid_format("exe"));
}

#[test]
fn validators_path_rejects_illegal_chars() {
    assert!(validators::is_valid_path("C:/Users/me/video.mp4"));
    assert!(!validators::is_valid_path("bad<name>.mp4"));
    assert!(!validators::is_valid_path("a|b"));
}

#[cfg(target_os = "windows")]
#[test]
fn validators_path_rejects_reserved_names_on_windows() {
    assert!(!validators::is_valid_path("CON"));
    assert!(!validators::is_valid_path("path/to/NUL"));
    assert!(!validators::is_valid_path("COM1"));
}

// ---------------------------------------------------------------------------
// download command helpers (validate_url / extract_video_id)
// ---------------------------------------------------------------------------

#[test]
fn command_validate_url_accepts_http_https() {
    assert!(validate_url("https://youtube.com/watch?v=abc".into()));
    assert!(validate_url("http://example.com".into()));
    assert!(!validate_url("ftp://example.com".into()));
    assert!(!validate_url("not a url".into()));
    assert!(!validate_url("".into()));
}

#[test]
fn command_extract_video_id_youtube_watch() {
    assert_eq!(
        extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ".into()),
        Some("dQw4w9WgXcQ".into())
    );
}

#[test]
fn command_extract_video_id_youtu_be() {
    assert_eq!(
        extract_video_id("https://youtu.be/dQw4w9WgXcQ".into()),
        Some("dQw4w9WgXcQ".into())
    );
}

#[test]
fn command_extract_video_id_vimeo_numeric() {
    assert_eq!(
        extract_video_id("https://vimeo.com/123456789".into()),
        Some("123456789".into())
    );
}

#[test]
fn command_extract_video_id_invalid_returns_none() {
    assert_eq!(extract_video_id("https://example.com/foo".into()), None);
    assert_eq!(extract_video_id("not a url".into()), None);
    // Vimeo non-numeric path is rejected.
    assert_eq!(
        extract_video_id("https://vimeo.com/channels/staffpicks".into()),
        None
    );
}

// ---------------------------------------------------------------------------
// error code mapping
// ---------------------------------------------------------------------------

#[test]
fn error_response_code_mapping() {
    let cases: Vec<(ClipyError, &str)> = vec![
        (
            ClipyError::InvalidYouTubeUrl("x".into()),
            "INVALID_YOUTUBE_URL",
        ),
        (ClipyError::VideoNotFound("x".into()), "VIDEO_NOT_FOUND"),
        (ClipyError::DownloadFailed("x".into()), "DOWNLOAD_FAILED"),
        (ClipyError::ExportFailed("x".into()), "EXPORT_FAILED"),
        (ClipyError::BinaryNotFound("x".into()), "BINARY_NOT_FOUND"),
        (
            ClipyError::BinaryExecutionFailed("x".into()),
            "BINARY_EXECUTION_FAILED",
        ),
        (ClipyError::ProcessError("x".into()), "PROCESS_ERROR"),
        (ClipyError::ProjectNotFound("x".into()), "PROJECT_NOT_FOUND"),
        (ClipyError::InvalidPath("x".into()), "INVALID_PATH"),
        (
            ClipyError::PermissionDenied("x".into()),
            "PERMISSION_DENIED",
        ),
        (ClipyError::Cancelled, "CANCELLED"),
        (ClipyError::Other("x".into()), "UNKNOWN_ERROR"),
        (ClipyError::FFmpeg("x".into()), "FFMPEG_ERROR"),
        (ClipyError::Ytdlp("x".into()), "YTDLP_ERROR"),
        (ClipyError::Download("x".into()), "DOWNLOAD_ERROR"),
        (ClipyError::Library("x".into()), "LIBRARY_ERROR"),
        (ClipyError::Config("x".into()), "CONFIG_ERROR"),
        (ClipyError::ConfigError("x".into()), "CONFIG_ERROR"),
    ];
    for (err, expected_code) in cases {
        let resp: ErrorResponse = err.into();
        assert_eq!(resp.code, expected_code);
    }
}

#[test]
fn error_response_carries_message() {
    let resp: ErrorResponse = ClipyError::VideoNotFound("abc".into()).into();
    assert_eq!(resp.message, "Video not found: abc");
}

#[test]
fn error_io_from_conversion() {
    let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "missing");
    let clipy: ClipyError = io_err.into();
    let resp: ErrorResponse = clipy.into();
    assert_eq!(resp.code, "IO_ERROR");
}

#[test]
fn error_anyhow_from_conversion() {
    let clipy: ClipyError = anyhow::anyhow!("boom").into();
    let resp: ErrorResponse = clipy.into();
    assert_eq!(resp.code, "UNKNOWN_ERROR");
    assert_eq!(resp.message, "boom");
}

#[test]
fn error_serializes_to_code_and_message() {
    let json = serde_json::to_value(ClipyError::FFmpeg("bad".into())).unwrap();
    assert_eq!(json["code"], "FFMPEG_ERROR");
    assert_eq!(json["message"], "FFmpeg error: bad");
}

// ---------------------------------------------------------------------------
// model defaults & constructors
// ---------------------------------------------------------------------------

#[test]
fn project_settings_default() {
    let s = ProjectSettings::default();
    assert_eq!(
        (s.width, s.height, s.fps, s.sample_rate),
        (1920, 1080, 30, 48000)
    );
}

#[test]
fn export_settings_default() {
    let s = ExportSettings::default();
    assert_eq!(s.format, "mp4");
    assert_eq!(s.resolution, "1920x1080");
    assert!(s.use_hardware_acceleration);
}

#[test]
fn download_status_default_is_pending() {
    assert_eq!(DownloadStatus::default(), DownloadStatus::Pending);
}

#[test]
fn download_options_default() {
    let o = DownloadOptions::default();
    assert_eq!(o.quality, "1080");
    assert_eq!(o.audio_format, "m4a");
    assert!(o.no_playlist);
    assert_eq!(o.concurrent_fragments, 1);
}

#[test]
fn library_video_new_maps_fields_and_generates_id() {
    let v = LibraryVideo::new(
        "vid123".into(),
        "Title".into(),
        "thumb.jpg".into(),
        120,
        "Channel".into(),
        "/path/file.mp4".into(),
        4096,
        "mp4".into(),
        "1080p".into(),
        "https://youtu.be/vid123".into(),
    );
    assert_eq!(v.video_id, "vid123");
    assert_eq!(v.title, "Title");
    assert_eq!(v.duration, 120);
    assert_eq!(v.file_size, 4096);
    assert_eq!(v.resolution, "1080p");
    assert_eq!(v.source_url, "https://youtu.be/vid123");
    assert!(!v.id.is_empty());
    assert!(!v.downloaded_at.is_empty());
}

// ---------------------------------------------------------------------------
// serde round-trips & camelCase key contract
// ---------------------------------------------------------------------------

fn sample_project() -> Project {
    use clipy_lib::models::project::{Clip, ClipProperties, Track};
    Project {
        id: "p1".into(),
        name: "Demo".into(),
        created_at: "2024-01-01T00:00:00Z".into(),
        modified_at: "2024-01-02T00:00:00Z".into(),
        duration: 30.0,
        tracks: vec![Track {
            id: "t1".into(),
            track_type: TrackType::Video,
            name: "Video".into(),
            clips: vec![Clip {
                id: "c1".into(),
                track_id: "t1".into(),
                clip_type: ClipType::Video,
                name: "Clip".into(),
                start_time: 0.0,
                end_time: 5.0,
                source_start: 1.0,
                source_end: 6.0,
                source_path: "in.mp4".into(),
                thumbnails: vec![],
                properties: ClipProperties::default(),
            }],
            muted: false,
            locked: false,
            volume: 1.0,
            height: 80,
        }],
        settings: ProjectSettings::default(),
    }
}

#[test]
fn project_serde_round_trip() {
    let p = sample_project();
    let json = serde_json::to_string(&p).unwrap();
    let back: Project = serde_json::from_str(&json).unwrap();
    // Re-serialize and compare JSON (Project has no PartialEq).
    assert_eq!(serde_json::to_string(&back).unwrap(), json);
}

#[test]
fn project_json_uses_camelcase_keys() {
    let p = sample_project();
    let json = serde_json::to_string(&p).unwrap();
    assert!(
        json.contains("\"trackType\""),
        "expected trackType in {json}"
    );
    assert!(json.contains("\"clipType\""));
    assert!(json.contains("\"sourceStart\""));
    assert!(json.contains("\"sourceEnd\""));
    assert!(json.contains("\"startTime\""));
    // enum values use lowercase rename_all.
    assert!(json.contains("\"video\""));
}

#[test]
fn download_task_serde_round_trip() {
    let task = DownloadTask {
        id: "d1".into(),
        video_id: "v1".into(),
        title: "T".into(),
        thumbnail: "th".into(),
        url: "https://youtu.be/v1".into(),
        status: DownloadStatus::Downloading,
        progress: 42.0,
        downloaded_bytes: 100,
        total_bytes: 200,
        speed: 50,
        eta: 4,
        quality: "1080".into(),
        format: "mp4".into(),
        output_path: "/out".into(),
        error: None,
        created_at: "2024-01-01T00:00:00Z".into(),
        completed_at: None,
        duration: 60,
        channel: "Ch".into(),
        options: DownloadOptions::default(),
    };
    let json = serde_json::to_string(&task).unwrap();
    assert!(json.contains("\"videoId\""));
    assert!(json.contains("\"downloadedBytes\""));
    assert!(json.contains("\"outputPath\""));
    let back: DownloadTask = serde_json::from_str(&json).unwrap();
    assert_eq!(serde_json::to_string(&back).unwrap(), json);
}

#[test]
fn app_settings_serde_round_trip_and_camelcase() {
    let s = AppSettings::default();
    let json = serde_json::to_string(&s).unwrap();
    assert!(json.contains("\"maxConcurrentDownloads\""));
    assert!(json.contains("\"hardwareAcceleration\""));
    let back: AppSettings = serde_json::from_str(&json).unwrap();
    assert_eq!(serde_json::to_string(&back).unwrap(), json);
}

#[test]
fn app_settings_deserializes_with_missing_optional_fields() {
    // Frontend may omit serde(default) fields; ensure they fill in.
    let minimal = serde_json::to_string(&AppSettings::default()).unwrap();
    let parsed: AppSettings = serde_json::from_str(&minimal).unwrap();
    assert_eq!(parsed.advanced.hardware_acceleration_type, "auto");
}
