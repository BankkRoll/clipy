export interface AppConfig {
  download: DownloadConfig;
  editor: EditorConfig;
  storage: StorageConfig;
}

export interface DownloadConfig {
  defaultVideoQuality: string;
  videoFormat: 'mp4' | 'webm' | 'mkv';
  downloadSubtitles: boolean;
  downloadThumbnails: boolean;
  saveMetadata: boolean;
  createSubdirectories: boolean;
  concurrentDownloads: number;
  autoRetryFailed: boolean;
  downloadPath: string;
}

export interface EditorConfig {
  hardwareAcceleration: boolean;
  autoSaveProjects: boolean;
  realtimePreview: boolean;
}

export interface StorageConfig {
  tempPath: string;
  cachePath: string;
} 