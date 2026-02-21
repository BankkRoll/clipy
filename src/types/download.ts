/**
 * Download-related type definitions
 */

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
  quality: string;
  format: string;
  outputPath: string;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  duration: number;
  channel: string;
  /** Current download phase for better UX */
  phase?: DownloadPhase;
  /** Message describing current activity */
  message?: string;
  // Extended fields
  audioOnly?: boolean;
  audioFormat?: string;
  audioBitrate?: string;
  subtitles?: boolean;
  subtitleLanguage?: string;
}

export type DownloadPhase =
  | "fetching"
  | "downloading_video"
  | "downloading_audio"
  | "downloading_subtitles"
  | "merging"
  | "processing"
  | "embedding_metadata"
  | "complete";

export type DownloadStatus =
  | "pending"
  | "fetching"
  | "downloading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

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

  // Geo-bypass
  geoBypass: boolean;
}

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
  sponsorBlockCategories: ["sponsor", "intro", "outro"],
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
  geoBypass: false,
};

export interface DownloadProgress {
  downloadId: string;
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  /** The actual file path when download is completed */
  filePath?: string;
  /** Current phase of the download */
  phase?: DownloadPhase;
  /** Human-readable message about current activity */
  message?: string;
}

export interface DownloadHistoryItem {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  quality: string;
  format: string;
  fileSize: number;
  filePath: string;
  downloadedAt: string;
}

// SponsorBlock categories
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

// Common subtitle languages
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
