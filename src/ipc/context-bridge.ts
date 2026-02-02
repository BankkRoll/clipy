/**
 * Context Bridge Setup
 * Securely exposes Electron APIs to the renderer process
 */

import { ALLOWED_BROADCAST_CHANNELS, IPC_CHANNELS } from './channels'
import { AppConfig, StoragePaths, ThemeMode } from '@/types/system'
import { DownloadFilter, DownloadListData, DownloadOptions, DownloadProgress, VideoInfo } from '@/types/download'
import { contextBridge, ipcRenderer } from 'electron'

import { ApiResponse } from '@/types/api'

// Video processing types
interface TrimOptions {
  inputPath: string
  outputPath?: string
  startTime: number
  endTime: number
  quality?: 'low' | 'medium' | 'high'
  codec?: 'copy' | 'h264' | 'h265'
}

interface ThumbnailOptions {
  inputPath: string
  outputDir?: string
  count?: number
  interval?: number
  width?: number
}

interface WaveformOptions {
  inputPath: string
  samples?: number
}

interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

// Define the secure API interface
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
    get: () => Promise<ThemeMode>
    set: (theme: ThemeMode) => Promise<void>
    toggle: () => Promise<ThemeMode>
    system: () => Promise<ThemeMode>
  }

  // Shell operations
  shell: {
    openPath: (filePath: string) => Promise<void>
    showItemInFolder: (filePath: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
  }

  // Download operations
  downloadManager: {
    start: (url: string, options?: DownloadOptions) => Promise<{ downloadId: string; message: string }>
    cancel: (downloadId: string) => Promise<{ downloadId: string; message: string }>
    delete: (downloadId: string) => Promise<{ downloadId: string; message: string }>
    retry: (downloadId: string) => Promise<{ downloadId: string; message: string }>
    getProgress: (downloadId?: string) => Promise<DownloadProgress | DownloadProgress[]>
    list: (filter?: DownloadFilter) => Promise<DownloadListData>
    getInfo: (url: string) => Promise<VideoInfo>
    getStreamingInfo: (url: string) => Promise<{
      videoInfo: VideoInfo
      streamingUrl: string | null
      audioUrl: string | null
      fallbackUrl: string | null
    }>
  }

  // File operations
  fileSystem: {
    exists: (filePath: string) => Promise<boolean>
    read: (filePath: string) => Promise<ApiResponse<Uint8Array | null>>
    write: (filePath: string, data: Uint8Array) => Promise<ApiResponse<void>>
    delete: (filePath: string) => Promise<ApiResponse<void>>
  }

  // Storage operations
  storage: {
    load: () => Promise<any>
    save: (data: any) => Promise<void>
    clear: (type?: 'downloads' | 'cache' | 'temp') => Promise<void>
  }

  // Configuration operations
  config: {
    get: () => Promise<AppConfig>
    update: (updates: Partial<AppConfig>) => Promise<AppConfig>
    reset: () => Promise<AppConfig>
  }

  // System operations
  system: {
    getInfo: () => Promise<SystemInfo>
    openDialog: (options?: OpenDialogOptions) => Promise<string | null>
    saveDialog: (options?: SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
    getStorageUsage: () => Promise<StorageUsage>
    getStoragePaths: () => Promise<StoragePaths>
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

  // Event listeners
  on: (channel: string, listener: (...args: any[]) => void) => void
  removeListener: (channel: string, listener: (...args: any[]) => void) => void
  once: (channel: string, listener: (...args: any[]) => void) => void
}

// System info interface
interface SystemInfo {
  appName: string
  appVersion: string
  os: string
  arch: string
  nodeVersion: string
  electronVersion: string
  packageInfo?: any
}

// Dialog options
interface OpenDialogOptions {
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
}

interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Electron.FileFilter[]
}

// Storage usage interface
interface StorageUsage {
  available: number
  downloads: number
  cache: number
  temp: number
  totalUsed: number
}

/**
 * Create secure API wrapper functions
 */
function createSecureAPI(): ElectronAPI {
  return {
    // Window operations
    window: {
      minimize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
      maximize: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MAXIMIZE),
      close: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
      isMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    },

    // Theme operations
    theme: {
      get: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_GET),
      set: (theme: ThemeMode) => ipcRenderer.invoke(IPC_CHANNELS.THEME_SET, theme),
      toggle: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_TOGGLE),
      system: () => ipcRenderer.invoke(IPC_CHANNELS.THEME_SYSTEM),
    },

    // Shell operations
    shell: {
      openPath: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_PATH, filePath),
      showItemInFolder: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, filePath),
      openExternal: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),
    },

    // Download operations
    downloadManager: {
      start: (url: string, options?: DownloadOptions) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_START, url, options),
      cancel: (downloadId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_CANCEL, downloadId),
      delete: (downloadId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_DELETE, downloadId),
      retry: (downloadId: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_RETRY, downloadId),
      getProgress: (downloadId?: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_PROGRESS, downloadId),
      list: (filter?: DownloadFilter) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_LIST, filter),
      getInfo: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_INFO, url),
      getStreamingInfo: (url: string) => ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_STREAMING_INFO, url),
    },

    // File operations
    fileSystem: {
      exists: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_EXISTS, filePath),
      read: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
      write: (filePath: string, data: Uint8Array) => ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, data),
      delete: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_DELETE, filePath),
    },

    // Storage operations
    storage: {
      load: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD),
      save: (data: any) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE, data),
      clear: (type?: 'downloads' | 'cache' | 'temp') => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_CLEAR, type),
    },

    // Configuration operations
    config: {
      get: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET),
      update: (updates: Partial<AppConfig>) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_UPDATE, updates),
      reset: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_RESET),
    },

    // System operations
    system: {
      getInfo: () => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_INFO),
      openDialog: (options?: OpenDialogOptions) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_OPEN_DIALOG, options),
      saveDialog: (options?: SaveDialogOptions) => ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_SAVE_DIALOG, options),
      getStorageUsage: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_USAGE),
      getStoragePaths: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_PATHS),
    },

    // Video processing operations
    videoProcessor: {
      getInfo: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_INFO, filePath),
      trim: (options: TrimOptions) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_TRIM, options),
      preview: (inputPath: string, timePosition: number) =>
        ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PREVIEW, inputPath, timePosition),
      getThumbnails: (options: ThumbnailOptions) => ipcRenderer.invoke('video:thumbnails', options),
      getWaveform: (options: WaveformOptions) => ipcRenderer.invoke('video:waveform', options),
    },

    // Streaming proxy operations (for YouTube video preview)
    streamingProxy: {
      getProxyUrl: (streamUrl: string) => ipcRenderer.invoke(IPC_CHANNELS.PROXY_GET_URL, streamUrl),
      getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.PROXY_STATUS),
    },

    // Event listeners (secure wrapper)
    // Uses ALLOWED_BROADCAST_CHANNELS from channels.ts as single source of truth
    on: (channel: string, listener: (...args: any[]) => void) => {
      // Only allow specific channels for security (type-safe check)
      if ((ALLOWED_BROADCAST_CHANNELS as readonly string[]).includes(channel)) {
        ipcRenderer.on(channel, listener)
      } else {
        console.warn(`Attempted to listen to unauthorized channel: ${channel}`)
      }
    },

    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      if ((ALLOWED_BROADCAST_CHANNELS as readonly string[]).includes(channel)) {
        ipcRenderer.removeListener(channel, listener)
      }
    },

    once: (channel: string, listener: (...args: any[]) => void) => {
      if ((ALLOWED_BROADCAST_CHANNELS as readonly string[]).includes(channel)) {
        ipcRenderer.once(channel, listener)
      }
    },
  }
}

/**
 * Setup the context bridge
 * This exposes the secure API to the renderer process
 */
export function setupContextBridge(): void {
  try {
    // Expose the secure API to the renderer
    contextBridge.exposeInMainWorld('electronAPI', createSecureAPI())

    console.log('Context bridge initialized successfully')
  } catch (error) {
    console.error('Failed to setup context bridge:', error)

    // Fallback for development
    if (process.env.NODE_ENV === 'development') {
      // @ts-ignore - For development only
      window.electronAPI = createSecureAPI()
    }
  }
}
