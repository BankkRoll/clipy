/**
 * Download IPC Handlers
 * Handles all download operations, storage, and configuration
 */

import { BrowserWindow, ipcMain } from 'electron'
import type { DownloadFilter, DownloadListData, DownloadOptions, DownloadProgress } from '../types/download'
import { createErrorResponse, createSuccessResponse } from '../types/api'

import { ConfigManager } from '../utils/config'
import { DownloadManager } from '../services/download-manager'
import { IPC_CHANNELS } from './channels'
import { Logger } from '../utils/logger'
import { PlatformUtils } from '../utils/platform'
import { StorageManager } from '../services/storage-manager'
import { ValidationUtils } from '../utils/validation'
import { getVideoInfoWithStreamingUrl } from '../services/downloader/yt-dlp-manager'
import { getProxyUrl, isProxyRunning, getProxyPort } from '../services/streaming-proxy'

const logger = Logger.getInstance()
const downloadManager = DownloadManager.getInstance()
const storageManager = StorageManager.getInstance()
const configManager = ConfigManager.getInstance()

/**
 * Download Operation Handlers
 */
export function setupDownloadOperationHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_START, async (_event, url: string, options?: DownloadOptions) => {
    try {
      // Validate input
      const urlValidation = ValidationUtils.validateUrl(url)
      if (!urlValidation.isValid) {
        return createErrorResponse(urlValidation.error || 'Invalid URL', 'INVALID_URL')
      }

      const validatedOptions = ValidationUtils.validateDownloadOptions(options)

      logger.info('Starting download', { url, options: validatedOptions.value })

      const result = await downloadManager.startDownload(url, validatedOptions.value)

      return createSuccessResponse({
        downloadId: result.downloadId,
        message: 'Download started successfully',
      })
    } catch (error) {
      logger.error('Failed to start download', error as Error, { url, options })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_CANCEL, async (_event, downloadId: string) => {
    try {
      const validation = ValidationUtils.validateDownloadId(downloadId)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid download ID', 'INVALID_DOWNLOAD_ID')
      }

      const success = await downloadManager.cancelDownload(downloadId)

      if (success) {
        logger.info('Download cancelled', { downloadId })
        return createSuccessResponse({
          downloadId,
          message: 'Download cancelled successfully',
        })
      } else {
        return createErrorResponse('Download not found or already completed', 'DOWNLOAD_NOT_FOUND')
      }
    } catch (error) {
      logger.error('Failed to cancel download', error as Error, { downloadId })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_DELETE, async (_event, downloadId: string) => {
    try {
      const validation = ValidationUtils.validateDownloadId(downloadId)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid download ID', 'INVALID_DOWNLOAD_ID')
      }

      const success = await downloadManager.deleteDownload(downloadId)

      if (success) {
        logger.info('Download deleted', { downloadId })
        return createSuccessResponse({
          downloadId,
          message: 'Download deleted successfully',
        })
      } else {
        return createErrorResponse('Download not found', 'DOWNLOAD_NOT_FOUND')
      }
    } catch (error) {
      logger.error('Failed to delete download', error as Error, { downloadId })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_RETRY, async (_event, downloadId: string) => {
    try {
      const validation = ValidationUtils.validateDownloadId(downloadId)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid download ID', 'INVALID_DOWNLOAD_ID')
      }

      const result = await downloadManager.retryDownload(downloadId)

      logger.info('Download retry started', { downloadId, newDownloadId: result.downloadId })
      return createSuccessResponse({
        downloadId: result.downloadId,
        message: 'Download retry started successfully',
      })
    } catch (error) {
      logger.error('Failed to retry download', error as Error, { downloadId })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_PROGRESS, async (_event, downloadId?: string) => {
    try {
      if (downloadId) {
        const validation = ValidationUtils.validateDownloadId(downloadId)
        if (!validation.isValid) {
          return createErrorResponse(validation.error || 'Invalid download ID', 'INVALID_DOWNLOAD_ID')
        }

        const progress = await downloadManager.getDownloadProgress(downloadId)
        if (!progress) {
          return createErrorResponse('Download not found', 'DOWNLOAD_NOT_FOUND')
        }

        return createSuccessResponse(progress)
      } else {
        const activeDownloads = await downloadManager.getActiveDownloads()
        return createSuccessResponse(activeDownloads)
      }
    } catch (error) {
      logger.error('Failed to get download progress', error as Error, { downloadId })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_LIST, async (_event, filter?: DownloadFilter) => {
    try {
      const validatedFilter = ValidationUtils.validateDownloadFilter(filter)

      const downloads = await downloadManager.getDownloadsByFilter(validatedFilter.value!)
      const result: DownloadListData = {
        downloads,
        count: downloads.length,
        filter: validatedFilter.value!,
      }

      return createSuccessResponse(result)
    } catch (error) {
      logger.error('Failed to get download list', error as Error, { filter })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_INFO, async (_event, url: string) => {
    try {
      const urlValidation = ValidationUtils.validateUrl(url)
      if (!urlValidation.isValid) {
        return createErrorResponse(urlValidation.error || 'Invalid URL', 'INVALID_URL')
      }

      const videoInfo = await downloadManager.getVideoInfo(url)

      return createSuccessResponse(videoInfo)
    } catch (error) {
      logger.error('Failed to get video info', error as Error, { url })
      return ValidationUtils.handleDownloadError(error)
    }
  })

  // Get video info with streaming URL for editor preview
  // NOTE: We return RAW YouTube URLs (not proxied) because Electron's webRequest API
  // handles CORS bypass at the browser level. This is more reliable than Node.js proxy
  // which gets "socket hang up" errors from googlevideo.com.
  // See setupYouTubeCORSBypass() in main.ts
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_STREAMING_INFO, async (_event, url: string) => {
    try {
      const urlValidation = ValidationUtils.validateUrl(url)
      if (!urlValidation.isValid) {
        return createErrorResponse(urlValidation.error || 'Invalid URL', 'INVALID_URL')
      }

      const { videoInfo, streamingUrl, audioUrl, fallbackUrl } = await getVideoInfoWithStreamingUrl(url)

      // Return RAW YouTube URLs - Electron's webRequest API handles CORS bypass
      // This is more reliable than the Node.js proxy approach
      logger.info('Got streaming info for preview', {
        url,
        hasStreamingUrl: !!streamingUrl,
        hasAudioUrl: !!audioUrl,
        hasFallbackUrl: !!fallbackUrl,
        streamingUrlHost: streamingUrl ? new URL(streamingUrl).hostname : null,
      })

      return createSuccessResponse({
        videoInfo,
        streamingUrl,
        audioUrl,
        fallbackUrl,
      })
    } catch (error) {
      logger.error('Failed to get streaming info', error as Error, { url })
      return ValidationUtils.handleDownloadError(error)
    }
  })
}

import { join } from 'path'

const platform = PlatformUtils.getInstance()

/**
 * Get allowed file operation paths (downloads, cache, temp directories)
 * This ensures file operations are restricted to safe directories
 */
function getAllowedFilePaths(): string[] {
  const config = configManager.getAll()
  const appDataDir = platform.getAppDataDir('clipy')

  return [
    join(appDataDir, 'downloads'),
    join(appDataDir, 'cache'),
    join(appDataDir, 'temp'),
    config.download?.downloadPath || join(appDataDir, 'downloads'),
    config.storage?.cachePath || join(appDataDir, 'cache'),
    config.storage?.tempPath || join(appDataDir, 'temp'),
  ].filter((p, i, arr) => arr.indexOf(p) === i) // Remove duplicates
}

/**
 * File Operation Handlers
 * All file operations validate paths to prevent path traversal attacks
 */
export function setupFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_event, filePath: string) => {
    try {
      // Validate path is within allowed directories
      const pathValidation = ValidationUtils.validateSecurePath(filePath, getAllowedFilePaths())
      if (!pathValidation.isValid) {
        logger.warn('File exists check blocked - path not allowed', { filePath })
        return createErrorResponse(pathValidation.error || 'Path not allowed', 'PATH_NOT_ALLOWED')
      }

      const exists = await storageManager.fileExists(pathValidation.value!)
      return createSuccessResponse(exists)
    } catch (error) {
      logger.error('Failed to check file existence', error as Error, { filePath })
      return createErrorResponse('Failed to check file existence', 'FILE_CHECK_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string) => {
    try {
      // Validate path is within allowed directories
      const pathValidation = ValidationUtils.validateSecurePath(filePath, getAllowedFilePaths())
      if (!pathValidation.isValid) {
        logger.warn('File read blocked - path not allowed', { filePath })
        return createErrorResponse(pathValidation.error || 'Path not allowed', 'PATH_NOT_ALLOWED')
      }

      const buffer = await storageManager.readFile(pathValidation.value!)
      return createSuccessResponse(buffer)
    } catch (error) {
      logger.error('Failed to read file', error as Error, { filePath })
      return createErrorResponse('Failed to read file', 'FILE_READ_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_event, filePath: string, data: Buffer) => {
    try {
      // Validate path is within allowed directories
      const pathValidation = ValidationUtils.validateSecurePath(filePath, getAllowedFilePaths())
      if (!pathValidation.isValid) {
        logger.warn('File write blocked - path not allowed', { filePath })
        return createErrorResponse(pathValidation.error || 'Path not allowed', 'PATH_NOT_ALLOWED')
      }

      await storageManager.writeFile(pathValidation.value!, data)
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to write file', error as Error, { filePath })
      return createErrorResponse('Failed to write file', 'FILE_WRITE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, async (_event, filePath: string) => {
    try {
      // Validate path is within allowed directories
      const pathValidation = ValidationUtils.validateSecurePath(filePath, getAllowedFilePaths())
      if (!pathValidation.isValid) {
        logger.warn('File delete blocked - path not allowed', { filePath })
        return createErrorResponse(pathValidation.error || 'Path not allowed', 'PATH_NOT_ALLOWED')
      }

      await storageManager.deleteFile(pathValidation.value!)
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to delete file', error as Error, { filePath })
      return createErrorResponse('Failed to delete file', 'FILE_DELETE_FAILED')
    }
  })
}

/**
 * Storage Operation Handlers
 */
export function setupStorageHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD, async () => {
    try {
      const data = await storageManager.loadDownloadHistory()
      return createSuccessResponse(data)
    } catch (error) {
      logger.error('Failed to load storage', error as Error)
      return createErrorResponse('Failed to load storage', 'STORAGE_LOAD_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE, async (_event, data: any) => {
    try {
      await storageManager.saveDownloadHistory(data)
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to save storage', error as Error)
      return createErrorResponse('Failed to save storage', 'STORAGE_SAVE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_CLEAR, async (_event, type?: 'downloads' | 'cache' | 'temp') => {
    try {
      await storageManager.clearStorage(type || 'cache')
      logger.info('Storage cleared', { type: type || 'cache' })
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to clear storage', error as Error, { type })
      return createErrorResponse('Failed to clear storage', 'STORAGE_CLEAR_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_USAGE, async () => {
    try {
      const stats = await storageManager.getStorageStats()
      // Map StorageStats to StorageUsage format expected by the UI
      const usage = {
        totalUsed: stats.totalSize,
        available: stats.availableSpace,
        downloads: stats.downloadsSize,
        cache: stats.cacheSize,
        temp: stats.tempSize,
      }
      return createSuccessResponse(usage)
    } catch (error) {
      logger.error('Failed to get storage usage', error as Error)
      return createErrorResponse('Failed to get storage usage', 'STORAGE_USAGE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.STORAGE_PATHS, async () => {
    try {
      const stats = await storageManager.getStorageStats()
      const paths = {
        downloads: stats.downloadsPath,
        cache: stats.cachePath,
        temp: stats.tempPath,
      }
      return createSuccessResponse(paths)
    } catch (error) {
      logger.error('Failed to get storage paths', error as Error)
      return createErrorResponse('Failed to get storage paths', 'STORAGE_PATHS_FAILED')
    }
  })
}

/**
 * Configuration Operation Handlers
 */
export function setupConfigHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CONFIG_GET, async () => {
    try {
      const config = configManager.getAll()
      return createSuccessResponse(config)
    } catch (error) {
      logger.error('Failed to get configuration', error as Error)
      return createErrorResponse('Failed to get configuration', 'CONFIG_GET_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_UPDATE, async (_event, updates: any) => {
    try {
      configManager.update(updates)
      logger.info('Configuration updated', { updates })
      return createSuccessResponse(configManager.getAll())
    } catch (error) {
      logger.error('Failed to update configuration', error as Error, { updates })
      return createErrorResponse('Failed to update configuration', 'CONFIG_UPDATE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.CONFIG_RESET, async () => {
    try {
      configManager.reset()
      logger.info('Configuration reset to defaults')
      return createSuccessResponse(configManager.getAll())
    } catch (error) {
      logger.error('Failed to reset configuration', error as Error)
      return createErrorResponse('Failed to reset configuration', 'CONFIG_RESET_FAILED')
    }
  })
}

/**
 * Progress Update Broadcasting
 */
export function setupProgressBroadcasting(): void {
  // Listen to download manager events and broadcast to all windows
  downloadManager.on('progress', (progress: DownloadProgress) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('download-progress-update', progress)
      }
    })
  })

  downloadManager.on('completed', (progress: DownloadProgress) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('download-completed', progress)
      }
    })
  })

  downloadManager.on('failed', (progress: DownloadProgress) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('download-failed', progress)
      }
    })
  })

  downloadManager.on('deleted', (downloadId: string) => {
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send('download-deleted', downloadId)
      }
    })
  })
}

/**
 * Streaming Proxy Handlers
 */
export function setupProxyHandlers(): void {
  // Get a proxied URL for a video stream
  ipcMain.handle(IPC_CHANNELS.PROXY_GET_URL, async (_event, streamUrl: string) => {
    try {
      if (!streamUrl || typeof streamUrl !== 'string') {
        return createErrorResponse('Stream URL is required', 'INVALID_URL')
      }

      if (!isProxyRunning()) {
        return createErrorResponse('Streaming proxy is not running', 'PROXY_NOT_RUNNING')
      }

      const proxyUrl = getProxyUrl(streamUrl)
      logger.info('Generated proxy URL', { originalUrl: streamUrl.substring(0, 50), proxyPort: getProxyPort() })

      return createSuccessResponse({ proxyUrl })
    } catch (error) {
      logger.error('Failed to generate proxy URL', error as Error)
      return createErrorResponse('Failed to generate proxy URL', 'PROXY_ERROR')
    }
  })

  // Check proxy status
  ipcMain.handle(IPC_CHANNELS.PROXY_STATUS, async () => {
    return createSuccessResponse({
      running: isProxyRunning(),
      port: getProxyPort(),
    })
  })
}

/**
 * Setup all download handlers
 */
export function setupDownloadHandlers(): void {
  logger.info('Setting up download IPC handlers')

  setupDownloadOperationHandlers()
  setupFileHandlers()
  setupStorageHandlers()
  setupConfigHandlers()
  setupProgressBroadcasting()
  setupProxyHandlers()

  logger.info('Download IPC handlers initialized successfully')
}
