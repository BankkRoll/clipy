/**
 * Context Bridge Setup
 * Securely exposes Electron APIs to the renderer process
 */

import { DownloadFilter, DownloadListData, DownloadOptions, DownloadProgress, VideoInfo } from '@/types/download'
import { AppConfig, StoragePaths, ThemeMode } from '@/types/system'
import { contextBridge, ipcRenderer } from 'electron'

import { ApiResponse } from '@/types/api'
import { IPC_CHANNELS } from './channels'

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
  }

  // File operations
  fileSystem: {
    exists: (filePath: string) => Promise<boolean>
    read: (filePath: string) => Promise<ApiResponse<Buffer | null>>
    write: (filePath: string, data: Buffer) => Promise<ApiResponse<void>>
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
    },

    // File operations
    fileSystem: {
      exists: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_EXISTS, filePath),
      read: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.FILE_READ, filePath),
      write: (filePath: string, data: Buffer) => ipcRenderer.invoke(IPC_CHANNELS.FILE_WRITE, filePath, data),
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

    // Event listeners (secure wrapper)
    on: (channel: string, listener: (...args: any[]) => void) => {
      // Only allow specific channels for security
      const allowedChannels = [
        'download-progress-update',
        'download-completed',
        'download-failed',
        'download-deleted',
        'theme-changed',
      ]

      if (allowedChannels.includes(channel)) {
        ipcRenderer.on(channel, listener)
      } else {
        console.warn(`Attempted to listen to unauthorized channel: ${channel}`)
      }
    },

    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      const allowedChannels = [
        'download-progress-update',
        'download-completed',
        'download-failed',
        'download-deleted',
        'theme-changed',
      ]

      if (allowedChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, listener)
      }
    },

    once: (channel: string, listener: (...args: any[]) => void) => {
      const allowedChannels = [
        'download-progress-update',
        'download-completed',
        'download-failed',
        'download-deleted',
        'theme-changed',
      ]

      if (allowedChannels.includes(channel)) {
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
