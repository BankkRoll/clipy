//! Opt-in tests that drive a real ffmpeg/ffprobe from PATH on lavfi-generated
//! media. Included from `src/services/ffmpeg.rs` as a child module; run with
//! `cargo test -- --ignored`.

use super::*;
use crate::models::project::{Clip, ClipProperties, ProjectSettings, TextProperties, Track};

fn ffmpeg() -> PathBuf {
    PathBuf::from(if cfg!(windows) {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    })
}

fn ffprobe() -> PathBuf {
    PathBuf::from(if cfg!(windows) {
        "ffprobe.exe"
    } else {
        "ffprobe"
    })
}

fn test_settings(output: &Path) -> ExportSettings {
    ExportSettings {
        output_path: output.to_string_lossy().into_owned(),
        fps: 25,
        resolution: "original".into(),
        use_hardware_acceleration: false,
        ..Default::default()
    }
}

/// Render a 2 s 320x240 test pattern with a sine tone.
async fn make_clip(dir: &Path) -> PathBuf {
    let out = dir.join("in.mp4");
    let args: Vec<String> = [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=320x240:rate=25:duration=2",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=2",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
    ]
    .iter()
    .map(|s| s.to_string())
    .chain([file_arg(&out)])
    .collect();
    run_ffmpeg(&ffmpeg(), &args, "fixture").await.unwrap();
    path_policy::canonicalize(&out).unwrap()
}

fn project_with(source: &Path, text: &str) -> Project {
    let video = Clip {
        id: "c1".into(),
        track_id: "t1".into(),
        clip_type: ClipType::Video,
        name: "clip".into(),
        start_time: 0.0,
        end_time: 1.5,
        source_start: 0.0,
        source_end: 1.5,
        source_path: source.to_string_lossy().into_owned(),
        thumbnails: Vec::new(),
        properties: ClipProperties::default(),
    };
    let mut title = video.clone();
    title.id = "c2".into();
    title.clip_type = ClipType::Text;
    title.source_path = String::new();
    title.properties.text = Some(TextProperties {
        content: text.into(),
        font_family: "Arial".into(),
        font_size: 24,
        font_weight: 400,
        color: "#ffcc00".into(),
        background_color: "#000000".into(),
        align: TextAlign::Center,
        vertical_align: VerticalAlign::Bottom,
        ..Default::default()
    });
    let mk = |id: &str, track_type, clips| Track {
        id: id.into(),
        track_type,
        name: id.into(),
        clips,
        muted: false,
        locked: false,
        volume: 1.0,
        height: 80,
    };
    Project {
        id: "p".into(),
        name: "it".into(),
        created_at: String::new(),
        modified_at: String::new(),
        duration: 1.5,
        tracks: vec![
            mk("v", TrackType::Video, vec![video]),
            mk("t", TrackType::Text, vec![title]),
        ],
        settings: ProjectSettings {
            width: 320,
            height: 240,
            fps: 25,
            sample_rate: 48000,
        },
    }
}

#[tokio::test]
#[ignore = "needs ffmpeg and ffprobe on PATH"]
async fn probe_thumbnail_waveform_and_transcode() {
    let dir = tempfile::tempdir().unwrap();
    let input = make_clip(dir.path()).await;

    let meta = probe_with(&ffprobe(), &input).await.unwrap();
    assert_eq!((meta.width, meta.height), (320, 240));
    assert!(meta.has_audio);
    assert!((meta.duration - 2.0).abs() < 0.2);

    let thumb = dir.path().join("t.jpg");
    run_ffmpeg(
        &ffmpeg(),
        &build_thumbnail_args(&input, &thumb, 0.5, Some(160)),
        "thumb",
    )
    .await
    .unwrap();
    assert!(std::fs::metadata(&thumb).unwrap().len() > 0);

    let raw = run_ffmpeg(&ffmpeg(), &build_waveform_args(&input, 200), "wave")
        .await
        .unwrap();
    let wave = normalize_waveform(&raw);
    assert!(!wave.is_empty());
    assert!(wave.iter().all(|v| (0.0..=1.0).contains(v)));

    let out = dir.path().join("t.mkv");
    let s = ExportSettings {
        use_hardware_acceleration: false,
        ..Default::default()
    };
    let args = build_transcode_args(
        &input,
        &out,
        &s,
        &EncoderChoice {
            name: "libx264".into(),
            hardware: false,
        },
    );
    run_ffmpeg(&ffmpeg(), &args, "transcode").await.unwrap();
    assert!(probe_with(&ffprobe(), &out).await.unwrap().has_audio);
}

