/**
 * Application constants
 */

export const APP_NAME = "Clipy";
export const APP_VERSION = "2.0.0";

/**
 * Supported video quality options
 */
export const VIDEO_QUALITIES = [
  { value: "2160", label: "4K (2160p)", badge: "Best", description: "Highest quality" },
  { value: "1440", label: "1440p", badge: "2K", description: "High quality" },
  { value: "1080", label: "1080p", badge: "Recommended", description: "Full HD" },
  { value: "720", label: "720p", badge: null, description: "HD" },
  { value: "480", label: "480p", badge: null, description: "SD" },
  { value: "360", label: "360p", badge: null, description: "Low" },
  { value: "240", label: "240p", badge: null, description: "Very low" },
  { value: "144", label: "144p", badge: null, description: "Minimum" },
] as const;

/**
 * Supported video formats (containers)
 */
export const VIDEO_FORMATS = [
  { value: "mp4", label: "MP4", description: "Best compatibility", icon: "📹" },
  { value: "webm", label: "WebM", description: "Open format, smaller size", icon: "🌐" },
  { value: "mkv", label: "MKV", description: "High quality container", icon: "📼" },
  { value: "mov", label: "MOV", description: "Apple format", icon: "🍎" },
  { value: "avi", label: "AVI", description: "Legacy format", icon: "📺" },
] as const;

/**
 * Supported audio formats
 */
export const AUDIO_FORMATS = [
  { value: "mp3", label: "MP3", description: "Universal audio format", bitrates: [128, 192, 256, 320] },
  { value: "m4a", label: "M4A/AAC", description: "Apple audio format", bitrates: [128, 192, 256, 320] },
  { value: "opus", label: "Opus", description: "High quality, small size", bitrates: [64, 96, 128, 160, 192] },
  { value: "wav", label: "WAV", description: "Lossless audio (large)", bitrates: [] },
  { value: "flac", label: "FLAC", description: "Lossless compressed", bitrates: [] },
  { value: "aac", label: "AAC", description: "Advanced audio codec", bitrates: [128, 192, 256, 320] },
  { value: "vorbis", label: "Vorbis", description: "Open source codec", bitrates: [128, 192, 256, 320] },
] as const;

/**
 * Audio bitrate options
 */
export const AUDIO_BITRATES = [
  { value: "64", label: "64 kbps", description: "Low quality" },
  { value: "128", label: "128 kbps", description: "Standard quality" },
  { value: "192", label: "192 kbps", description: "Good quality" },
  { value: "256", label: "256 kbps", description: "High quality" },
  { value: "320", label: "320 kbps", description: "Best quality" },
] as const;

/**
 * Video codec options
 */
export const VIDEO_CODECS = [
  { value: "auto", label: "Auto", description: "Best available" },
  { value: "h264", label: "H.264/AVC", description: "Most compatible" },
  { value: "h265", label: "H.265/HEVC", description: "Better compression" },
  { value: "vp9", label: "VP9", description: "Google codec" },
  { value: "av1", label: "AV1", description: "Newest, best compression" },
] as const;

/**
 * Audio codec options
 */
export const AUDIO_CODECS = [
  { value: "auto", label: "Auto", description: "Best available" },
  { value: "aac", label: "AAC", description: "Most compatible" },
  { value: "opus", label: "Opus", description: "Modern, efficient" },
  { value: "mp3", label: "MP3", description: "Universal" },
  { value: "vorbis", label: "Vorbis", description: "Open source" },
] as const;

/**
 * Hardware acceleration options
 */
export const HW_ACCEL_TYPES = [
  { value: "auto", label: "Auto Detect", description: "Automatically detect best option" },
  { value: "nvenc", label: "NVIDIA NVENC", description: "NVIDIA GPU acceleration" },
  { value: "qsv", label: "Intel Quick Sync", description: "Intel GPU acceleration" },
  { value: "videotoolbox", label: "VideoToolbox", description: "macOS GPU acceleration" },
  { value: "vaapi", label: "VA-API", description: "Linux GPU acceleration" },
  { value: "amf", label: "AMD AMF", description: "AMD GPU acceleration" },
  { value: "none", label: "Software Only", description: "CPU-based encoding" },
] as const;

/**
 * FFmpeg encoding presets (x264/x265)
 */
export const ENCODING_PRESETS = [
  { value: "ultrafast", label: "Ultra Fast", description: "Fastest encoding, largest file" },
  { value: "superfast", label: "Super Fast", description: "Very fast encoding" },
  { value: "veryfast", label: "Very Fast", description: "Fast encoding" },
  { value: "faster", label: "Faster", description: "Faster than default" },
  { value: "fast", label: "Fast", description: "Fast encoding" },
  { value: "medium", label: "Medium", description: "Default balanced preset" },
  { value: "slow", label: "Slow", description: "Better compression" },
  { value: "slower", label: "Slower", description: "Even better compression" },
  { value: "veryslow", label: "Very Slow", description: "Best compression, slowest" },
] as const;

