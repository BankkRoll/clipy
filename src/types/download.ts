export enum DownloadErrorCode {
  INVALID_URL = 'INVALID_URL',
  VIDEO_UNAVAILABLE = 'VIDEO_UNAVAILABLE',
  VIDEO_PRIVATE = 'VIDEO_PRIVATE',
  AGE_RESTRICTED = 'AGE_RESTRICTED',
  GEO_BLOCKED = 'GEO_BLOCKED',
  COPYRIGHT = 'COPYRIGHT',
  NETWORK_ERROR = 'NETWORK_ERROR',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  DISK_SPACE = 'DISK_SPACE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  DOWNLOAD_CANCELLED = 'DOWNLOAD_CANCELLED',
  TIMEOUT = 'TIMEOUT',
  NO_FORMAT_AVAILABLE = 'NO_FORMAT_AVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  STREAM_ERROR = 'STREAM_ERROR',
  NO_STREAMS = 'NO_STREAMS',
  MUXING_ERROR = 'MUXING_ERROR'
}

export interface DownloadError extends Error {
  readonly name: 'DownloadError';
  readonly code: DownloadErrorCode;
  readonly originalError?: Error;
  readonly retryable: boolean;
}

export function createDownloadError(
  message: string,
  code: DownloadErrorCode,
  originalError?: Error,
  retryable: boolean = false
): DownloadError {
  const error = Object.create(Error.prototype) as DownloadError;
  error.message = message;
  (error as any).name = 'DownloadError';
  (error as any).code = code;
  (error as any).originalError = originalError;
  (error as any).retryable = retryable;
  
  if (Error.captureStackTrace) {
    Error.captureStackTrace(error, createDownloadError);
  }
  
  return error;
}

export function isDownloadError(error: unknown): error is DownloadError {
  return error instanceof Error && error.name === 'DownloadError' && 'code' in error;
}

export type DownloadStatus = 
  | 'idle' 
  | 'initializing'
  | 'fetching-info'
  | 'downloading' 
  | 'processing' 
  | 'completed' 
  | 'failed' 
  | 'cancelled'
  | 'retrying';

export interface DownloadProgress {
  downloadId: string;
  url: string;
  title: string;
  progress: number;
  speed: string;
  eta: string;
  size: string;
  downloadedBytes: number;
  totalBytes: number;
  status: DownloadStatus;
  error?: DownloadError;
  filePath?: string;
  startTime: number;
  retryCount: number;
  provider?: DownloadProvider;
  usedProvider?: 'youtubejs' | 'ytdl-core';
}

export type VideoQuality = 'highest' | 'lowest' | 'highestaudio' | 'lowestaudio' | string;
export type VideoFormat = 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus';

export type DownloadProvider = 'youtubejs' | 'ytdl-core' | 'auto';

export interface DownloadOptions {
  quality?: VideoQuality;
  format?: VideoFormat;
  outputPath?: string;
  filename?: string;
  downloadSubtitles?: boolean;
  downloadThumbnail?: boolean;
  saveMetadata?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  overwrite?: boolean;
  createSubdirectories?: boolean;
  startTime?: number;
  endTime?: number;
  provider?: DownloadProvider;
}

export interface VideoThumbnail {
  url: string;
  width: number;
  height: number;
  subscriberCount?: number;
}

export interface VideoChannel {
  name: string;
  id: string;
  thumbnail?: string;
  verified?: boolean;
  subscriberCount?: number;
}

export interface CaptionTrack {
  lang: string;
  url: string;
}

export interface VideoFormatInfo {
  itag: number;
  quality: string;
  qualityLabel?: string;
  format: string;
  container: string;
  bitrate?: number;
  audioBitrate?: number;
  fps?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  hasVideo: boolean;
  audioCodec?: string;
  videoCodec?: string;
  mimeType?: string;
  url?: string;
  contentLength?: number;
}

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  duration: number;
  durationFormatted: string;
  channel: VideoChannel;
  thumbnails: VideoThumbnail[];
  views: number;
  viewsFormatted: string;
  uploadDate: string;
  tags: string[];
  category?: string;
  language?: string;
  isLive: boolean;
  isPrivate: boolean;
  ageRestricted: boolean;
  formats: VideoFormatInfo[];
  captions?: CaptionTrack[];
  bestVideoFormat?: VideoFormatInfo;
  bestAudioFormat?: VideoFormatInfo;
  availableQualities: string[];
}

export interface DownloadConfig {
  maxConcurrentDownloads: number;
  defaultOutputPath: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  chunkSizeBytes: number;
}

export interface DownloadManagerEvents {
  progress: (progress: DownloadProgress) => void;
  completed: (progress: DownloadProgress) => void;
  failed: (progress: DownloadProgress) => void;
  initialized: (success: boolean) => void;
}

export type DownloadFilter = 'active' | 'completed' | 'failed' | 'all';

export interface DownloadListData {
  downloads: DownloadProgress[];
  count: number;
  filter: string;
}

import type {
  DownloadCancelResponse,
  DownloadListResponse,
  DownloadProgressResponse,
  DownloadStartResponse,
  VideoInfoResponse
} from './api';

export interface DownloadManagerContext {
  start: (url: string, options?: DownloadOptions) => Promise<DownloadStartResponse>;
  getProgress: (downloadId?: string) => Promise<DownloadProgressResponse>;
  cancel: (downloadId: string) => Promise<DownloadCancelResponse>;
  list: (filter?: DownloadFilter) => Promise<DownloadListResponse>;
  getInfo: (url: string) => Promise<VideoInfoResponse>;
} 