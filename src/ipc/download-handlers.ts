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
import { StorageManager } from '../services/storage-manager'
import { ValidationUtils } from '../utils/validation'

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
}

/**
 * File Operation Handlers
 */
export function setupFileHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, async (_event, filePath: string) => {
    try {
      const exists = await storageManager.fileExists(filePath)
      return createSuccessResponse(exists)
    } catch (error) {
      logger.error('Failed to check file existence', error as Error, { filePath })
      return createErrorResponse('Failed to check file existence', 'FILE_CHECK_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_READ, async (_event, filePath: string) => {
    try {
      const buffer = await storageManager.readFile(filePath)
      return createSuccessResponse(buffer)
    } catch (error) {
      logger.error('Failed to read file', error as Error, { filePath })
      return createErrorResponse('Failed to read file', 'FILE_READ_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_WRITE, async (_event, filePath: string, data: Buffer) => {
    try {
      await storageManager.writeFile(filePath, data)
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to write file', error as Error, { filePath })
      return createErrorResponse('Failed to write file', 'FILE_WRITE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_DELETE, async (_event, filePath: string) => {
    try {
      await storageManager.deleteFile(filePath)
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
 * Setup all download handlers
 */
export function setupDownloadHandlers(): void {
  logger.info('Setting up download IPC handlers')

  setupDownloadOperationHandlers()
  setupFileHandlers()
  setupStorageHandlers()
  setupConfigHandlers()
  setupProgressBroadcasting()

  logger.info('Download IPC handlers initialized successfully')
}
