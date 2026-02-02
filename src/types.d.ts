/**
 * Clipy - Global Type Definitions
 *
 * This file declares types that are available globally:
 * - Vite build constants
 * - Video processing interfaces
 * - ElectronAPI interface (exposed via contextBridge)
 */

import { ApiResponse } from './types/api'
import { DownloadOptions, DownloadProgress, DownloadFilter, DownloadListData, VideoInfo } from './types/download'
import { ThemeMode, AppConfig, SystemInfo, StorageUsage, StoragePaths } from './types/system'

// Vite injects these at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

// ============================================================================
// Video Processing Types
// ============================================================================

/** FFprobe metadata extracted from a video file */
interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

/** Options for video trimming operation */
interface TrimOptions {
  inputPath: string
  outputPath?: string
  startTime: number
  endTime: number
  quality?: 'low' | 'medium' | 'high'
  codec?: 'copy' | 'h264' | 'h265' // 'copy' = no re-encode (fast but may have seek issues)
}

/** Options for generating thumbnail images from video */
interface ThumbnailOptions {
  inputPath: string
  outputDir?: string
  count?: number
  interval?: number
  width?: number
}

/** Options for extracting audio waveform data */
interface WaveformOptions {
  inputPath: string
  samples?: number
}

// ============================================================================
// Electron API - Exposed to Renderer via contextBridge
// ============================================================================

/**
 * Secure API for renderer-to-main process communication.
 * All methods return ApiResponse for consistent error handling.
 * See src/ipc/context-bridge.ts for implementation.
 */
interface ElectronAPI {
  // Window operations
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
  }

  // Theme operations
  theme: {
    get: () => Promise<ApiResponse<ThemeMode>>
    set: (theme: ThemeMode) => Promise<ApiResponse<void>>
    toggle: () => Promise<ApiResponse<ThemeMode>>
    system: () => Promise<ApiResponse<ThemeMode>>
  }

  // Shell operations
  shell: {
    openPath: (filePath: string) => Promise<ApiResponse<void>>
    showItemInFolder: (filePath: string) => Promise<ApiResponse<void>>
    openExternal: (url: string) => Promise<ApiResponse<void>>
  }

  // Download operations
  downloadManager: {
    start: (url: string, options?: DownloadOptions) => Promise<ApiResponse<{ downloadId: string; message: string }>>
    cancel: (downloadId: string) => Promise<ApiResponse<{ downloadId: string; message: string }>>
    delete: (downloadId: string) => Promise<ApiResponse<{ downloadId: string; message: string }>>
    retry: (downloadId: string) => Promise<ApiResponse<{ downloadId: string; message: string }>>
    getProgress: (downloadId?: string) => Promise<ApiResponse<DownloadProgress | DownloadProgress[]>>
    list: (filter?: DownloadFilter) => Promise<ApiResponse<DownloadListData>>
    getInfo: (url: string) => Promise<ApiResponse<VideoInfo>>
    getStreamingInfo: (url: string) => Promise<
      ApiResponse<{
        videoInfo: VideoInfo
        streamingUrl: string | null
        audioUrl: string | null
        fallbackUrl: string | null
      }>
    >
  }

  // File operations
  fileSystem: {
    exists: (filePath: string) => Promise<ApiResponse<boolean>>
    read: (filePath: string) => Promise<ApiResponse<Buffer | null>>
    write: (filePath: string, data: Buffer) => Promise<ApiResponse<void>>
    delete: (filePath: string) => Promise<ApiResponse<void>>
  }

  // Storage operations
  storage: {
    load: () => Promise<ApiResponse<any>>
    save: (data: any) => Promise<ApiResponse<void>>
    clear: (type?: 'downloads' | 'cache' | 'temp') => Promise<ApiResponse<void>>
  }

  // Configuration operations
  config: {
    get: () => Promise<ApiResponse<AppConfig>>
    update: (updates: Partial<AppConfig>) => Promise<ApiResponse<AppConfig>>
    reset: () => Promise<ApiResponse<AppConfig>>
  }

  // System operations
  system: {
    getInfo: () => Promise<ApiResponse<SystemInfo>>
    openDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: Electron.FileFilter[]
      properties?: Array<
        | 'openFile'
        | 'openDirectory'
        | 'multiSelections'
        | 'showHiddenFiles'
        | 'createDirectory'
        | 'promptToCreate'
        | 'noResolveAliases'
        | 'treatPackageAsDirectory'
        | 'dontAddToRecent'
      >
    }) => Promise<ApiResponse<string | null>>
    saveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: Electron.FileFilter[]
    }) => Promise<ApiResponse<Electron.SaveDialogReturnValue>>
    getStorageUsage: () => Promise<ApiResponse<StorageUsage>>
    getStoragePaths: () => Promise<ApiResponse<StoragePaths>>
  }

  // Video processing operations
  videoProcessor: {
    getInfo: (filePath: string) => Promise<ApiResponse<VideoMetadata>>
    trim: (options: TrimOptions) => Promise<ApiResponse<{ outputPath: string; duration: number }>>
    preview: (inputPath: string, timePosition: number) => Promise<ApiResponse<{ outputPath: string }>>
    getThumbnails: (
      options: ThumbnailOptions,
    ) => Promise<ApiResponse<{ thumbnails: string[]; interval: number; duration: number }>>
    getWaveform: (options: WaveformOptions) => Promise<ApiResponse<{ waveform: number[]; samples: number }>>
  }

  // Streaming proxy operations (for YouTube video preview)
  streamingProxy: {
    getProxyUrl: (streamUrl: string) => Promise<ApiResponse<{ proxyUrl: string }>>
    getStatus: () => Promise<ApiResponse<{ running: boolean; port: number }>>
  }

  // Event listeners - secure wrapper around ipcRenderer.on/off
  // Only whitelisted channels are allowed (see ALLOWED_CHANNELS in context-bridge.ts)
  on: (channel: string, listener: (...args: any[]) => void) => void
  removeListener: (channel: string, listener: (...args: any[]) => void) => void
  once: (channel: string, listener: (...args: any[]) => void) => void
}

// ============================================================================
// Global Window Augmentation
// ============================================================================

declare global {
  interface Window {
    /** Electron IPC API - only available in Electron renderer process */
    electronAPI: ElectronAPI
  }
}
