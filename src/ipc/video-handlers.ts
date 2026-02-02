/**
 * Video Processing IPC Handlers
 * Handles video trimming, thumbnail generation, waveform extraction, and metadata
 */

import { ipcMain } from 'electron'
import { createErrorResponse, createSuccessResponse } from '../types/api'
import { IPC_CHANNELS } from './channels'
import { Logger } from '../utils/logger'
import { PlatformUtils } from '../utils/platform'
import { VideoProcessor, TimeRange, ProcessingOptions } from '../services/video-processor'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname, basename, extname, normalize, isAbsolute, resolve } from 'path'
import { FileSystemUtils } from '../utils/file-system'

const logger = Logger.getInstance()
const videoProcessor = VideoProcessor.getInstance()
const fileSystem = FileSystemUtils.getInstance()

/**
 * Allowed video file extensions for processing
 */
const ALLOWED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mkv',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
  '.ogv',
  '.ts',
  '.mts',
  '.m2ts',
]

/**
 * Validate video file path for security
 * - Checks for null bytes
 * - Checks for path traversal patterns
 * - Validates file extension
 * - Returns normalized absolute path
 */
function validateVideoPath(filePath: string): { isValid: boolean; error?: string; path?: string } {
  if (!filePath || typeof filePath !== 'string') {
    return { isValid: false, error: 'File path is required' }
  }

  // Check for null bytes (security vulnerability)
  if (filePath.includes('\0')) {
    logger.warn('Video path contains null bytes', { filePath })
    return { isValid: false, error: 'Invalid file path' }
  }

  // Check for path traversal patterns BEFORE normalization
  const traversalPatterns = [
    /\.\.[/\\]/, // ../ or ..\
    /[/\\]\.\.[/\\]/, // /../ or \..\
    /[/\\]\.\.$/, // Ends with /.. or \..
  ]

  for (const pattern of traversalPatterns) {
    if (pattern.test(filePath)) {
      logger.warn('Path traversal attempt in video path', { filePath })
      return { isValid: false, error: 'Invalid file path' }
    }
  }

  // Normalize and resolve to absolute path
  const normalizedPath = normalize(filePath)
  const absolutePath = isAbsolute(normalizedPath) ? normalizedPath : resolve(normalizedPath)

  // Validate file extension
  const ext = extname(absolutePath).toLowerCase()
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
    logger.warn('Invalid video file extension', { filePath, extension: ext })
    return { isValid: false, error: `Invalid video file type: ${ext}` }
  }

  // Windows-specific checks
  if (process.platform === 'win32') {
    // Check for reserved device names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
    const fileName = basename(absolutePath)
    const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, '')

    if (reservedNames.test(fileNameWithoutExt)) {
      return { isValid: false, error: 'Invalid file name' }
    }

    // Check for alternate data streams (file.txt:stream)
    if (absolutePath.includes(':') && !absolutePath.match(/^[A-Za-z]:/)) {
      return { isValid: false, error: 'Invalid file path' }
    }
  }

  return { isValid: true, path: absolutePath }
}

export interface TrimOptions {
  inputPath: string
  outputPath?: string
  startTime: number
  endTime: number
  quality?: 'low' | 'medium' | 'high'
  codec?: 'copy' | 'h264' | 'h265'
}

export interface ThumbnailOptions {
  inputPath: string
  outputDir?: string
  count?: number
  interval?: number // seconds between thumbnails
  width?: number
}

export interface WaveformOptions {
  inputPath: string
  samples?: number // number of samples to return
}

/**
 * Get FFmpeg path using cross-platform resolution
 */
function getFFmpegPath(): string {
  const platform = PlatformUtils.getInstance()
  const resolved = platform.resolveExecutable('ffmpeg')
  return resolved || 'ffmpeg' // Fallback to system PATH
}

/**
 * Get FFprobe path using cross-platform resolution
 */
function getFFprobePath(): string {
  const platform = PlatformUtils.getInstance()
  const resolved = platform.resolveExecutable('ffprobe')
  return resolved || 'ffprobe' // Fallback to system PATH
}

/**
 * Setup video processing handlers
 */
