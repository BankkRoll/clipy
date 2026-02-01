/**
 * Video Processor Service
 * Handles video processing operations: trimming, preview generation, format conversion
 */

import { dirname, extname, join } from 'path'

import { ConfigManager } from '../utils/config'
import { FileSystemUtils } from '../utils/file-system'
import { Logger } from '../utils/logger'
import { existsSync } from 'fs'
import { spawn } from 'child_process'

export interface TimeRange {
  start: number // in seconds
  end: number // in seconds
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

export interface ProcessingOptions {
  quality?: 'low' | 'medium' | 'high'
  format?: 'mp4' | 'webm' | 'mkv'
  audioCodec?: 'aac' | 'mp3' | 'opus' | 'copy'
  videoCodec?: 'h264' | 'h265' | 'vp9' | 'copy'
  preset?: 'ultrafast' | 'fast' | 'medium' | 'slow'
}

export class VideoProcessor {
  private static instance: VideoProcessor
  private configManager = ConfigManager.getInstance()
  private logger = Logger.getInstance()
  private fileSystem = FileSystemUtils.getInstance()
  private ffmpegPath: string | null = null

  private constructor() {
    this.initializeFFmpeg()
  }

  static getInstance(): VideoProcessor {
    if (!VideoProcessor.instance) {
      VideoProcessor.instance = new VideoProcessor()
    }
    return VideoProcessor.instance
  }

  /**
   * Initialize FFmpeg path
   */
  private initializeFFmpeg(): void {
    // Try to find FFmpeg in resources or system PATH
    const possiblePaths = [
      join(process.cwd(), 'resources', 'ffmpeg.exe'),
      join(process.cwd(), 'resources', 'ffmpeg'),
      'ffmpeg', // System PATH
    ]

    for (const path of possiblePaths) {
      if (existsSync(path) || path === 'ffmpeg') {
        this.ffmpegPath = path
        this.logger.info('FFmpeg found', { path })
        break
      }
    }

    if (!this.ffmpegPath) {
      this.logger.warn('FFmpeg not found - video processing will be limited')
    }
  }

  /**
   * Parse frame rate from FFmpeg output (handles fractions like "30/1" or "29970/1000")
   */
  private parseFrameRate(frameRateStr: string): number {
    if (!frameRateStr || typeof frameRateStr !== 'string') {
      return 0
    }

    // Try parsing as a direct number first
    const directNumber = parseFloat(frameRateStr)
    if (!isNaN(directNumber) && isFinite(directNumber)) {
      return directNumber
    }

    // Handle fraction format like "30/1" or "29970/1000"
    const fractionMatch = frameRateStr.match(/^(\d+)\/(\d+)$/)
    if (fractionMatch) {
      const numerator = parseFloat(fractionMatch[1])
      const denominator = parseFloat(fractionMatch[2])

      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator
      }
    }

    return 0
  }

  /**
   * Check if FFmpeg is available
   */
  isFFmpegAvailable(): boolean {
    return this.ffmpegPath !== null
  }