#[tokio::test]
#[ignore = "needs ffmpeg and ffprobe on PATH"]
async fn export_with_hostile_text_and_colors_renders() {
    let _guard = EXPORT_TEST_LOCK.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let input = make_clip(dir.path()).await;
    let project = project_with(&input, "it's 100% a:b [x];movie=/etc/passwd %{pts}");
    let settings = ExportSettings {
        video_codec: "h264".into(),
        ..test_settings(&dir.path().join("out.mp4"))
    };

    let (tx, mut rx) = mpsc::channel(256);
    reset_export_cancel();
    let out = run_export(
        &ffmpeg(),
        &EncoderChoice {
            name: "libx264".into(),
            hardware: false,
        },
        &project,
        &settings,
        tx,
    )
    .await
    .unwrap();
    let meta = probe_with(&ffprobe(), &out).await.unwrap();
    assert_eq!((meta.width, meta.height), (320, 240));
    let mut last = None;
    while let Ok(p) = rx.try_recv() {
        last = Some(p.status);
    }
    assert_eq!(last, Some(ExportStatus::Completed));
}

#[tokio::test]
#[ignore = "needs ffmpeg on PATH"]
async fn cancel_stops_export_and_removes_output() {
    let _guard = EXPORT_TEST_LOCK.lock().await;
    let dir = tempfile::tempdir().unwrap();
    let input = make_clip(dir.path()).await;
    let mut project = project_with(&input, "slow");
    project.settings.width = 3840;
    project.settings.height = 2160;
    let settings = ExportSettings {
        encoding_preset: "veryslow".into(),
        ..test_settings(&dir.path().join("cancelled.mp4"))
    };
    let out_path = PathBuf::from(&settings.output_path);

    reset_export_cancel();
    let (tx, mut rx) = mpsc::channel(1024);
    let task = tokio::spawn(async move {
        run_export(
            &ffmpeg(),
            &EncoderChoice {
                name: "libx264".into(),
                hardware: false,
            },
            &project,
            &settings,
            tx,
        )
        .await
    });
    // Wait until ffmpeg is actually running before cancelling.
    while let Some(p) = rx.recv().await {
        if p.status == ExportStatus::Exporting {
            break;
        }
    }
    request_export_cancel();
    let err = task.await.unwrap().unwrap_err();
    assert!(matches!(err, ClipyError::ExportFailed(_)), "{err:?}");
    assert!(!out_path.exists());
    assert!(!export_cancelled());
    let mut saw_cancelled = false;
    while let Ok(p) = rx.try_recv() {
        saw_cancelled |= p.status == ExportStatus::Cancelled;
    }
    assert!(saw_cancelled);
}

#[tokio::test]
#[ignore = "needs ffmpeg on PATH"]
async fn system_encoder_list_parses() {
    let raw = run_ffmpeg(
        &ffmpeg(),
        &["-hide_banner".to_string(), "-encoders".to_string()],
        "encoders",
    )
    .await
    .unwrap();
    let names = parse_encoder_list(&String::from_utf8_lossy(&raw));
    assert!(names.iter().any(|n| n == "aac"), "{names:?}");
    assert!(!names.iter().any(|n| n == "="));
}