export function setupVideoHandlers(): void {
  logger.info('Setting up video processing IPC handlers')

  // Get video metadata
  ipcMain.handle(IPC_CHANNELS.VIDEO_INFO, async (_event, filePath: string) => {
    try {
      // Validate path for security
      const validation = validateVideoPath(filePath)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid file path', 'INVALID_PATH')
      }

      if (!existsSync(validation.path!)) {
        return createErrorResponse('Video file not found', 'FILE_NOT_FOUND')
      }

      const metadata = await videoProcessor.getVideoMetadata(validation.path!)
      return createSuccessResponse(metadata)
    } catch (error) {
      logger.error('Failed to get video info', error as Error, { filePath })
      return createErrorResponse(`Failed to get video info: ${(error as Error).message}`, 'VIDEO_INFO_FAILED')
    }
  })

  // Trim video
  ipcMain.handle(IPC_CHANNELS.VIDEO_TRIM, async (_event, options: TrimOptions) => {
    try {
      const { inputPath, outputPath, startTime, endTime, quality, codec } = options

      // Validate input path for security
      const inputValidation = validateVideoPath(inputPath)
      if (!inputValidation.isValid) {
        return createErrorResponse(inputValidation.error || 'Invalid input path', 'INVALID_PATH')
      }

      if (!existsSync(inputValidation.path!)) {
        return createErrorResponse('Input video file not found', 'FILE_NOT_FOUND')
      }

      if (startTime >= endTime) {
        return createErrorResponse('Invalid time range', 'INVALID_TIME_RANGE')
      }

      // Validate output path if provided
      let validatedOutputPath: string
      if (outputPath) {
        const outputValidation = validateVideoPath(outputPath)
        if (!outputValidation.isValid) {
          return createErrorResponse(outputValidation.error || 'Invalid output path', 'INVALID_PATH')
        }
        validatedOutputPath = outputValidation.path!
      } else {
        validatedOutputPath = generateOutputPath(inputValidation.path!, startTime, endTime)
      }

      // Generate output path if not provided
      const finalOutputPath = validatedOutputPath

      // Ensure output directory exists
      await fileSystem.ensureDirectory(dirname(finalOutputPath))

      const timeRange: TimeRange = { start: startTime, end: endTime }
      const processingOptions: ProcessingOptions = {
        quality: quality || 'high',
        videoCodec: codec === 'copy' ? 'copy' : codec === 'h265' ? 'h265' : 'h264',
        audioCodec: codec === 'copy' ? 'copy' : 'aac',
      }

      await videoProcessor.trimVideo(inputValidation.path!, finalOutputPath, timeRange, processingOptions)

      logger.info('Video trimmed successfully', {
        inputPath: inputValidation.path,
        outputPath: finalOutputPath,
        startTime,
        endTime,
      })

      return createSuccessResponse({
        outputPath: finalOutputPath,
        duration: endTime - startTime,
      })
    } catch (error) {
      logger.error('Failed to trim video', error as Error, { options })
      return createErrorResponse(`Failed to trim video: ${(error as Error).message}`, 'VIDEO_TRIM_FAILED')
    }
  })

  // Generate preview/thumbnail
  ipcMain.handle(IPC_CHANNELS.VIDEO_PREVIEW, async (_event, inputPath: string, timePosition: number) => {
    try {
      // Validate path for security
      const validation = validateVideoPath(inputPath)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid file path', 'INVALID_PATH')
      }

      if (!existsSync(validation.path!)) {
        return createErrorResponse('Video file not found', 'FILE_NOT_FOUND')
      }

      const outputPath = await videoProcessor.generatePreview(validation.path!, timePosition)
      return createSuccessResponse({ outputPath })
    } catch (error) {
      logger.error('Failed to generate preview', error as Error, { inputPath, timePosition })
      return createErrorResponse(`Failed to generate preview: ${(error as Error).message}`, 'PREVIEW_FAILED')
    }
  })

  // Generate thumbnail strip for timeline
  ipcMain.handle('video:thumbnails', async (_event, options: ThumbnailOptions) => {
    try {
      const { inputPath, outputDir, count = 10, interval, width = 160 } = options

      // Validate path for security
      const validation = validateVideoPath(inputPath)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid file path', 'INVALID_PATH')
      }

      if (!existsSync(validation.path!)) {
        return createErrorResponse('Video file not found', 'FILE_NOT_FOUND')
      }

      // Get video duration first
      const metadata = await videoProcessor.getVideoMetadata(validation.path!)
      const duration = metadata.duration

      // Calculate interval if not provided
      const thumbInterval = interval || duration / count

      // Generate output directory
      const thumbDir = outputDir || join(dirname(validation.path!), '.thumbnails')
      await fileSystem.ensureDirectory(thumbDir)

      const thumbnails: string[] = []
      const ffmpegPath = getFFmpegPath()

      // Generate thumbnails at intervals
      for (let i = 0; i < count; i++) {
        const time = Math.min(i * thumbInterval, duration - 0.1)
        const outputPath = join(thumbDir, `thumb_${i.toString().padStart(3, '0')}.jpg`)

        await new Promise<void>((resolve, reject) => {
          const args = [
            '-ss',
            time.toString(),
            '-i',
            validation.path!,
            '-vframes',
            '1',
            '-vf',
            `scale=${width}:-1`,
            '-q:v',
            '3',
            '-y',
            outputPath,
          ]

          const ffmpeg = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })

          ffmpeg.on('close', code => {
            if (code === 0) {
              thumbnails.push(outputPath)
              resolve()
            } else {
              // Don't fail entirely if one thumbnail fails
              logger.warn('Failed to generate thumbnail', { time, code })
              resolve()
            }
          })

          ffmpeg.on('error', err => {
            logger.warn('FFmpeg error generating thumbnail', { error: err.message })
            resolve()
          })
        })
      }

      logger.info('Thumbnails generated', { count: thumbnails.length, inputPath: validation.path })

      return createSuccessResponse({
        thumbnails,
        interval: thumbInterval,
        duration,
      })
    } catch (error) {
      logger.error('Failed to generate thumbnails', error as Error, { options })
      return createErrorResponse(`Failed to generate thumbnails: ${(error as Error).message}`, 'THUMBNAILS_FAILED')
    }
  })

  // Extract waveform data
  ipcMain.handle('video:waveform', async (_event, options: WaveformOptions) => {
    try {
      const { inputPath, samples = 1000 } = options

      // Validate path for security
      const validation = validateVideoPath(inputPath)
      if (!validation.isValid) {
        return createErrorResponse(validation.error || 'Invalid file path', 'INVALID_PATH')
      }

      if (!existsSync(validation.path!)) {
        return createErrorResponse('Video file not found', 'FILE_NOT_FOUND')
      }

      const ffmpegPath = getFFmpegPath()

      // Use FFmpeg to extract audio peaks
      // This outputs raw audio samples that we'll analyze
      const waveformData = await new Promise<number[]>((resolve, reject) => {
        const args = [
          '-i',
          validation.path!,
          '-ac',
          '1', // Convert to mono
          '-filter:a',
          `aresample=8000,asetnsamples=n=${samples}`, // Resample and limit samples
          '-f',
          's16le', // 16-bit signed little-endian
          '-acodec',
          'pcm_s16le',
          'pipe:1', // Output to stdout
        ]

        const ffmpeg = spawn(ffmpegPath, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        const chunks: Buffer[] = []

        ffmpeg.stdout?.on('data', (data: Buffer) => {
          chunks.push(data)
        })

        ffmpeg.on('close', code => {
          if (code === 0 || chunks.length > 0) {
            const buffer = Buffer.concat(chunks)
            const peaks: number[] = []

            // Convert 16-bit samples to normalized peaks
            const samplesPerPeak = Math.max(1, Math.floor(buffer.length / 2 / samples))

            for (let i = 0; i < samples && i * samplesPerPeak * 2 < buffer.length; i++) {
              let max = 0
              for (let j = 0; j < samplesPerPeak && (i * samplesPerPeak + j) * 2 + 1 < buffer.length; j++) {
                const offset = (i * samplesPerPeak + j) * 2
                const sample = buffer.readInt16LE(offset)
                max = Math.max(max, Math.abs(sample))
              }
              // Normalize to 0-1 range
              peaks.push(max / 32768)
            }

            resolve(peaks)
          } else {
            // Return empty waveform if extraction fails
            logger.warn('Waveform extraction returned non-zero', { code })
            resolve(Array(samples).fill(0.1))
          }
        })

        ffmpeg.on('error', err => {
          logger.warn('FFmpeg error extracting waveform', { error: err.message })
          resolve(Array(samples).fill(0.1))
        })
      })

      logger.info('Waveform extracted', { samples: waveformData.length, inputPath: validation.path })

      return createSuccessResponse({
        waveform: waveformData,
        samples: waveformData.length,
      })
    } catch (error) {
      logger.error('Failed to extract waveform', error as Error, { options })
      return createErrorResponse(`Failed to extract waveform: ${(error as Error).message}`, 'WAVEFORM_FAILED')
    }
  })

  logger.info('Video processing IPC handlers initialized')
}

/**
 * Generate output path for trimmed video
 */
function generateOutputPath(inputPath: string, startTime: number, endTime: number): string {
  const dir = dirname(inputPath)
  const name = basename(inputPath, extname(inputPath))
  const ext = extname(inputPath)
  const timestamp = Date.now()

  const startFormatted = formatTimeForFilename(startTime)
  const endFormatted = formatTimeForFilename(endTime)

  return join(dir, `${name}_trimmed_${startFormatted}-${endFormatted}_${timestamp}${ext}`)
}

/**
 * Format time for filename (e.g., 1m30s)
 */
function formatTimeForFilename(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)

  if (mins > 0) {
    return `${mins}m${secs}s`
  }
  return `${secs}s`
}