  /**
   * Execute FFmpeg command
   */
  private async executeFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ffmpegPath) {
        reject(new Error('FFmpeg not available'))
        return
      }

      this.logger.debug('Executing FFmpeg command', { args })

      const ffmpeg = spawn(this.ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stderr = ''
      let stdout = ''

      ffmpeg.stdout?.on('data', data => {
        stdout += data.toString()
      })

      ffmpeg.stderr?.on('data', data => {
        stderr += data.toString()
      })

      ffmpeg.on('close', code => {
        if (code === 0) {
          this.logger.debug('FFmpeg command completed successfully')
          resolve()
        } else {
          const error = new Error(`FFmpeg failed with code ${code}: ${stderr}`)
          this.logger.error('FFmpeg command failed', error, { code, stderr, stdout })
          reject(error)
        }
      })

      ffmpeg.on('error', error => {
        this.logger.error('FFmpeg process error', error)
        reject(error)
      })
    })
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
    try {
      const ffprobePath = this.ffmpegPath?.replace('ffmpeg', 'ffprobe') ?? 'ffprobe'

      const args = ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath]

      const result = await this.executeFFprobe(ffprobePath, args)
      const data = JSON.parse(result)

      const videoStream = data.streams.find((s: any) => s.codec_type === 'video')
      const format = data.format

      if (!videoStream) {
        throw new Error('No video stream found')
      }

      return {
        duration: parseFloat(format.duration) || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        bitrate: parseInt(format.bit_rate) || 0,
        codec: videoStream.codec_name || 'unknown',
        size: parseInt(format.size) || 0,
        fps: this.parseFrameRate(videoStream.r_frame_rate) || 0,
      }
    } catch (error) {
      this.logger.error('Failed to get video metadata', error as Error, { filePath })
      throw new Error(`Failed to get video metadata: ${(error as Error).message}`)
    }
  }

  /**
   * Generate video preview/thumbnail
   */
  async generatePreview(
    inputPath: string,
    timePosition: number = 1, // seconds into video
    outputPath?: string,
  ): Promise<string> {
    try {
      if (!existsSync(inputPath)) {
        throw new Error('Input video file does not exist')
      }

      const outputDir = dirname(inputPath)
      const inputName = inputPath.replace(extname(inputPath), '')
      const finalOutputPath = outputPath || `${inputName}_preview.jpg`

      // Ensure output directory exists
      await this.fileSystem.ensureDirectory(outputDir)

      const args = [
        '-i',
        inputPath,
        '-ss',
        timePosition.toString(),
        '-vframes',
        '1',
        '-q:v',
        '2', // High quality
        '-y', // Overwrite output
        finalOutputPath,
      ]

      await this.executeFFmpeg(args)

      this.logger.info('Preview generated successfully', {
        input: inputPath,
        output: finalOutputPath,
        timePosition,
      })

      return finalOutputPath
    } catch (error) {
      this.logger.error('Failed to generate preview', error as Error, {
        inputPath,
        timePosition,
      })
      throw new Error(`Failed to generate preview: ${(error as Error).message}`)
    }
  }

  /**
   * Trim video to specified time range
   */
  async trimVideo(
    inputPath: string,
    outputPath: string,
    timeRange: TimeRange,
    options: ProcessingOptions = {},
  ): Promise<void> {
    try {
      if (!existsSync(inputPath)) {
        throw new Error('Input video file does not exist')
      }

      // Ensure output directory exists
      await this.fileSystem.ensureDirectory(dirname(outputPath))

      const duration = timeRange.end - timeRange.start
      if (duration <= 0) {
        throw new Error('Invalid time range: end time must be greater than start time')
      }

      // Build FFmpeg arguments
      const args = [
        '-i',
        inputPath,
        '-ss',
        timeRange.start.toString(),
        '-t',
        duration.toString(),
        '-c:v',
        options.videoCodec || 'copy', // Copy video codec by default
        '-c:a',
        options.audioCodec || 'copy', // Copy audio codec by default
      ]

      // Add quality/preset options if re-encoding
      if (options.videoCodec !== 'copy') {
        if (options.preset) {
          args.push('-preset', options.preset)
        }
        if (options.quality) {
          const crf = this.getCRFValue(options.quality)
          args.push('-crf', crf.toString())
        }
      }

      // Output options
      args.push('-avoid_negative_ts', 'make_zero')
      args.push('-y', outputPath) // Overwrite output

      await this.executeFFmpeg(args)

      this.logger.info('Video trimmed successfully', {
        input: inputPath,
        output: outputPath,
        start: timeRange.start,
        end: timeRange.end,
        duration,
        options,
      })
    } catch (error) {
      this.logger.error('Failed to trim video', error as Error, {
        inputPath,
        outputPath,
        timeRange,
        options,
      })
      throw new Error(`Failed to trim video: ${(error as Error).message}`)
    }
  }

  /**
   * Convert video format
   */
  async convertVideo(inputPath: string, outputPath: string, options: ProcessingOptions = {}): Promise<void> {
    try {
      if (!existsSync(inputPath)) {
        throw new Error('Input video file does not exist')
      }

      await this.fileSystem.ensureDirectory(dirname(outputPath))

      const args = ['-i', inputPath, '-c:v', options.videoCodec || 'libx264', '-c:a', options.audioCodec || 'aac']

      // Add quality settings
      if (options.quality) {
        const crf = this.getCRFValue(options.quality)
        args.push('-crf', crf.toString())
      }

      if (options.preset) {
        args.push('-preset', options.preset)
      }

      args.push('-y', outputPath)

      await this.executeFFmpeg(args)

      this.logger.info('Video converted successfully', {
        input: inputPath,
        output: outputPath,
        options,
      })
    } catch (error) {
      this.logger.error('Failed to convert video', error as Error, {
        inputPath,
        outputPath,
        options,
      })
      throw new Error(`Failed to convert video: ${(error as Error).message}`)
    }
  }

  /**
   * Extract audio from video
   */
  async extractAudio(inputPath: string, outputPath: string, options: ProcessingOptions = {}): Promise<void> {
    try {
      if (!existsSync(inputPath)) {
        throw new Error('Input video file does not exist')
      }

      await this.fileSystem.ensureDirectory(dirname(outputPath))

      const args = [
        '-i',
        inputPath,
        '-vn', // No video
        '-c:a',
        options.audioCodec || 'libmp3lame',
      ]

      // Add audio quality settings
      if (options.quality) {
        const bitrate = this.getAudioBitrate(options.quality)
        args.push('-b:a', bitrate)
      }

      args.push('-y', outputPath)

      await this.executeFFmpeg(args)

      this.logger.info('Audio extracted successfully', {
        input: inputPath,
        output: outputPath,
        options,
      })
    } catch (error) {
      this.logger.error('Failed to extract audio', error as Error, {
        inputPath,
        outputPath,
        options,
      })
      throw new Error(`Failed to extract audio: ${(error as Error).message}`)
    }
  }

  /**
   * Merge video and audio streams
   */
  async mergeStreams(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    options: ProcessingOptions = {},
  ): Promise<void> {
    try {
      if (!existsSync(videoPath) || !existsSync(audioPath)) {
        throw new Error('Input files do not exist')
      }

      await this.fileSystem.ensureDirectory(dirname(outputPath))

      const args = [
        '-i',
        videoPath,
        '-i',
        audioPath,
        '-c:v',
        options.videoCodec || 'copy',
        '-c:a',
        options.audioCodec || 'aac',
        '-shortest', // End when shortest stream ends
        '-y',
        outputPath,
      ]

      await this.executeFFmpeg(args)

      this.logger.info('Streams merged successfully', {
        video: videoPath,
        audio: audioPath,
        output: outputPath,
        options,
      })
    } catch (error) {
      this.logger.error('Failed to merge streams', error as Error, {
        videoPath,
        audioPath,
        outputPath,
        options,
      })
      throw new Error(`Failed to merge streams: ${(error as Error).message}`)
    }
  }

  /**
   * Get CRF value for quality setting
   */
  private getCRFValue(quality: 'low' | 'medium' | 'high'): number {
    switch (quality) {
      case 'low':
        return 28 // Lower quality, smaller file
      case 'medium':
        return 23 // Balanced
      case 'high':
        return 18 // High quality, larger file
      default:
        return 23
    }
  }

  /**
   * Get audio bitrate for quality setting
   */
  private getAudioBitrate(quality: 'low' | 'medium' | 'high'): string {
    switch (quality) {
      case 'low':
        return '128k'
      case 'medium':
        return '192k'
      case 'high':
        return '320k'
      default:
        return '192k'
    }
  }

  /**
   * Execute ffprobe command
   */
  private async executeFFprobe(ffprobePath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!ffprobePath) {
        reject(new Error('FFprobe not available'))
        return
      }

      this.logger.debug('Executing ffprobe command', { args })

      const ffprobe = spawn(ffprobePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stdout = ''
      let stderr = ''

      ffprobe.stdout?.on('data', data => {
        stdout += data.toString()
      })

      ffprobe.stderr?.on('data', data => {
        stderr += data.toString()
      })

      ffprobe.on('close', code => {
        if (code === 0) {
          this.logger.debug('FFprobe command completed successfully')
          resolve(stdout)
        } else {
          const error = new Error(`FFprobe failed with code ${code}: ${stderr}`)
          this.logger.error('FFprobe command failed', error, { code, stderr, stdout })
          reject(error)
        }
      })

      ffprobe.on('error', error => {
        this.logger.error('FFprobe process error', error)
        reject(error)
      })
    })
  }
}
