/**
 * File System Utilities
 * Cross-platform file system operations with error handling
 */

import { Stats, existsSync, promises as fs } from 'fs'
import { dirname, join } from 'path'

import { Logger } from './logger'
import { PlatformUtils } from './platform'

export class FileSystemUtils {
  private static instance: FileSystemUtils
  private logger = Logger.getInstance()
  private platform = PlatformUtils.getInstance()

  private constructor() {}

  static getInstance(): FileSystemUtils {
    if (!FileSystemUtils.instance) {
      FileSystemUtils.instance = new FileSystemUtils()
    }
    return FileSystemUtils.instance
  }

  /**
   * Read file as buffer
   */
  async readFile(filePath: string): Promise<Buffer> {
    try {
      const buffer = await fs.readFile(filePath)
      this.logger.debug('File read successfully', { path: filePath, size: buffer.length })
      return buffer
    } catch (error) {
      this.logger.error('Failed to read file', error as Error, { filePath })
      throw new Error(`Failed to read file: ${(error as Error).message}`)
    }
  }

  /**
   * Write buffer to file
   */
  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      await this.ensureDirectory(dirname(filePath))
      await fs.writeFile(filePath, data)
      this.logger.debug('File written successfully', { path: filePath, size: data.length })
    } catch (error) {
      this.logger.error('Failed to write file', error as Error, { filePath })
      throw new Error(`Failed to write file: ${(error as Error).message}`)
    }
  }

  /**
   * Read JSON file
   */
  async readJsonFile(filePath: string): Promise<any> {
    try {
      const buffer = await this.readFile(filePath)
      const data = JSON.parse(buffer.toString('utf-8'))
      this.logger.debug('JSON file read successfully', { path: filePath })
      return data
    } catch (error) {
      this.logger.error('Failed to read JSON file', error as Error, { filePath })
      throw new Error(`Failed to read JSON file: ${(error as Error).message}`)
    }
  }

  /**
   * Write JSON file
   */
  async writeJsonFile(filePath: string, data: any): Promise<void> {
    try {
      const jsonString = JSON.stringify(data, null, 2)
      const buffer = Buffer.from(jsonString, 'utf-8')
      await this.writeFile(filePath, buffer)
      this.logger.debug('JSON file written successfully', { path: filePath })
    } catch (error) {
      this.logger.error('Failed to write JSON file', error as Error, { filePath })
      throw new Error(`Failed to write JSON file: ${(error as Error).message}`)
    }
  }

  /**
   * Read text file
   */
  async readTextFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
    try {
      const buffer = await this.readFile(filePath)
      const text = buffer.toString(encoding)
      this.logger.debug('Text file read successfully', { path: filePath, encoding })
      return text
    } catch (error) {
      this.logger.error('Failed to read text file', error as Error, { filePath })
      throw new Error(`Failed to read text file: ${(error as Error).message}`)
    }
  }

  /**
   * Write text file
   */
  async writeTextFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> {
    try {
      const buffer = Buffer.from(content, encoding)
      await this.writeFile(filePath, buffer)
      this.logger.debug('Text file written successfully', { path: filePath, encoding })
    } catch (error) {
      this.logger.error('Failed to write text file', error as Error, { filePath })
      throw new Error(`Failed to write text file: ${(error as Error).message}`)
    }
  }

  /**
   * Check if file exists
   */
  fileExists(filePath: string): boolean {
    try {
      const exists = existsSync(filePath)
      this.logger.debug('File existence checked', { path: filePath, exists })
      return exists
    } catch (error) {
      this.logger.error('Failed to check file existence', error as Error, { filePath })
      return false
    }
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath)
      this.logger.debug('File deleted successfully', { path: filePath })
    } catch (error) {
      // Don't throw if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.error('Failed to delete file', error as Error, { filePath })
        throw new Error(`Failed to delete file: ${(error as Error).message}`)
      }
    }
  }

  /**
   * Ensure directory exists with platform-specific permissions
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await this.platform.ensureDirectory(dirPath)
      this.logger.debug('Directory created', { path: dirPath })
    } catch (error) {
      // Directory might already exist, which is fine
      if (!existsSync(dirPath)) {
        this.logger.error('Failed to create directory', error as Error, { dirPath })
        throw new Error(`Failed to create directory: ${(error as Error).message}`)
      }
    }
  }

  /**
   * Get file stats
   */
  async getFileStats(filePath: string): Promise<Stats> {
    try {
      const stats = await fs.stat(filePath)
      this.logger.debug('File stats retrieved', { path: filePath, size: stats.size })
      return stats
    } catch (error) {
      this.logger.error('Failed to get file stats', error as Error, { filePath })
      throw new Error(`Failed to get file stats: ${(error as Error).message}`)
    }
  }

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    try {
      const items = await fs.readdir(dirPath)
      this.logger.debug('Directory listed', { path: dirPath, count: items.length })
      return items
    } catch (error) {
      this.logger.error('Failed to list directory', error as Error, { dirPath })
      throw new Error(`Failed to list directory: ${(error as Error).message}`)
    }
  }

  /**
   * Copy file
   */
  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await this.ensureDirectory(dirname(destPath))
      await fs.copyFile(sourcePath, destPath)
      this.logger.debug('File copied successfully', { from: sourcePath, to: destPath })
    } catch (error) {
      this.logger.error('Failed to copy file', error as Error, { sourcePath, destPath })
      throw new Error(`Failed to copy file: ${(error as Error).message}`)
    }
  }

  /**
   * Move file
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    try {
      await this.copyFile(sourcePath, destPath)
      await this.deleteFile(sourcePath)
      this.logger.debug('File moved successfully', { from: sourcePath, to: destPath })
    } catch (error) {
      this.logger.error('Failed to move file', error as Error, { sourcePath, destPath })
      throw new Error(`Failed to move file: ${(error as Error).message}`)
    }
  }

  /**
   * Get file size
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await this.getFileStats(filePath)
      return stats.size
    } catch (error) {
      this.logger.error('Failed to get file size', error as Error, { filePath })
      return 0
    }
  }

  /**
   * Calculate directory size recursively
   */
  async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0
      const items = await this.listDirectory(dirPath)

      for (const item of items) {
        const itemPath = join(dirPath, item)
        const stats = await this.getFileStats(itemPath)

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath)
        } else {
          totalSize += stats.size
        }
      }

      this.logger.debug('Directory size calculated', { path: dirPath, size: totalSize })
      return totalSize
    } catch (error) {
      this.logger.error('Failed to calculate directory size', error as Error, { dirPath })
      return 0
    }
  }

  /**
   * Create temporary file path with platform-safe characters
   */
  createTempFilePath(prefix: string = 'temp', extension: string = 'tmp'): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)
    const filename = `${prefix}_${timestamp}_${random}.${extension}`
    return this.platform.sanitizeFilename(filename)
  }

  /**
   * Clean up old files in directory
   */
  async cleanupOldFiles(dirPath: string, maxAge: number): Promise<number> {
    try {
      const items = await this.listDirectory(dirPath)
      const cutoffTime = Date.now() - maxAge
      let cleanedCount = 0

      for (const item of items) {
        const itemPath = join(dirPath, item)
        const stats = await this.getFileStats(itemPath)

        if (stats.mtime.getTime() < cutoffTime) {
          await this.deleteFile(itemPath)
          cleanedCount++
        }
      }

      if (cleanedCount > 0) {
        this.logger.info('Old files cleaned up', { directory: dirPath, cleaned: cleanedCount })
      }

      return cleanedCount
    } catch (error) {
      this.logger.error('Failed to cleanup old files', error as Error, { dirPath })
      return 0
    }
  }
}
