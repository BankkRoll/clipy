/**
 * Validation Utilities
 * Input validation and error handling utilities
 */

import { DownloadError, DownloadErrorCode, createDownloadError } from '../types/download'
import type { DownloadFilter, DownloadOptions } from '../types/download'

import { Logger } from './logger'
import { PlatformUtils } from './platform'

export interface ValidationResult<T = any> {
  isValid: boolean
  value?: T
  error?: string
}

export class ValidationUtils {
  private static logger = Logger.getInstance()
  private static platform = PlatformUtils.getInstance()

  /**
   * Validate YouTube URL
   */
  static validateUrl(url: string): ValidationResult<string> {
    try {
      if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL is required' }
      }

      const trimmedUrl = url.trim()
      if (!trimmedUrl) {
        return { isValid: false, error: 'URL cannot be empty' }
      }

      // Parse URL
      let urlObj: URL
      try {
        urlObj = new URL(trimmedUrl)
      } catch {
        return { isValid: false, error: 'Invalid URL format' }
      }

      // Check for YouTube domains
      const youtubeDomains = ['youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com']

      if (!youtubeDomains.includes(urlObj.hostname.toLowerCase())) {
        return { isValid: false, error: 'URL must be a valid YouTube URL' }
      }

      // Validate YouTube URL patterns
      const youtubePatterns = [
        /youtube\.com\/watch\?v=[\w-]+/,
        /youtu\.be\/[\w-]+/,
        /youtube\.com\/shorts\/[\w-]+/,
        /music\.youtube\.com\/watch\?v=[\w-]+/,
        /youtube\.com\/embed\/[\w-]+/,
      ]

      const isValidPattern = youtubePatterns.some(pattern => pattern.test(trimmedUrl))
      if (!isValidPattern) {
        return { isValid: false, error: 'Invalid YouTube URL format' }
      }

      return { isValid: true, value: trimmedUrl }
    } catch (error) {
      this.logger.error('URL validation failed', error as Error, { url })
      return { isValid: false, error: 'URL validation failed' }
    }
  }

  /**
   * Validate download ID
   */
  static validateDownloadId(downloadId: string): ValidationResult<string> {
    try {
      if (!downloadId || typeof downloadId !== 'string') {
        return { isValid: false, error: 'Download ID is required' }
      }

      const trimmedId = downloadId.trim()
      if (!trimmedId) {
        return { isValid: false, error: 'Download ID cannot be empty' }
      }

      // Basic format validation (should be our generated format)
      const idPattern = /^dl_\d+_[a-z0-9]+$/
      if (!idPattern.test(trimmedId)) {
        return { isValid: false, error: 'Invalid download ID format' }
      }

      return { isValid: true, value: trimmedId }
    } catch (error) {
      this.logger.error('Download ID validation failed', error as Error, { downloadId })
      return { isValid: false, error: 'Download ID validation failed' }
    }
  }

  /**
   * Validate download options
   */
  static validateDownloadOptions(options: any): ValidationResult<DownloadOptions> {
    try {
      if (!options || typeof options !== 'object') {
        return { isValid: true, value: {} } // Empty options are valid
      }

      const validatedOptions: Partial<DownloadOptions> = {}

      // Validate quality
      if (options.quality !== undefined) {
        const validQualities = ['highest', 'lowest', 'highestaudio', 'lowestaudio', 'best', 'worst']
        if (typeof options.quality === 'string' && validQualities.includes(options.quality)) {
          validatedOptions.quality = options.quality
        } else if (typeof options.quality === 'string' && /^\d+p$/.test(options.quality)) {
          // Allow quality like "720p", "1080p", etc.
          validatedOptions.quality = options.quality
        }
      }

      // Validate format
      if (options.format !== undefined) {
        const validFormats = ['mp4', 'webm', 'mkv', 'mp3', 'm4a', 'opus']
        if (validFormats.includes(options.format)) {
          validatedOptions.format = options.format
        }
      }

      // Validate output path
      if (options.outputPath !== undefined) {
        if (typeof options.outputPath === 'string' && options.outputPath.trim()) {
          validatedOptions.outputPath = options.outputPath.trim()
        }
      }

      // Validate filename
      if (options.filename !== undefined) {
        if (typeof options.filename === 'string' && options.filename.trim()) {
          // Sanitize filename
          const sanitized = options.filename
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 200)
          validatedOptions.filename = sanitized
        }
      }

      // Validate boolean options
      const booleanOptions: (keyof Pick<
        DownloadOptions,
        'downloadSubtitles' | 'downloadThumbnail' | 'saveMetadata' | 'createSubdirectories' | 'overwrite'
      >)[] = ['downloadSubtitles', 'downloadThumbnail', 'saveMetadata', 'createSubdirectories', 'overwrite']

      for (const option of booleanOptions) {
        if (options[option] !== undefined) {
          validatedOptions[option] = Boolean(options[option])
        }
      }

      // Validate numeric options
      if (typeof options.maxRetries === 'number' && options.maxRetries >= 0 && options.maxRetries <= 10) {
        validatedOptions.maxRetries = Math.floor(options.maxRetries)
      }

      if (typeof options.timeoutMs === 'number' && options.timeoutMs >= 1000 && options.timeoutMs <= 3600000) {
        validatedOptions.timeoutMs = Math.floor(options.timeoutMs)
      }

      // Validate time ranges
      if (typeof options.startTime === 'number' && options.startTime >= 0) {
        validatedOptions.startTime = Math.floor(options.startTime)
      }

      if (typeof options.endTime === 'number' && options.endTime > 0) {
        validatedOptions.endTime = Math.floor(options.endTime)
      }

      // Validate time range logic
      if (validatedOptions.startTime !== undefined && validatedOptions.endTime !== undefined) {
        if (validatedOptions.startTime >= validatedOptions.endTime) {
          return { isValid: false, error: 'Start time must be less than end time' }
        }
      }

      return { isValid: true, value: validatedOptions as DownloadOptions }
    } catch (error) {
      this.logger.error('Download options validation failed', error as Error, { options })
      return { isValid: false, error: 'Download options validation failed' }
    }
  }

  /**
   * Validate download filter
   */
  static validateDownloadFilter(filter: any): ValidationResult<DownloadFilter> {
    try {
      const validFilters: DownloadFilter[] = ['active', 'completed', 'failed', 'all']

      if (typeof filter === 'string' && validFilters.includes(filter as DownloadFilter)) {
        return { isValid: true, value: filter as DownloadFilter }
      }

      return { isValid: true, value: 'all' } // Default to 'all'
    } catch (error) {
      this.logger.error('Download filter validation failed', error as Error, { filter })
      return { isValid: true, value: 'all' }
    }
  }

  /**
   * Validate time range
   */
  static validateTimeRange(start: number, end: number): ValidationResult<{ start: number; end: number }> {
    try {
      if (typeof start !== 'number' || typeof end !== 'number') {
        return { isValid: false, error: 'Start and end times must be numbers' }
      }

      if (start < 0) {
        return { isValid: false, error: 'Start time cannot be negative' }
      }

      if (end <= 0) {
        return { isValid: false, error: 'End time must be positive' }
      }

      if (start >= end) {
        return { isValid: false, error: 'Start time must be less than end time' }
      }

      const duration = end - start
      if (duration < 1) {
        return { isValid: false, error: 'Time range must be at least 1 second' }
      }

      if (duration > 12 * 60 * 60) {
        // 12 hours max
        return { isValid: false, error: 'Time range cannot exceed 12 hours' }
      }

      return { isValid: true, value: { start: Math.floor(start), end: Math.floor(end) } }
    } catch (error) {
      this.logger.error('Time range validation failed', error as Error, { start, end })
      return { isValid: false, error: 'Time range validation failed' }
    }
  }

  /**
   * Validate file path
   */
  static validateFilePath(filePath: string): ValidationResult<string> {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { isValid: false, error: 'File path is required' }
      }

      const trimmedPath = filePath.trim()
      if (!trimmedPath) {
        return { isValid: false, error: 'File path cannot be empty' }
      }

      // Check for dangerous characters
      const dangerousChars = /[<>:"|?*]/
      if (dangerousChars.test(trimmedPath)) {
        return { isValid: false, error: 'File path contains invalid characters' }
      }

      // Check for control characters (0-31 ASCII)
      const hasControlChars = [...trimmedPath].some(char => {
        const code = char.charCodeAt(0)
        return code < 32
      })

      if (hasControlChars) {
        return { isValid: false, error: 'File path contains invalid control characters' }
      }

      // Check path length
      if (trimmedPath.length > 260) {
        // Windows MAX_PATH
        return { isValid: false, error: 'File path is too long' }
      }

      return { isValid: true, value: trimmedPath }
    } catch (error) {
      this.logger.error('File path validation failed', error as Error, { filePath })
      return { isValid: false, error: 'File path validation failed' }
    }
  }

  /**
   * Handle download errors with proper error codes
   */
  static handleDownloadError(error: unknown): DownloadError {
    if (error instanceof Error && 'code' in error) {
      // Already a DownloadError
      return error as DownloadError
    }

    if (error instanceof Error) {
      // Convert to DownloadError based on error message
      const message = error.message.toLowerCase()

      if (message.includes('network') || message.includes('timeout')) {
        return createDownloadError(error.message, DownloadErrorCode.NETWORK_ERROR, error, true)
      }

      if (message.includes('quota') || message.includes('limit')) {
        return createDownloadError(error.message, DownloadErrorCode.QUOTA_EXCEEDED, error, false)
      }

      if (message.includes('disk') || message.includes('space')) {
        return createDownloadError(error.message, DownloadErrorCode.DISK_SPACE, error, false)
      }

      if (message.includes('permission') || message.includes('access')) {
        return createDownloadError(error.message, DownloadErrorCode.PERMISSION_DENIED, error, false)
      }

      return createDownloadError(error.message, DownloadErrorCode.UNKNOWN_ERROR, error, true)
    }

    return createDownloadError(String(error), DownloadErrorCode.UNKNOWN_ERROR, undefined, true)
  }

  /**
   * Sanitize filename for current platform
   */
  static sanitizeFilename(filename: string): string {
    return this.platform.sanitizeFilename(filename)
  }

  /**
   * Validate configuration update
   */
  static validateConfigUpdate(updates: any): ValidationResult<Partial<any>> {
    try {
      const validatedUpdates: any = {}

      // Validate download settings
      if (updates.download) {
        validatedUpdates.download = {}

        if (typeof updates.download.maxConcurrentDownloads === 'number') {
          const value = Math.max(1, Math.min(10, updates.download.maxConcurrentDownloads))
          validatedUpdates.download.maxConcurrentDownloads = value
        }

        if (typeof updates.download.timeoutMs === 'number') {
          const value = Math.max(1000, Math.min(3600000, updates.download.timeoutMs))
          validatedUpdates.download.timeoutMs = value
        }

        // Validate boolean settings
        const booleanSettings = [
          'downloadSubtitles',
          'downloadThumbnails',
          'saveMetadata',
          'createSubdirectories',
          'autoRetryFailed',
        ]

        for (const setting of booleanSettings) {
          if (typeof updates.download[setting] === 'boolean') {
            validatedUpdates.download[setting] = updates.download[setting]
          }
        }
      }

      return { isValid: true, value: validatedUpdates }
    } catch (error) {
      this.logger.error('Config update validation failed', error as Error, { updates })
      return { isValid: false, error: 'Configuration validation failed' }
    }
  }
}
