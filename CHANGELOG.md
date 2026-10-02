# Changelog

All notable changes to Clipy are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0] - Unreleased

Clipy 2 is a ground-up rewrite on [Tauri 2](https://tauri.app) and Rust,
replacing the Electron app. Installers are a fraction of the size, the app
starts faster and uses far less memory, and downloads, exports and captions run
in a native backend.

> **Upgrading from 1.x:** v1 has no updater, so install 2.0.0 manually once.
> From 2.0.0 on, Clipy updates itself.

### Added

- **Video editor**: multi-track timeline with drag, trim, split, snapping,
  copy/paste, duplicate, track reorder, mute and lock; per-clip volume, speed,
  opacity, fades, transform and filters (brightness, contrast, saturation, hue,
  blur, sharpen, grayscale, sepia, invert); text overlays; full undo/redo; save
  and open `.clipy` projects.
- **Export** to MP4, MOV and WebM with H.264, H.265, VP9 or AV1, quality/CRF and
  preset control, and automatic hardware encoding (NVENC, QuickSync, AMF,
  VideoToolbox, VAAPI) with a software fallback. Impossible format/codec pairs
  are blocked in the dialog.
- **Auto-captions** with whisper.cpp: word-level timing, karaoke highlight
  styles (color, box, scale), outlines, and caption styles that are saved with
  the project.
- **Download queue** with a configurable concurrency limit, pause, resume,
  cancel and retry, live progress, and failure reasons shown in the UI.
- Downloads from the 1000+ sites yt-dlp supports, with quality/format
  selection, audio-only mode, subtitles, SponsorBlock, chapters, metadata and
  thumbnail embedding, filename templates and per-channel folders.
- **Library**: grid and list views, search and sort, import local files, rename,
  multi-select, bulk delete (remove from library or also delete files), and
  export to JSON.
- **First-run setup** that installs FFmpeg and yt-dlp for you, with retry and
  skip.
- **Signed automatic updates** (minisign-verified) from GitHub Releases.
- System tray with quick navigation, close-to-tray and start-minimized.
- Command palette (`Ctrl/⌘ K`) with working navigation shortcuts.
- Installers for Windows (NSIS, MSI), macOS (universal DMG) and Linux (AppImage,
  deb, rpm).

### Security

- yt-dlp, FFmpeg and whisper downloads are verified against published SHA-256
  checksums (or pinned hashes) before install, written atomically, and
  whisper's DLLs are isolated from the other binaries.
- URLs are validated and passed to yt-dlp after `--`, so a crafted URL can no
  longer inject options such as `--exec`.
- FFmpeg filter graphs only accept allowlisted colors and escaped text, and
  inputs/outputs must be local files, closing filter-graph and protocol
  injection.
- Every file path received from the UI goes through one path policy:
  type-checked, canonicalized, no URLs, UNC or device paths. Opening files only
  launches media, never executables.
- Webview permissions trimmed to what the UI uses; the asset protocol is
  disabled; a stricter Content Security Policy.
- The local media server streams in bounded chunks (no more loading whole
  videos into memory) and only serves media from allowed folders or files you
  opened.
- Proxy credentials and URL query strings are redacted from logs; logs are kept
  for 7 days.
- Releases are built only from owner-pushed tags, gated on the full test suite,
  smoke-tested by installing and launching each installer on every OS, and
  published with `SHA256SUMS.txt` and signed build-provenance attestations.

### Fixed

- Closing the app could hang forever while downloads were listed, and quitting
  from the tray left yt-dlp/FFmpeg running in the background.
- Paused or cancelled downloads were reported as failed, resume ignored the
  concurrency limit, and a limit of 0 stalled the queue.
- Settings could be corrupted by a crash mid-save; a corrupt settings file is
  now backed up instead of silently reset.
- Library search treated `%` and `_` in titles as wildcards.
- Editor: right-click actions applied to the previously selected clip; new
  filters started at the wrong value; imported videos were muted on export;
  images could not be previewed; transforms and fades were missing from the
  preview; the first edit could not be undone; opening an editor link could hang
  on "Initializing editor…"; keyboard shortcuts fired while typing in dialogs;
  "Duplicate track" copied no clips; Ctrl+Shift+Z did not redo.

## [1.0.0] - 2026-02-18

First stable release of the Electron app.

[2.0.0]: https://github.com/BankkRoll/clipy/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/BankkRoll/clipy/releases/tag/v1.0.0
