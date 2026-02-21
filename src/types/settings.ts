/**
 * Settings-related type definitions
 */

export interface AppSettings {
  general: GeneralSettings;
  download: DownloadSettings;
  editor: EditorSettings;
  appearance: AppearanceSettings;
  advanced: AdvancedSettings;
}

export interface GeneralSettings {
  language: string;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  checkForUpdates: boolean;
  autoUpdateBinaries: boolean;
}

export interface DownloadSettings {
  downloadPath: string;
  defaultQuality: string;
  defaultFormat: string;
  maxConcurrentDownloads: number;
  createChannelSubfolder: boolean;
  includeDateInFilename: boolean;
  embedThumbnail: boolean;
  embedMetadata: boolean;
  autoRetry: boolean;
  retryAttempts: number;

  // Filename template
  filenameTemplate?: string;

  // Audio settings (optional - have defaults in UI)
  audioFormat?: string;
  audioBitrate?: string;
  audioCodec?: string;

  // Video settings (optional - have defaults in UI)
  videoCodec?: string;
  crfQuality?: number;
  encodingPreset?: string;

  // Subtitle settings (optional - have defaults in UI)
  downloadSubtitles?: boolean;
  autoSubtitles?: boolean;
  embedSubtitles?: boolean;
  subtitleFormat?: string;
  subtitleLanguage?: string;

  // SponsorBlock settings (optional - have defaults in UI)
  sponsorBlock?: boolean;
  sponsorBlockCategories?: string[];

  // Chapter settings (optional - have defaults in UI)
  downloadChapters?: boolean;
  splitByChapters?: boolean;

  // Playlist settings
  playlistStart?: number;
  playlistEnd?: number;
  playlistItems?: string;

  // Network/Performance settings
  rateLimit?: string;
  concurrentFragments?: number;
  cookiesFromBrowser?: string;

  // File handling settings
  restrictFilenames?: boolean;
  useDownloadArchive?: boolean;

  // Write metadata files
  writeInfoJson?: boolean;
  writeDescription?: boolean;
  writeThumbnail?: boolean;

  // Geo-bypass settings
  geoBypass?: boolean;
}

export interface EditorSettings {
  defaultProjectSettings: {
    width: number;
    height: number;
    fps: number;
  };
  autoSave: boolean;
  autoSaveInterval: number;
  showWaveforms: boolean;
  snapToClips: boolean;
  snapToPlayhead: boolean;
  defaultTransitionDuration: number;
}

export interface AppearanceSettings {
  theme: Theme;
  accentColor: string;
  fontSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

export type Theme = "light" | "dark" | "system";

export interface AdvancedSettings {
  ffmpegPath: string;
  ytdlpPath: string;
  tempPath: string;
  cachePath: string;
  maxCacheSize: number;
  hardwareAcceleration: boolean;
  hardwareAccelerationType?: string;
  debugMode: boolean;
  proxyUrl: string;
}

export interface BinaryInfo {
  name: string;
  version: string;
  path: string;
  isInstalled: boolean;
  lastUpdated: string | null;
}
