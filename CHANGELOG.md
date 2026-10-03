# Changelog

All notable changes to Clipy are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [2.0.0] - 2026-10-02

Clipy 2 is a ground-up rewrite on [Tauri 2](https://tauri.app) and Rust,
replacing the Electron app. The Windows download drops from 202 MB to about
4 MB, and downloads, exports and captions run in a native backend.

> **Upgrading from 1.x:** v1 has no updater, so install 2.0.0 manually once.
> From 2.0.0 on, Clipy updates itself.

### Added

- **Video editor**: multi-track timeline with drag (including across tracks),
  trim, split, snapping to clips and the playhead, copy/paste, duplicate, track
  reorder, mute and lock; per-clip volume, speed, opacity, fades, position,
  scale and rotation; filters (brightness, contrast, saturation, hue, blur,
  sharpen) with live preview; text overlays; image clips; full undo/redo;
  keyboard shortcuts; save and open `.clipy` projects.
- **Export** to MP4, MOV, MKV or WebM with H.264, H.265, VP9 or AV1 video and
  AAC, MP3, Opus or FLAC audio, CRF quality and encoder presets, and automatic
  hardware encoding (NVENC, QuickSync, AMF, VideoToolbox, VAAPI) with a software
  fallback. Format/codec combinations that cannot work are blocked in the
  dialog, and export settings default to your saved preferences.
- **Auto-captions** with whisper.cpp: word-level timing, karaoke highlight
  styles (color, box, scale) and outlines, all saved with the project.
- **Downloads** from the 1000+ sites yt-dlp supports, with quality/format
  selection, audio-only mode, subtitles, SponsorBlock, chapters, metadata and
  thumbnail embedding, playlist item selection, filename templates and
  per-channel folders.
- **Download queue** with a configurable concurrency limit, pause, resume,
  cancel and retry, live progress, the failure reason when something goes
  wrong, and a list that survives switching pages.
- **Library**: grid and list views, search and sort, import local files, rename,
  multi-select, and a delete prompt that lets you remove from the library only
  or also delete the files; export the library to JSON.
- **First-run setup** that installs FFmpeg and yt-dlp for you, with retry and
  skip if an install fails.
- **Signed automatic updates**: checked at launch (can be turned off) or from
  Settings, downloaded with progress, verified, installed and relaunched. A
  version can be skipped.
- System tray with quick navigation, close-to-tray and start-minimized.
- Command palette (`Ctrl/⌘ K`) plus app-wide shortcuts (`Ctrl/⌘ 1–4`, `,`,
  `N`, `Shift+N`).
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

- The window could take several seconds to appear while Clipy probed for
  FFmpeg and yt-dlp; that check now runs in the background.
- Closing the app could hang forever while downloads were listed, and quitting
  from the tray left yt-dlp/FFmpeg running in the background.
- Paused or cancelled downloads were reported as failed, resume ignored the
  concurrency limit, and a limit of 0 stalled the queue.
- "Play" and "Show in folder" could point at the download folder instead of the
  downloaded file.
- Settings could be corrupted by a crash mid-save; a corrupt settings file is
  now backed up instead of silently reset. Text settings no longer save on
  every keystroke, and failed saves show an error.
- Theme and debug-mode changes made in one place were not picked up elsewhere.
- Thumbnails from sites other than YouTube did not load.
- Library search treated `%` and `_` in titles as wildcards; a cancelled bulk
  delete still removed the videos.
- Editor: right-click actions applied to the previously selected clip; new
  filters started at the wrong value; imported videos were muted on export;
  images could not be previewed; transforms and fades were missing from the
  preview; the first edit could not be undone; opening an editor link could hang
  on "Initializing editor…"; keyboard shortcuts fired while typing in dialogs;
  "Duplicate track" copied no clips; Ctrl+Shift+Z did not redo; captions lost
  their timing and styling when a project was saved and reopened.

## [1.0.0] - 2026-02-18

First stable release of the Electron app.

[2.0.0]: https://github.com/BankkRoll/clipy/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/BankkRoll/clipy/releases/tag/v1.0.0
