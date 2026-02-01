import { ApiResponse } from './types/api'
import { DownloadOptions, DownloadProgress, DownloadFilter, DownloadListData, VideoInfo } from './types/download'
import { ThemeMode, AppConfig, SystemInfo, StorageUsage } from './types/system'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

/**
 * Secure Electron API exposed to renderer process
 * All IPC communication goes through this typed interface
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
    }) => Promise<ApiResponse<string | null>>
    saveDialog: (options?: {
      title?: string
      defaultPath?: string
      filters?: Electron.FileFilter[]
    }) => Promise<ApiResponse<Electron.SaveDialogReturnValue>>
    getStorageUsage: () => Promise<ApiResponse<StorageUsage>>
  }

  // Event listeners (secure wrapper)
  on: (channel: string, listener: (...args: any[]) => void) => void
  removeListener: (channel: string, listener: (...args: any[]) => void) => void
  once: (channel: string, listener: (...args: any[]) => void) => void
}

declare global {
  interface Window {
    /**
     * Secure Electron API - all main process communication goes through here
     */
    electronAPI: ElectronAPI
  }
}
