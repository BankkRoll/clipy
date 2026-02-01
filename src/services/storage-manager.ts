/**
 * Storage Manager Service
 * Handles file system operations and download metadata persistence
 */

import { basename, dirname, extname, join } from 'path'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'

import { ConfigManager } from '../utils/config'
import type { DownloadProgress } from '../types/download'
import { FileSystemUtils } from '../utils/file-system'
import { Logger } from '../utils/logger'
import { PlatformUtils } from '../utils/platform'
import { exec } from 'child_process'

export interface StorageStats {
  downloadsPath: string
  cachePath: string
  tempPath: string
  downloadsSize: number
  cacheSize: number
  tempSize: number
  totalSize: number
  availableSpace: number
}

export class StorageManager {
  private static instance: StorageManager
  private downloadsPath: string
  private cachePath: string
  private tempPath: string
  private downloadsFile: string
  private configManager = ConfigManager.getInstance()
  private logger = Logger.getInstance()
  private fileSystem = FileSystemUtils.getInstance()
  private platform = PlatformUtils.getInstance()

  private constructor() {
    // Use app data directory for downloads to avoid scanning user Downloads folder
    const defaultDownloadsPath = join(this.platform.getAppDataDir('clipy'), 'downloads')
    this.downloadsPath = this.configManager.get('download')?.downloadPath || defaultDownloadsPath
    this.cachePath = this.configManager.get('storage')?.cachePath || join(this.platform.getAppDataDir('clipy'), 'cache')
    this.tempPath = this.configManager.get('storage')?.tempPath || join(this.platform.getAppDataDir('clipy'), 'temp')
    this.downloadsFile = join(this.platform.getAppDataDir('clipy'), 'downloads.json')

    this.ensureDirectories()
  }

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager()
    }
    return StorageManager.instance
  }

  /**
   * Ensure all required directories exist
   */
  private ensureDirectories(): void {
    const dirs = [this.downloadsPath, this.cachePath, this.tempPath]

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
        this.logger.info('Created directory', { path: dir })
      }
    }
  }

  /**
   * File existence check
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      return existsSync(filePath)
    } catch (error) {
      this.logger.error('Failed to check file existence', error as Error, { filePath })
      return false
    }
  }

  /**
   * Read file as buffer
   */
  async readFile(filePath: string): Promise<Buffer | null> {
    try {
      if (!existsSync(filePath)) {
        return null
      }
      return await this.fileSystem.readFile(filePath)
    } catch (error) {
      this.logger.error('Failed to read file', error as Error, { filePath })
      return null
    }
  }

  /**
   * Write buffer to file
   */
  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      await this.fileSystem.ensureDirectory(dirname(filePath))
      await this.fileSystem.writeFile(filePath, data)
      this.logger.debug('File written successfully', { path: filePath, size: data.length })
    } catch (error) {
      this.logger.error('Failed to write file', error as Error, { filePath })
      throw error
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath)
        this.logger.debug('File deleted', { path: filePath })
      }
    } catch (error) {
      this.logger.error('Failed to delete file', error as Error, { filePath })
      throw error
    }
  }

  /**
   * Load download history from disk
   */
  async loadDownloadHistory(): Promise<DownloadProgress[]> {
    try {
      if (!existsSync(this.downloadsFile)) {
        return []
      }

      const data = await this.fileSystem.readJsonFile(this.downloadsFile)
      if (!Array.isArray(data)) {
        this.logger.warn('Invalid downloads file format, returning empty array')
        return []
      }

      // Validate and clean data
      const validDownloads = data.filter((download: any) => {
        return download && typeof download === 'object' && download.downloadId && download.url && download.title
      })

      this.logger.info('Loaded download history', { count: validDownloads.length })
      return validDownloads
    } catch (error) {
      this.logger.error('Failed to load download history', error as Error)
      return []
    }
  }

  /**
   * Save download history to disk
   */
  async saveDownloadHistory(downloads: DownloadProgress[]): Promise<void> {
    try {
      await this.fileSystem.writeJsonFile(this.downloadsFile, downloads)
      this.logger.debug('Download history saved', { count: downloads.length })
    } catch (error) {
      this.logger.error('Failed to save download history', error as Error)
      throw error
    }
  }

  /**
   * Get temporary file path
   */
  getTempFilePath(filename: string): string {
    return join(this.tempPath, filename)
  }

  /**
   * Get cache file path
   */
  getCacheFilePath(filename: string): string {
    return join(this.cachePath, filename)
  }

  /**
   * Get downloads file path
   */
  getDownloadsFilePath(filename: string): string {
    return join(this.downloadsPath, filename)
  }

  /**
   * Clean temporary files
   */
  async cleanTempFiles(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      return await this.cleanDirectory(this.tempPath, maxAge)
    } catch (error) {
      this.logger.error('Failed to clean temp files', error as Error)
      return 0
    }
  }

  /**
   * Clean cache files
   */
  async cleanCacheFiles(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      return await this.cleanDirectory(this.cachePath, maxAge)
    } catch (error) {
      this.logger.error('Failed to clean cache files', error as Error)
      return 0
    }
  }

  /**
   * Clean old downloads
   */
  async cleanOldDownloads(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const downloads = await this.loadDownloadHistory()
      const cutoffTime = Date.now() - maxAge

      const toRemove = downloads.filter(download => download.status === 'completed' && download.startTime < cutoffTime)

      for (const download of toRemove) {
        if (download.filePath && existsSync(download.filePath)) {
          await this.deleteFile(download.filePath)
        }
        if (download.thumbnailPath && existsSync(download.thumbnailPath)) {
          await this.deleteFile(download.thumbnailPath)
        }
      }

      // Update history
      const remaining = downloads.filter(
        download => !toRemove.some(removed => removed.downloadId === download.downloadId),
      )
      await this.saveDownloadHistory(remaining)

      this.logger.info('Cleaned old downloads', { removed: toRemove.length })
      return toRemove.length
    } catch (error) {
      this.logger.error('Failed to clean old downloads', error as Error)
      return 0
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      this.logger.debug('Getting storage stats', {
        downloadsPath: this.downloadsPath,
        cachePath: this.cachePath,
        tempPath: this.tempPath,
      })

      // Safely get directory sizes with error handling
      const downloadsSize = await this.getDirectorySize(this.downloadsPath).catch(err => {
        this.logger.warn('Failed to get downloads directory size', err)
        return 0
      })
      const cacheSize = await this.getDirectorySize(this.cachePath).catch(err => {
        this.logger.warn('Failed to get cache directory size', err)
        return 0
      })
      const tempSize = await this.getDirectorySize(this.tempPath).catch(err => {
        this.logger.warn('Failed to get temp directory size', err)
        return 0
      })

      // Get available space using platform-specific methods
      const availableSpace = await this.getAvailableDiskSpace().catch(err => {
        this.logger.warn('Failed to get available disk space', err)
        return 10 * 1024 * 1024 * 1024 // 10GB fallback
      })

      const result = {
        downloadsPath: this.downloadsPath,
        cachePath: this.cachePath,
        tempPath: this.tempPath,
        downloadsSize,
        cacheSize,
        tempSize,
        totalSize: downloadsSize + cacheSize + tempSize,
        availableSpace,
      }

      this.logger.debug('Storage stats calculated successfully', result)
      return result
    } catch (error) {
      this.logger.error('Failed to get storage stats', error as Error)
      throw error
    }
  }

  /**
   * Get available disk space for the storage paths
   */
  private async getAvailableDiskSpace(): Promise<number> {
    try {
      // Try to get disk space for the downloads directory
      const targetPath = this.downloadsPath

      const platformInfo = this.platform.getPlatformInfo()
      if (platformInfo.isWindows) {
        return await this.getWindowsDiskSpace(targetPath)
      } else if (platformInfo.isLinux || platformInfo.isMacOS) {
        return await this.getUnixDiskSpace(targetPath)
      } else {
        // Unknown platform, use fallback
        return 10 * 1024 * 1024 * 1024 // 10GB fallback
      }
    } catch (error) {
      this.logger.warn('Failed to get disk space, using fallback', error as Error)
      return 10 * 1024 * 1024 * 1024 // 10GB fallback
    }
  }

  /**
   * Get disk space on Windows
   */
  private async getWindowsDiskSpace(path: string): Promise<number> {
    return new Promise(resolve => {
      try {
        // Use fs.statSync to get disk info (limited on Windows)
        // For more accurate info, would need to use Windows API
        // This is a simplified implementation
        const stats = statSync(path)
        if (stats) {
          // Estimate available space - in production, use Windows API or third-party library
          resolve(50 * 1024 * 1024 * 1024) // 50GB estimate for Windows
        } else {
          resolve(10 * 1024 * 1024 * 1024) // 10GB fallback
        }
      } catch {
        resolve(10 * 1024 * 1024 * 1024) // 10GB fallback
      }
    })
  }

  /**
   * Get disk space on Unix systems (Linux/macOS)
   */
  private async getUnixDiskSpace(path: string): Promise<number> {
    return new Promise(resolve => {
      try {
        const platformInfo = this.platform.getPlatformInfo()
        const command = platformInfo.isMacOS
          ? `df -k "${path}" | tail -1 | awk '{print $4}'`
          : `df -k "${path}" | tail -1 | awk '{print $4}'`

        exec(command, (error: any, stdout: string) => {
          if (error) {
            this.logger.debug('Failed to execute df command', { error })
            resolve(10 * 1024 * 1024 * 1024) // 10GB fallback
            return
          }

          const kbAvailable = parseInt(stdout.trim())
          if (isNaN(kbAvailable)) {
            resolve(10 * 1024 * 1024 * 1024) // 10GB fallback
          } else {
            resolve(kbAvailable * 1024) // Convert KB to bytes
          }
        })
      } catch {
        resolve(10 * 1024 * 1024 * 1024) // 10GB fallback
      }
    })
  }

  /**
   * Clean directory of old files
   */
  private async cleanDirectory(dirPath: string, maxAge: number): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        return 0
      }

      const files = readdirSync(dirPath)
      const cutoffTime = Date.now() - maxAge
      let removedCount = 0

      for (const file of files) {
        const filePath = join(dirPath, file)
        try {
          const stats = statSync(filePath)
          if (stats.mtime.getTime() < cutoffTime) {
            unlinkSync(filePath)
            removedCount++
          }
        } catch (error) {
          // Skip files that can't be accessed
          this.logger.debug('Skipping file during cleanup', { file: filePath, error })
        }
      }

      if (removedCount > 0) {
        this.logger.info('Directory cleaned', { path: dirPath, removed: removedCount })
      }

      return removedCount
    } catch (error) {
      this.logger.error('Failed to clean directory', error as Error, { dirPath })
      return 0
    }
  }

  /**
   * Get directory size recursively
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      if (!existsSync(dirPath)) {
        this.logger.debug('Directory does not exist, returning 0', { dirPath })
        return 0
      }

      let totalSize = 0
      const items = readdirSync(dirPath)

      for (const item of items) {
        const itemPath = join(dirPath, item)
        try {
          const stats = statSync(itemPath)
          if (stats.isDirectory()) {
            totalSize += await this.getDirectorySize(itemPath)
          } else {
            totalSize += stats.size
          }
        } catch (error) {
          // Skip inaccessible files
        }
      }

      return totalSize
    } catch (error) {
      this.logger.error('Failed to get directory size', error as Error, { dirPath })
      return 0
    }
  }

  /**
   * Move file to downloads directory
   */
  async moveToDownloads(sourcePath: string, filename: string): Promise<string> {
    try {
      const destPath = join(this.downloadsPath, filename)

      // Ensure destination directory exists
      await this.fileSystem.ensureDirectory(this.downloadsPath)

      // Read source file
      const data = await this.readFile(sourcePath)
      if (!data) {
        throw new Error('Source file not found or unreadable')
      }

      // Write to destination
      await this.writeFile(destPath, data)

      // Remove source file
      await this.deleteFile(sourcePath)

      this.logger.info('File moved to downloads', { from: sourcePath, to: destPath })
      return destPath
    } catch (error) {
      this.logger.error('Failed to move file to downloads', error as Error, {
        sourcePath,
        filename,
      })
      throw error
    }
  }

  /**
   * Clear storage by type
   */
  async clearStorage(type: 'downloads' | 'cache' | 'temp' = 'cache'): Promise<void> {
    try {
      switch (type) {
        case 'downloads': {
          // Clear all downloaded files but keep history
          const downloadsToRemove = await this.loadDownloadHistory()
          for (const download of downloadsToRemove) {
            if (download.filePath && existsSync(download.filePath)) {
              await this.deleteFile(download.filePath)
            }
            if (download.thumbnailPath && existsSync(download.thumbnailPath)) {
              await this.deleteFile(download.thumbnailPath)
            }
          }
          // Clear the history file
          if (existsSync(this.downloadsFile)) {
            await this.deleteFile(this.downloadsFile)
          }
          this.logger.info('Downloads storage cleared')
          break
        }

        case 'cache': {
          await this.cleanCacheFiles(0) // Delete all cache files
          this.logger.info('Cache storage cleared')
          break
        }

        case 'temp': {
          await this.cleanTempFiles(0) // Delete all temp files
          this.logger.info('Temp storage cleared')
          break
        }

        default:
          throw new Error(`Unknown storage type: ${type}`)
      }
    } catch (error) {
      this.logger.error('Failed to clear storage', error as Error, { type })
      throw error
    }
  }

  /**
   * Generate unique filename
   */
  generateUniqueFilename(originalName: string, extension?: string): string {
    const baseName = basename(originalName, extname(originalName))
    const ext = extension || extname(originalName)
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)

    return `${baseName}_${timestamp}_${random}${ext}`
  }
}