/**
 * Filename template placeholders
 */
export const FILENAME_PLACEHOLDERS = [
  { value: "%(title)s", label: "Title", description: "Video title" },
  { value: "%(uploader)s", label: "Uploader", description: "Channel/uploader name" },
  { value: "%(upload_date)s", label: "Upload Date", description: "YYYYMMDD format" },
  { value: "%(id)s", label: "Video ID", description: "Unique video identifier" },
  { value: "%(resolution)s", label: "Resolution", description: "e.g., 1920x1080" },
  { value: "%(height)s", label: "Height", description: "Video height in pixels" },
  { value: "%(ext)s", label: "Extension", description: "File extension" },
  { value: "%(duration)s", label: "Duration", description: "Video duration in seconds" },
  { value: "%(view_count)s", label: "Views", description: "View count" },
  { value: "%(playlist_index)s", label: "Playlist Index", description: "Position in playlist" },
] as const;

/**
 * Subtitle format options
 */
export const SUBTITLE_FORMATS = [
  { value: "srt", label: "SRT", description: "Most compatible" },
  { value: "vtt", label: "VTT", description: "Web Video Text Tracks" },
  { value: "ass", label: "ASS/SSA", description: "Advanced styling" },
  { value: "json3", label: "JSON", description: "YouTube format" },
] as const;

/**
 * Export format options (legacy alias)
 */
export const EXPORT_FORMATS = VIDEO_FORMATS;

/**
 * Export quality presets
 */
export const EXPORT_PRESETS = [
  {
    id: "youtube-4k",
    name: "YouTube 4K",
    format: "mp4",
    resolution: "3840x2160",
    bitrate: "45000k",
    audioBitrate: "320k",
  },
  {
    id: "youtube-1080p",
    name: "YouTube 1080p",
    format: "mp4",
    resolution: "1920x1080",
    bitrate: "12000k",
    audioBitrate: "256k",
  },
  {
    id: "youtube-720p",
    name: "YouTube 720p",
    format: "mp4",
    resolution: "1280x720",
    bitrate: "5000k",
    audioBitrate: "192k",
  },
  {
    id: "twitter",
    name: "Twitter/X",
    format: "mp4",
    resolution: "1280x720",
    bitrate: "6000k",
    audioBitrate: "192k",
  },
  {
    id: "instagram-reel",
    name: "Instagram Reel",
    format: "mp4",
    resolution: "1080x1920",
    bitrate: "8000k",
    audioBitrate: "192k",
  },
  {
    id: "tiktok",
    name: "TikTok",
    format: "mp4",
    resolution: "1080x1920",
    bitrate: "8000k",
    audioBitrate: "192k",
  },
] as const;

/**
 * Keyboard shortcuts
 */
export const KEYBOARD_SHORTCUTS = {
  // Playback
  PLAY_PAUSE: "Space",
  SEEK_BACK: "ArrowLeft",
  SEEK_FORWARD: "ArrowRight",
  FRAME_BACK: ",",
  FRAME_FORWARD: ".",
  GO_TO_START: "Home",
  GO_TO_END: "End",

  // Editing
  SPLIT: "s",
  DELETE: "Delete",
  UNDO: "Ctrl+z",
  REDO: "Ctrl+y",
  COPY: "Ctrl+c",
  PASTE: "Ctrl+v",
  CUT: "Ctrl+x",
  SELECT_ALL: "Ctrl+a",

  // Timeline
  ZOOM_IN: "+",
  ZOOM_OUT: "-",
  FIT_TO_VIEW: "Ctrl+0",

  // App
  SAVE: "Ctrl+s",
  EXPORT: "Ctrl+e",
  NEW_PROJECT: "Ctrl+n",
  OPEN_PROJECT: "Ctrl+o",
  SETTINGS: "Ctrl+,",
} as const;

/**
 * Timeline constants
 */
export const TIMELINE = {
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 1,
  SNAP_THRESHOLD: 10, // pixels
  TRACK_HEIGHT: 64, // pixels
  RULER_HEIGHT: 32, // pixels
  MIN_CLIP_WIDTH: 20, // pixels
  WAVEFORM_HEIGHT: 40, // pixels
} as const;

/**
 * Download constants
 */
export const DOWNLOAD = {
  MAX_CONCURRENT: 3,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // ms
  PROGRESS_UPDATE_INTERVAL: 100, // ms
} as const;

/**
 * Cache constants
 */
export const CACHE = {
  THUMBNAIL_MAX_AGE: 7 * 24 * 60 * 60 * 1000, // 7 days
  VIDEO_INFO_MAX_AGE: 60 * 60 * 1000, // 1 hour
  MAX_CACHE_SIZE: 500 * 1024 * 1024, // 500 MB
} as const;

/**
 * API endpoints (for yt-dlp)
 */
export const FFMPEG_DOWNLOAD_URL =
  "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
export const YTDLP_DOWNLOAD_URL =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
