/**
 * Factories for backend payloads used across tests.
 *
 * Every factory returns a fresh object shaped exactly like the Rust serde
 * output (camelCase) with the backend's defaults, and accepts a deep-ish
 * partial override for the fields a test cares about.
 */
import type { AppSettings } from "@/hooks/useSettings";
import type { BinaryStatus, CacheStats } from "@/hooks/useTauri";
import type { LibraryStats, LibraryVideo } from "@/hooks/useLibrary";
import type { Download, DownloadProgress, DownloadTask } from "@/types/download";
import type { VideoFormat, VideoInfo } from "@/types/video";

type SettingsOverrides = { [K in keyof AppSettings]?: Partial<AppSettings[K]> };

/**
 * Backend settings with the defaults from `src-tauri/src/models/settings.rs`.
 *
 * @param overrides - Per-section partial overrides.
 * @returns A complete settings object.
 */
export function settingsFixture(overrides: SettingsOverrides = {}): AppSettings {
  return {
    general: {
      language: "en",
      launchOnStartup: false,
      minimizeToTray: false,
      closeToTray: false,
      checkForUpdates: true,
      autoUpdateBinaries: true,
      ...overrides.general,
    },
    download: {
      downloadPath: "C:\\Users\\me\\Videos\\Clipy",
      defaultQuality: "1080",
      defaultFormat: "mp4",
      maxConcurrentDownloads: 3,
      createChannelSubfolder: false,
      includeDateInFilename: false,
      embedThumbnail: true,
      embedMetadata: true,
      autoRetry: true,
      retryAttempts: 3,
      filenameTemplate: "%(title)s.%(ext)s",
      audioFormat: "m4a",
      audioBitrate: "192",
      audioCodec: "auto",
      videoCodec: "auto",
      crfQuality: 23,
      encodingPreset: "medium",
      downloadSubtitles: false,
      autoSubtitles: false,
      embedSubtitles: false,
      subtitleFormat: "srt",
      subtitleLanguage: "en",
      sponsorBlock: false,
      sponsorBlockCategories: ["sponsor"],
      downloadChapters: false,
      splitByChapters: false,
      playlistStart: 0,
      playlistEnd: 0,
      playlistItems: "",
      rateLimit: "",
      concurrentFragments: 1,
      cookiesFromBrowser: "",
      restrictFilenames: false,
      useDownloadArchive: false,
      writeInfoJson: false,
      writeDescription: false,
      writeThumbnail: false,
      geoBypass: false,
      ...overrides.download,
    },
    editor: {
      defaultProjectWidth: 1920,
      defaultProjectHeight: 1080,
      defaultProjectFps: 30,
      autoSave: true,
      autoSaveInterval: 60,
      showWaveforms: true,
      snapToClips: true,
      snapToPlayhead: true,
      defaultTransitionDuration: 0.5,
      ...overrides.editor,
    },
    appearance: {
      theme: "system",
      accentColor: "#3b82f6",
      fontSize: "medium",
      reducedMotion: false,
      ...overrides.appearance,
    },
    advanced: {
      ffmpegPath: "",
      ytdlpPath: "",
      tempPath: "",
      cachePath: "",
      maxCacheSize: 500,
      hardwareAcceleration: true,
      hardwareAccelerationType: "auto",
      debugMode: false,
      proxyUrl: "",
      ...overrides.advanced,
    },
  };
}

/**
 * A downloadable format entry.
 *
 * @param overrides - Fields to change.
 * @returns A video format.
 */
export function formatFixture(overrides: Partial<VideoFormat> = {}): VideoFormat {
  return {
    formatId: "137",
    extension: "mp4",
    resolution: "1920x1080",
    width: 1920,
    height: 1080,
    fps: 30,
    vcodec: "avc1",
    acodec: "none",
    filesize: 1000,
    filesizeApprox: null,
    tbr: 4000,
    hasVideo: true,
    hasAudio: false,
    ...overrides,
  };
}

/**
 * Result of `fetch_video_info`.
 *
 * @param overrides - Fields to change.
 * @returns Video metadata with a 1080p format.
 */
