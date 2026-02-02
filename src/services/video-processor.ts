/**
 * Video Processor Service
 * Handles video processing operations: trimming, preview generation, format conversion
 */

import { dirname, extname } from 'path'

import { ConfigManager } from '../utils/config'
import { FileSystemUtils } from '../utils/file-system'
import { Logger } from '../utils/logger'
import { PlatformUtils } from '../utils/platform'
import { existsSync, statSync } from 'fs'
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
   * Initialize FFmpeg path using cross-platform resolution
   */
  private initializeFFmpeg(): void {
    const platform = PlatformUtils.getInstance()
    const resolved = platform.resolveExecutable('ffmpeg')

    if (resolved) {
      this.ffmpegPath = resolved
      this.logger.info('FFmpeg found', { path: resolved })
    } else {
      // Fallback to system PATH
      this.ffmpegPath = 'ffmpeg'
      this.logger.warn('FFmpeg not found in resources, falling back to system PATH')
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
   * Get video metadata using ffprobe (with ffmpeg fallback)
   */
  async getVideoMetadata(filePath: string): Promise<VideoMetadata> {
    // First try ffprobe (preferred, more accurate)
    try {
      const ffprobePath = this.ffmpegPath?.replace('ffmpeg', 'ffprobe') ?? 'ffprobe'

      // Check if ffprobe exists before trying to use it
      const ffprobeExists = existsSync(ffprobePath) || ffprobePath === 'ffprobe'

      if (ffprobeExists) {
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
      }
    } catch (error) {
      this.logger.warn('FFprobe failed, falling back to ffmpeg', { error: (error as Error).message })
    }

    // Fallback: use ffmpeg -i to parse metadata
    try {
      this.logger.info('Using ffmpeg fallback for metadata extraction', { filePath })
      return await this.getMetadataViaFFmpeg(filePath)
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

  /**
   * Get video metadata using ffmpeg -i (fallback when ffprobe not available)
   * Parses the stderr output from ffmpeg which contains video information
   */
  private async getMetadataViaFFmpeg(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      if (!this.ffmpegPath) {
        reject(new Error('FFmpeg not available'))
        return
      }

      this.logger.debug('Getting metadata via ffmpeg -i', { filePath })

      // ffmpeg -i <file> outputs info to stderr and exits with error (no output file)
      const ffmpeg = spawn(this.ffmpegPath, ['-i', filePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      })

      let stderr = ''

      ffmpeg.stderr?.on('data', data => {
        stderr += data.toString()
      })

      ffmpeg.on('close', () => {
        // ffmpeg -i always exits with code 1 when no output specified, but that's fine
        try {
          const metadata = this.parseFFmpegOutput(stderr, filePath)
          this.logger.debug('Parsed metadata from ffmpeg', { metadata })
          resolve(metadata)
        } catch (error) {
          this.logger.error('Failed to parse ffmpeg output', error as Error, { stderr })
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
   * Parse ffmpeg -i output to extract video metadata
   * Example output:
   *   Duration: 00:05:10.23, start: 0.000000, bitrate: 1234 kb/s
   *   Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps
   */
  private parseFFmpegOutput(output: string, filePath: string): VideoMetadata {
    const metadata: VideoMetadata = {
      duration: 0,
      width: 0,
      height: 0,
      bitrate: 0,
      codec: 'unknown',
      size: 0,
      fps: 0,
    }

    // Parse duration: "Duration: 00:05:10.23"
    const durationMatch = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i)
    if (durationMatch) {
      const hours = parseInt(durationMatch[1], 10)
      const minutes = parseInt(durationMatch[2], 10)
      const seconds = parseFloat(durationMatch[3])
      metadata.duration = hours * 3600 + minutes * 60 + seconds
    }

    // Parse bitrate: "bitrate: 1234 kb/s"
    const bitrateMatch = output.match(/bitrate:\s*(\d+)\s*kb\/s/i)
    if (bitrateMatch) {
      metadata.bitrate = parseInt(bitrateMatch[1], 10) * 1000 // Convert to bits
    }

    // Parse video stream: "Stream #0:0: Video: h264, yuv420p, 1920x1080"
    // or "Stream #0:0(und): Video: h264 (High), ..."
    const videoStreamMatch = output.match(/Stream\s+#\d+:\d+[^:]*:\s*Video:\s*([^\s,]+)[^,]*,\s*[^,]+,\s*(\d+)x(\d+)/i)
    if (videoStreamMatch) {
      metadata.codec = videoStreamMatch[1]
      metadata.width = parseInt(videoStreamMatch[2], 10)
      metadata.height = parseInt(videoStreamMatch[3], 10)
    }

    // Parse fps: "30 fps" or "29.97 fps" or "30 tbr"
    const fpsMatch = output.match(/(\d+(?:\.\d+)?)\s*(?:fps|tbr)/i)
    if (fpsMatch) {
      metadata.fps = parseFloat(fpsMatch[1])
    }

    // Try to get file size from filesystem
    try {
      const stats = statSync(filePath)
      metadata.size = stats.size
    } catch {
      // Ignore file size errors
    }

    return metadata
  }
}
