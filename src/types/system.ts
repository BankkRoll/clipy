/**
 * System Types
 * Type definitions for app configuration, window state, and system info.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export interface PackageInfo {
  name: string
  version: string
  description: string
  license: string
  author:
    | string
    | {
        name: string
        url?: string
      }
  repository: {
    type: string
    url: string
  }
  homepage: string
  bugs: {
    url: string
  }
  keywords: string[]
}

export interface SystemInfo {
  appName: string
  appVersion: string
  os: string
  arch: string
  nodeVersion: string
  electronVersion: string
  packageInfo: PackageInfo | null
}

export interface StorageUsage {
  totalUsed: number
  available: number
  downloads: number
  cache: number
  temp: number
}

export interface StoragePaths {
  downloads: string
  cache: string
  temp: string
}

/**
 * Window state for persistence across sessions
 */
export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

export interface DownloadConfig {
  defaultVideoQuality: string
  videoFormat: 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus'
  downloadSubtitles: boolean
  downloadThumbnails: boolean
  saveMetadata: boolean
  createSubdirectories: boolean
  maxConcurrentDownloads: number
  autoRetryFailed: boolean
  downloadPath: string
  maxRetries: number
  timeoutMs: number
}

export interface EditorConfig {
  defaultCodec: 'copy' | 'h264' | 'h265'
  defaultQuality: 'low' | 'medium' | 'high'
  preferFastTrim: boolean
  defaultAudioFormat: 'mp3' | 'm4a' | 'opus' | 'wav'
}

export interface NotificationsConfig {
  downloadComplete: boolean
  downloadFailed: boolean
  soundEnabled: boolean
}

export interface PrivacyConfig {
  saveDownloadHistory: boolean
  saveRecentlyViewed: boolean
}

export interface KeyboardShortcut {
  action: string
  key: string
  modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[]
}

export interface AdvancedConfig {
  debugLogging: boolean
  ffmpegPath: string
  ytDlpPath: string
}

export interface AppConfig {
  theme: ThemeMode
  download: DownloadConfig
  editor: EditorConfig
  notifications: NotificationsConfig
  privacy: PrivacyConfig
  advanced: AdvancedConfig
  shortcuts: KeyboardShortcut[]
  cache: {
    maxSize: number
    maxAge: number
    cleanupInterval: number
  }
  storage: {
    tempPath: string
    cachePath: string
  }
  windowState?: WindowState
}