export function videoInfoFixture(overrides: Partial<VideoInfo> = {}): VideoInfo {
  return {
    id: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    description: "Official video",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    duration: 213,
    channel: "Rick Astley",
    channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
    uploadDate: "20091025",
    viewCount: 1500000000,
    likeCount: 16000000,
    formats: [formatFixture()],
    isLive: false,
    isPrivate: false,
    ...overrides,
  };
}

/**
 * A `download-progress` event payload.
 *
 * @param overrides - Fields to change; `downloadId` defaults to `d1`.
 * @returns A progress payload.
 */
export function progressFixture(overrides: Partial<DownloadProgress> = {}): DownloadProgress {
  return {
    downloadId: "d1",
    status: "downloading",
    progress: 42,
    downloadedBytes: 4200,
    totalBytes: 10000,
    speed: 1024,
    eta: 30,
    ...overrides,
  };
}

/**
 * A backend download task (`get_downloads`).
 *
 * @param overrides - Fields to change.
 * @returns A download task.
 */
export function downloadTaskFixture(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return {
    id: "d1",
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    status: "downloading",
    progress: 10,
    downloadedBytes: 100,
    totalBytes: 1000,
    speed: 10,
    eta: 90,
    quality: "1080",
    format: "mp4",
    outputPath: "C:\\Users\\me\\Videos\\Clipy",
    error: null,
    createdAt: "2026-01-01T00:00:00Z",
    completedAt: null,
    duration: 213,
    channel: "Rick Astley",
    ...overrides,
  };
}

/**
 * A row in the frontend download store.
 *
 * @param overrides - Fields to change.
 * @returns A download.
 */
export function downloadFixture(overrides: Partial<Download> = {}): Download {
  return {
    id: "d1",
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    eta: 0,
    quality: "1080p",
    format: "mp4",
    outputPath: "C:\\Users\\me\\Videos\\Clipy",
    error: null,
    createdAt: "2026-01-01T00:00:00Z",
    completedAt: null,
    duration: 213,
    channel: "Rick Astley",
    ...overrides,
  };
}

/**
 * A library entry (`get_library_videos`).
 *
 * @param overrides - Fields to change.
 * @returns A library video.
 */
export function libraryVideoFixture(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    id: "v1",
    videoId: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    duration: 213,
    channel: "Rick Astley",
    filePath: "C:\\Users\\me\\Videos\\Clipy\\rick.mp4",
    fileSize: 50 * 1024 * 1024,
    format: "mp4",
    resolution: "1080p",
    downloadedAt: "2026-01-01T00:00:00Z",
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    ...overrides,
  };
}

/**
 * Library totals (`get_library_stats`).
 *
 * @param overrides - Fields to change.
 * @returns Library stats.
 */
export function libraryStatsFixture(overrides: Partial<LibraryStats> = {}): LibraryStats {
  return { totalVideos: 1, totalSize: 1024, totalDuration: 213, uniqueChannels: 1, ...overrides };
}

/**
 * Result of `check_binaries`.
 *
 * @param overrides - Fields to change; both tools installed by default.
 * @returns Binary status.
 */
export function binaryStatusFixture(overrides: Partial<BinaryStatus> = {}): BinaryStatus {
  return {
    ffmpegInstalled: true,
    ffmpegVersion: "7.0",
    ffmpegPath: "/bin/ffmpeg",
    ytdlpInstalled: true,
    ytdlpVersion: "2026.01.01",
    ytdlpPath: "/bin/yt-dlp",
    ...overrides,
  };
}

/**
 * Result of `get_cache_stats`.
 *
 * @param overrides - Fields to change.
 * @returns Cache stats.
 */
export function cacheStatsFixture(overrides: Partial<CacheStats> = {}): CacheStats {
  return {
    totalSize: 2048,
    thumbnailCount: 1,
    thumbnailSize: 1024,
    tempFileCount: 1,
    tempFileSize: 1024,
    ...overrides,
  };
}
