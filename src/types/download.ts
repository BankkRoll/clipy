/**
 * Download-related type definitions.
 *
 * Shapes that cross the IPC boundary mirror the serde models in
 * `src-tauri/src/models/download.rs` (camelCase field names).
 */

/** A download as tracked by the frontend download store. */
export interface Download {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  /** Display label, e.g. `1080p` or `Audio`. */
  quality: string;
  format: string;
  /**
   * Output directory the download was started with. Not a playable file: use
   * {@link Download.filePath} once the backend reports completion.
   */
  outputPath: string;
  /** Final file on disk; only known once the backend reports completion. */
  filePath?: string | undefined;
  /** Failure reason reported by the backend. */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  duration: number;
  channel: string;
  /** Current download phase for better UX */
  phase?: DownloadPhase | undefined;
  /** Message describing current activity */
  message?: string | undefined;
}

/**
 * A download task as returned by the backend `get_downloads` command.
 * Mirrors `DownloadTask` in `src-tauri/src/models/download.rs`.
 */
export interface DownloadTask {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  /** Raw quality value, e.g. `1080` or `best`. */
  quality: string;
  format: string;
  /** Output directory while running; the final file path once completed. */
  outputPath: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  duration: number;
  channel: string;
  options?: DownloadOptions;
}

/** Fine-grained phase of an in-flight download. */
export type DownloadPhase =
  | "fetching"
  | "downloading_video"
  | "downloading_audio"
  | "downloading_subtitles"
  | "merging"
  | "processing"
  | "embedding_metadata"
  | "complete";

/** Lifecycle status of a download; matches the backend `DownloadStatus` enum. */
export type DownloadStatus =
  | "pending"
  | "fetching"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

/**
 * Options for `start_download`. Must match `DownloadOptions` in
 * `src-tauri/src/models/download.rs` field-for-field (enforced by a test).
 */
export interface DownloadOptions {
  // Basic options
  quality: string;
  format: string;
  audioOnly: boolean;
  outputPath: string;
  filename: string;

  // Metadata options
  embedThumbnail: boolean;
  embedMetadata: boolean;

  // Audio options
  audioFormat: string;
  audioBitrate: string;

  // Video options
  videoCodec: string;
  audioCodec: string;

  // Subtitle options
  downloadSubtitles: boolean;
  subtitleLanguages: string[];
  subtitleFormat: string;
  embedSubtitles: boolean;
  autoSubtitles: boolean;

  // Advanced options
  sponsorBlock: boolean;
  sponsorBlockCategories: string[];
  downloadChapters: boolean;
  splitByChapters: boolean;
  writeDescription: boolean;
  writeComments: boolean;
  writeThumbnail: boolean;
  keepOriginal: boolean;

  // Limits
  maxFilesize: string;
  rateLimit: string;

  // Playlist options
  playlistItems: string;
  noPlaylist: boolean;

  // Post-processing
  extractAudio: boolean;
  remuxVideo: string;
  convertThumbnails: string;

  // Cookies
  cookiesFromBrowser: string;

  // Network/Performance
  concurrentFragments: number;
  proxyUrl: string;

  // File handling
  restrictFilenames: boolean;
  useDownloadArchive: boolean;

  // Filename / organization
  createChannelSubfolder: boolean;
  includeDateInFilename: boolean;
  filenameTemplate: string;

  // Write metadata files
  writeInfoJson: boolean;

  // Geo-bypass
  geoBypass: boolean;
}

/** Backend-equivalent defaults for {@link DownloadOptions}. */
export const DEFAULT_DOWNLOAD_OPTIONS: DownloadOptions = {
  quality: "1080",
  format: "mp4",
  audioOnly: false,
  outputPath: "",
  filename: "",
  embedThumbnail: true,
  embedMetadata: true,
  audioFormat: "m4a",
  audioBitrate: "192",
  videoCodec: "auto",
  audioCodec: "auto",
  downloadSubtitles: false,
  subtitleLanguages: ["en"],
  subtitleFormat: "srt",
  embedSubtitles: false,
  autoSubtitles: false,
  sponsorBlock: false,
  sponsorBlockCategories: ["sponsor"],
  downloadChapters: false,
  splitByChapters: false,
  writeDescription: false,
  writeComments: false,
  writeThumbnail: false,
  keepOriginal: false,
  maxFilesize: "",
  rateLimit: "",
  playlistItems: "",
  noPlaylist: true,
  extractAudio: false,
  remuxVideo: "",
  convertThumbnails: "",
  cookiesFromBrowser: "",
  concurrentFragments: 1,
  proxyUrl: "",
  restrictFilenames: false,
  useDownloadArchive: false,
  createChannelSubfolder: false,
  includeDateInFilename: false,
  filenameTemplate: "",
  writeInfoJson: false,
  geoBypass: false,
};

/** Payload of the backend `download-progress` event. */
export interface DownloadProgress {
  downloadId: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  /** The actual file path when download is completed */
  filePath?: string | undefined;
  /** Current phase of the download */
  phase?: DownloadPhase | undefined;
  /** Human-readable activity message, or the failure reason when `status` is `failed`. */
  message?: string | undefined;
}

/** SponsorBlock segment categories offered in the UI. */
export const SPONSORBLOCK_CATEGORIES = [
  { value: "sponsor", label: "Sponsor", description: "Paid promotion" },
  { value: "intro", label: "Intro", description: "Intermission/intro animation" },
  { value: "outro", label: "Outro", description: "End credits/outro" },
  { value: "selfpromo", label: "Self-Promo", description: "Self promotion" },
  { value: "preview", label: "Preview", description: "Preview/recap" },
  { value: "filler", label: "Filler", description: "Tangent/filler content" },
  { value: "interaction", label: "Interaction", description: "Like/subscribe reminder" },
  { value: "music_offtopic", label: "Music", description: "Non-music in music video" },
] as const;

/** Common subtitle languages offered in the UI. */
export const SUBTITLE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
] as const;
