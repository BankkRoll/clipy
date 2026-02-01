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

export interface AppConfig {
  theme: ThemeMode
  download: DownloadConfig
  cache: {
    maxSize: number
    maxAge: number
    cleanupInterval: number
  }
  storage: {
    tempPath: string
    cachePath: string
  }
}
