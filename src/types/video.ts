/**
 * Video-related type definitions
 */

export interface VideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: number;
  channel: string;
  channelId: string;
  uploadDate: string;
  viewCount: number;
  likeCount: number;
  formats: VideoFormat[];
  isLive: boolean;
  isPrivate: boolean;
}

export interface VideoFormat {
  formatId: string;
  extension: string;
  resolution: string;
  width: number;
  height: number;
  fps: number;
  vcodec: string;
  acodec: string;
  filesize: number | null;
  filesizeApprox: number | null;
  tbr: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface LibraryVideo {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  filePath: string;
  fileSize: number;
  format: string;
  resolution: string;
  downloadedAt: string;
  sourceUrl: string;
}

export type VideoQuality = "2160" | "1440" | "1080" | "720" | "480" | "360";

export type VideoContainer = "mp4" | "webm" | "mkv";

export type AudioFormat = "mp3" | "m4a" | "opus" | "wav";
