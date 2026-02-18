/**
 * yt-dlp Provider
 * Low-level wrapper around the yt-dlp binary for video downloading.
 *
 * Handles:
 * - Binary detection (yt-dlp, ffmpeg) across platforms
 * - Cookie management for authenticated requests
 * - Format selection (avoiding HLS streams that get 403 blocked)
 * - Progress parsing from yt-dlp stdout
 * - Video info extraction via --dump-json
 *
 * Based on the Python yt-dlp wrapper patterns.
 */

import { DownloadErrorCode, createDownloadError } from '../../types/download'
import type { DownloadOptions, DownloadProgress, VideoFormatInfo, VideoInfo } from '../../types/download'
import { dirname, extname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { EventEmitter } from 'events'
import { PlatformUtils } from '../../utils/platform'
import { Logger } from '../../utils/logger'
import { get } from 'https'
import { homedir } from 'os'
import { spawn } from 'child_process'
// NOTE: Storage operations are handled by download-manager.ts, not here

const logger = Logger.getInstance()

// Cross-platform binary detection
function detectFfmpegPath(): string | null {
  return PlatformUtils.getInstance().resolveExecutable('ffmpeg')
}

function detectYtdlpPath(): string | null {
  return PlatformUtils.getInstance().resolveExecutable('yt-dlp')
}

// Cookie Manager (matching Python CookieManager class)
class CookieManager {
  private cookieFile: string
  private platform = PlatformUtils.getInstance()

  constructor() {
    const cookiesDir = join(this.platform.getAppDataDir('clipy'), 'cookies')
    this.cookieFile = join(cookiesDir, 'youtube_cookies.txt')
    this.ensureCookieFile()
  }

  private ensureCookieFile(): void {
    try {
      const cookiesDir = dirname(this.cookieFile)
      if (!existsSync(cookiesDir)) {
        mkdirSync(cookiesDir, { recursive: true })
      }

      if (!existsSync(this.cookieFile)) {
        const header = '# Netscape HTTP Cookie File\n# This is a generated file! Do not edit.\n\n'
        writeFileSync(this.cookieFile, header, 'utf8')
      }
    } catch (error) {
      logger.error('Failed to ensure cookie file', error as Error)
    }
  }

  hasValidCookies(): boolean {
    try {
      const content = readFileSync(this.cookieFile, 'utf8').trim()
      const lines = content.split('\n').filter(line => line && !line.startsWith('#'))
      return lines.length > 0
    } catch {
      return false
    }
  }

  getCookieFilePath(): string {
    return this.cookieFile
  }
}

// Global instances (matching Python globals)
const cookieManager = new CookieManager()
const FFMPEG_PATH = detectFfmpegPath()
const YTDLP_PATH = detectYtdlpPath()

// Enhanced yt-dlp options (matching Python get_enhanced_ydl_opts)
function getEnhancedYtdlpOptions(baseOpts: Record<string, any> = {}): Record<string, any> {
  const simpleOpts: Record<string, any> = {
    quiet: true,
    noWarnings: true,
    retries: 1,
    extractorRetries: 1,
    fragmentRetries: 2,
  }

  // Add FFmpeg location if available
  if (FFMPEG_PATH) {
    simpleOpts.ffmpegLocation = FFMPEG_PATH
  }

  // Add cookies if available
  if (cookieManager.hasValidCookies()) {
    simpleOpts.cookiefile = cookieManager.getCookieFilePath()
  }

  return { ...simpleOpts, ...baseOpts }
}

// Format selection (matching Python get_format_selector and get_audio_format_selector)
// IMPORTANT: Avoid HLS (m3u8) formats as YouTube blocks them with 403 errors
// Maps user-selected quality (4K, 1080p, etc.) to yt-dlp format selectors
function getFormatSelector(quality: string, audioFormatId: string): string | null {
  // Convert format ids to yt-dlp selectors
  // Prefer AAC/MP3 audio over Opus for better compatibility with media players
  // Use [protocol!=m3u8] to avoid HLS streams that get 403 blocked
  const compatibleAudioSelector =
    'bestaudio[ext=m4a][protocol!=m3u8]/bestaudio[acodec=aac][protocol!=m3u8]/bestaudio[ext=mp3][protocol!=m3u8]/bestaudio[protocol!=m3u8]'

  // Map user-selected quality to yt-dlp format selectors
  // IMPORTANT: Respect user's quality choice for downloads!
  switch (quality) {
    case '4K':
    case '2160p':
      // 4K/2160p - highest quality available
      return `bestvideo[height<=2160][protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[protocol!=m3u8]`
    case '1440p':
      // 1440p/2K
      return `bestvideo[height<=1440][protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[height<=1440][protocol!=m3u8]`
    case '1080p':
      // Full HD
      return `bestvideo[height<=1080][protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[height<=1080][protocol!=m3u8]`
    case '720p':
    case 'hd_720p':
      // HD
      return `bestvideo[height<=720][protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[height<=720][protocol!=m3u8]`
    case '480p':
      // SD
      return `bestvideo[height<=480][protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[height<=480][protocol!=m3u8]`
    case '360p':
    case 'eco_360p':
      // Low quality
      return `best[height<=720][protocol!=m3u8][protocol!=m3u8_native]/bestvideo[height<=360][protocol!=m3u8]+${compatibleAudioSelector}`
    case '240p':
    case '144p':
      // Very low quality
      return `best[height<=360][protocol!=m3u8][protocol!=m3u8_native]/bestvideo[height<=240][protocol!=m3u8]+${compatibleAudioSelector}`
    case 'best':
    case 'highest':
    case 'auto':
    default:
      // Best available quality - NO height restriction
      return `bestvideo[protocol!=m3u8][protocol!=m3u8_native]+${compatibleAudioSelector}/best[protocol!=m3u8][protocol!=m3u8_native]`
  }
}

function getAudioFormatSelector(formatId: string): string {
  // Prefer AAC/MP3 audio codecs over Opus for better media player compatibility
  const compatibleAudio =
    'bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio[acodec=mp4a]/bestaudio[ext=mp3]/bestaudio[acodec=mp3]/bestaudio'

  const selectors: Record<string, string> = {
    auto_audio: compatibleAudio,
    high_audio: compatibleAudio,
    medium_audio:
      'bestaudio[abr<=128][ext=m4a]/bestaudio[abr<=128][acodec=aac]/bestaudio[abr<=128][ext=mp3]/bestaudio[abr<=128][acodec=mp3]/bestaudio[abr<=128]',
  }
  return selectors[formatId] || compatibleAudio
}

// Time range options (matching Python get_ydl_opts_with_time_range)
function getYtdlpOptsWithTimeRange(
  baseOpts: Record<string, any>,
  timeRange: { start: number; end: number } | null,
): Record<string, any> {
  if (timeRange) {
    baseOpts.downloadSections = `*${timeRange.start}-${timeRange.end}`
  }
  return baseOpts
}

// Download and save thumbnail image
async function downloadThumbnail(thumbnailUrl: string, outputPath: string): Promise<string | null> {
  return new Promise(resolve => {
    // Ensure output directory exists
    const outputDir = dirname(outputPath)
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true })
    }

    // Get the original extension from the URL, default to jpg
    const urlExt = extname(thumbnailUrl).toLowerCase() || '.jpg'
    const finalOutputPath = outputPath.replace(/\.(jpg|jpeg|png|webp)$/i, urlExt)

    const file = writeFileSync(finalOutputPath, '', { flag: 'w' })
    const request = get(thumbnailUrl, response => {
      if (response.statusCode !== 200) {
        logger.warn('Failed to download thumbnail', { statusCode: response.statusCode })
        resolve(null)
        return
      }

      const chunks: Buffer[] = []
      response.on('data', chunk => {
        chunks.push(chunk)
      })

      response.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks)
          writeFileSync(finalOutputPath, buffer)
          logger.debug('Saved thumbnail', { path: finalOutputPath })
          resolve(finalOutputPath)
        } catch (error) {
          logger.error('Failed to save thumbnail', error instanceof Error ? error : new Error(String(error)))
          resolve(null)
        }
      })
    })

    request.on('error', error => {
      logger.error('Thumbnail request failed', error)
      resolve(null)
    })

    request.setTimeout(10000, () => {
      logger.warn('Thumbnail download timeout')
      request.destroy()
      resolve(null)
    })
  })
}

// Main download function using yt-dlp (matching Python download_with_fallback)
export async function downloadWithYtdlp(
  videoId: string,
  options: DownloadOptions,
  progress: DownloadProgress,
  videoInfo: VideoInfo,
  eventEmitter: EventEmitter,
  controller: AbortController,
): Promise<void> {
  logger.info('Starting download', {
    videoId,
    downloadId: progress.downloadId,
    hasCookies: cookieManager.hasValidCookies(),
    hasFFmpeg: FFMPEG_PATH !== null,
    hasYtdlp: YTDLP_PATH !== null,
  })

  if (!YTDLP_PATH) {
    throw createDownloadError('yt-dlp not found', DownloadErrorCode.UNKNOWN_ERROR)
  }

  return new Promise<void>((resolve, reject) => {
    const cleanupAndReject = (error: unknown) => {
      reject(error)
    }

    controller.signal.addEventListener('abort', () => {
      logger.info('Download aborted', { downloadId: progress.downloadId })
      cleanupAndReject(createDownloadError('Download cancelled by user', DownloadErrorCode.DOWNLOAD_CANCELLED))
    })
    ;(async () => {
      try {
        // Generate output filename (matching Python logic)
        const title = sanitizeFilename(`video_${videoId}`) // Simplified - would get real title
        const quality = options.quality || '720p'
        const timestamp = Date.now() % 100000

        let outputTemplate = join(
          options.outputPath || join(homedir(), 'Downloads', 'Clipy'),
          `${title}_${quality}_${timestamp}.%(ext)s`,
        )

        if (options.startTime || options.endTime) {
          const startStr = options.startTime ? formatTimeForFilename(options.startTime!) : '00m00s'
          const endStr = options.endTime ? formatTimeForFilename(options.endTime!) : 'end'
          outputTemplate = join(
            options.outputPath || join(homedir(), 'Downloads', 'Clipy'),
            `${title}_${quality}_trimmed_${startStr}-${endStr}_${timestamp}.%(ext)s`,
          )
        }

        // Build yt-dlp options
        const baseOpts: Record<string, any> = {
          outtmpl: outputTemplate,
          mergeOutputFormat: 'mp4',
          // Force AAC audio codec for maximum compatibility with media players
          audioCodec: 'aac',
          audioQuality: '128K',
        }

        // Use format selector based on USER'S SELECTED QUALITY
        // IMPORTANT: Respect the user's quality choice for downloads!
        // options.quality comes from the UI (4K, 1080p, 720p, etc.)
        const userQuality = options.quality || 'best' // Default to best if not specified
        logger.debug('Using user-selected quality for download', { quality: userQuality })
        const formatSelector = getFormatSelector(userQuality, 'auto_audio')
        if (formatSelector) {
          baseOpts.format = formatSelector
        }

        // Add time range if specified (both start and end must be valid numbers)
        if (options.startTime !== undefined || options.endTime !== undefined) {
          const start = options.startTime || 0
          const end = options.endTime
          if (end !== undefined && end > start) {
            baseOpts.timeRange = { start, end }
            logger.debug('Time range set', { start, end })
          } else {
            logger.debug('Invalid time range, downloading full video')
          }
        }

        const opts = getYtdlpOptsWithTimeRange(baseOpts, baseOpts.timeRange)
        const finalOpts = getEnhancedYtdlpOptions(opts)

        logger.debug('Final yt-dlp options', finalOpts)

        logger.debug('Starting yt-dlp process')

        // Convert options to command line args (matching Python subprocess call)
        const args: string[] = []

        // Don't use --quiet so we can parse progress output
        // if (finalOpts.quiet) args.push('--quiet')
        args.push('--progress') // Ensure progress output is shown
        args.push('--newline') // Output progress in newlines for parsing
        if (finalOpts.noWarnings) args.push('--no-warnings')
        if (finalOpts.outtmpl) args.push('-o', finalOpts.outtmpl)
        if (finalOpts.format) args.push('-f', finalOpts.format)
        if (finalOpts.mergeOutputFormat) args.push('--merge-output-format', finalOpts.mergeOutputFormat)
        if (finalOpts.cookiefile) args.push('--cookies', finalOpts.cookiefile)
        if (finalOpts.ffmpegLocation) args.push('--ffmpeg-location', finalOpts.ffmpegLocation)
        if (finalOpts.downloadSections) args.push('--download-sections', finalOpts.downloadSections)
        // Force AAC audio codec for maximum compatibility
        if (finalOpts.audioCodec) args.push('--audio-format', finalOpts.audioCodec)
        if (finalOpts.audioQuality) args.push('--audio-quality', finalOpts.audioQuality)

        args.push(`https://www.youtube.com/watch?v=${videoId}`)

        logger.debug('Running yt-dlp', { command: `${YTDLP_PATH} ${args.join(' ')}` })

        // Spawn yt-dlp process (matching Python subprocess)
        const ytdlpProcess = spawn(YTDLP_PATH, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
        })

        let stderr = ''
        let lastActivityTime = Date.now()

        // Track highest progress seen to prevent regression (yt-dlp can output lower values during network fluctuations)
        let highestProgress = 0
        let lastValidSpeed = '0 B/s'
        let lastValidEta = '--:--'

        // Parse yt-dlp progress output
        ytdlpProcess.stdout?.on('data', data => {
          lastActivityTime = Date.now() // Reset activity timer
          const output = data.toString()

          // Log all output for debugging
          logger.debug('yt-dlp output', { stdout: output.trim() })

          // Parse yt-dlp progress format: [download] 45.2% of 123.45MiB at 1.23MiB/s ETA 01:23
          const progressMatch = output.match(
            /\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/i,
          )
          if (progressMatch) {
            const [, percent, size, speed, eta] = progressMatch
            const newProgress = parseFloat(percent)

            // Only update progress if it's >= current highest (monotonically increasing)
            // This prevents the UI from showing progress going backwards during network hiccups
            if (newProgress >= highestProgress) {
              highestProgress = newProgress
              progress.progress = Math.round(newProgress * 10) / 10 // Round to 1 decimal place
              progress.size = size

              // Only update speed/eta if they're valid (not "Unknown")
              if (!speed.includes('Unknown')) {
                lastValidSpeed = speed
              }
              if (!eta.includes('Unknown')) {
                lastValidEta = eta
              }
              progress.speed = lastValidSpeed
              progress.eta = lastValidEta
              progress.status = 'downloading'
              eventEmitter.emit('progress', progress)
            }
          }

          // Also handle "Unknown" speed/eta lines separately - don't regress progress
          const unknownMatch = output.match(/\[download\]\s+([\d.]+)%\s+of\s+([\d.]+\w+)\s+at\s+Unknown/)
          if (unknownMatch) {
            const [, percent, size] = unknownMatch
            const newProgress = parseFloat(percent)
            if (newProgress >= highestProgress) {
              highestProgress = newProgress
              progress.progress = Math.round(newProgress * 10) / 10
              progress.size = size
              // Keep the last valid speed/eta
              progress.speed = lastValidSpeed
              progress.eta = lastValidEta
              progress.status = 'downloading'
              eventEmitter.emit('progress', progress)
            }
          }

          // Match "already downloaded" message
          if (output.includes('has already been downloaded')) {
            logger.info('Video already downloaded, skipping')
            highestProgress = 100
            progress.progress = 100
            progress.status = 'downloading'
            eventEmitter.emit('progress', progress)
          }

          // Match merging/post-processing
          if (output.includes('[Merger]') || output.includes('[ffmpeg]') || output.includes('Merging')) {
            logger.debug('Post-processing/merging')
            progress.status = 'downloading'
            progress.speed = 'Processing...'
            eventEmitter.emit('progress', progress)
          }

          // Also match fragment download format (use monotonic progress)
          const fragMatch = output.match(/\[download\]\s+Downloading\s+item\s+(\d+)\s+of\s+(\d+)/)
          if (fragMatch) {
            const [, current, total] = fragMatch
            const fragProgress = (parseInt(current) / parseInt(total)) * 100
            // Only update if progress increased
            if (fragProgress >= highestProgress) {
              highestProgress = fragProgress
              progress.progress = Math.round(fragProgress)
              progress.status = 'downloading'
              eventEmitter.emit('progress', progress)
            }
          }
        })

        ytdlpProcess.stderr?.on('data', data => {
          lastActivityTime = Date.now() // Reset activity timer
          const errOutput = data.toString()
          stderr += errOutput
          // Log stderr for debugging (yt-dlp often outputs info to stderr)
          logger.debug('yt-dlp stderr', { stderr: errOutput.trim() })
        })

        // Add timeout to prevent hanging processes - 15 minutes for large files
        // Also check for stalled downloads (no activity for 5 minutes to allow for post-processing)
        const DOWNLOAD_TIMEOUT = 900000 // 15 minutes total timeout
        const STALL_TIMEOUT = 300000 // 5 minutes stall detection (merging can take time)

        const timeout = setTimeout(() => {
          logger.warn('Download timeout reached, killing process')
          progress.status = 'failed'
          progress.error = createDownloadError('Download timeout reached', DownloadErrorCode.TIMEOUT)
          // NOTE: Storage is handled by download-manager.ts
          eventEmitter.emit('failed', progress)
          ytdlpProcess.kill('SIGTERM')
        }, DOWNLOAD_TIMEOUT)

        // Check for stalled downloads every 30 seconds
        const stallCheck = setInterval(() => {
          const timeSinceActivity = Date.now() - lastActivityTime
          if (timeSinceActivity > STALL_TIMEOUT) {
            logger.warn('Download stalled, killing process', { inactiveSeconds: Math.round(timeSinceActivity / 1000) })
            clearInterval(stallCheck)
            progress.status = 'failed'
            progress.error = createDownloadError('Download stalled - no activity', DownloadErrorCode.TIMEOUT)
            // NOTE: Storage is handled by download-manager.ts
            eventEmitter.emit('failed', progress)
            ytdlpProcess.kill('SIGTERM')
          }
        }, 30000)

        ytdlpProcess.on('close', async code => {
          clearTimeout(timeout)
          clearInterval(stallCheck)
          if (code === 0) {
            logger.info('yt-dlp completed successfully')

            // Find the downloaded file (matching Python's robust file detection)
            const baseName = outputTemplate.replace('.%(ext)s', '')
            const extensions = ['mp4', 'm4a', 'webm', 'mkv', 'mov', 'avi']
            let actualFile: string | null = null

            logger.debug('Looking for downloaded file', { baseName })

            for (const ext of extensions) {
              const testFile = `${baseName}.${ext}`
              logger.debug('Checking for file', { path: testFile })
              if (existsSync(testFile)) {
                actualFile = testFile
                logger.debug('Found downloaded file', { path: actualFile })
                break
              }
            }

            if (!actualFile) {
              logger.warn('Downloaded file not found', { baseName, searchedExtensions: extensions })
              throw createDownloadError('Downloaded file not found', DownloadErrorCode.UNKNOWN_ERROR)
            }

            progress.filePath = actualFile

            // Download thumbnail if requested
            if (options.downloadThumbnail && videoInfo.thumbnails.length > 0) {
              logger.debug('Downloading thumbnail')
              const thumbnailUrl = videoInfo.thumbnails[videoInfo.thumbnails.length - 1]?.url // Use highest quality thumbnail
              if (thumbnailUrl) {
                const thumbnailFilename = `${sanitizeFilename(videoInfo.title)}_thumbnail.jpg`
                const thumbnailPath = join(dirname(actualFile), thumbnailFilename)
                const savedThumbnailPath = await downloadThumbnail(thumbnailUrl, thumbnailPath)
                if (savedThumbnailPath) {
                  progress.thumbnailPath = savedThumbnailPath
                }
              }
            }

            progress.status = 'completed'
            progress.progress = 100

            // NOTE: Storage is handled by download-manager.ts
            // Emit events so download-manager can save with correct job.id
            eventEmitter.emit('progress', progress)
            eventEmitter.emit('completed', progress)

            logger.info('Download completed', { filePath: actualFile })

            resolve()
          } else {
            logger.error('yt-dlp failed', new Error(`Exit code ${code}: ${stderr}`))
            reject(createDownloadError(`yt-dlp failed: ${stderr}`, DownloadErrorCode.UNKNOWN_ERROR))
          }
        })

        ytdlpProcess.on('error', error => {
          clearTimeout(timeout)
          clearInterval(stallCheck)
          logger.error('yt-dlp process error', error)
          progress.status = 'failed'
          const downloadError = createDownloadError(`Process error: ${error.message}`, DownloadErrorCode.UNKNOWN_ERROR)
          progress.error = downloadError

          // NOTE: Storage is handled by download-manager.ts
          eventEmitter.emit('failed', progress)
          reject(downloadError)
        })
      } catch (error) {
        logger.error('Download failed', error instanceof Error ? error : new Error(String(error)))
        cleanupAndReject(error)
      }
    })()
  })
}

// Legacy exports for compatibility (keeping youtubei.js interface)
export async function initializeYtdlp(): Promise<void> {
  // No-op - we're using yt-dlp now
  logger.info('yt-dlp provider initialized')
}

export async function getVideoInfoFromYtdlp(videoId: string): Promise<VideoInfo> {
  if (!YTDLP_PATH) {
    throw createDownloadError('yt-dlp not found', DownloadErrorCode.UNKNOWN_ERROR)
  }

  try {
    // Use yt-dlp to extract video info (similar to Python extract_video_info_with_fallback)
    // NOTE: Don't use --quiet as it may suppress format URLs in some yt-dlp versions
    // Use --no-warnings only to keep stderr clean while preserving full JSON output
    const args = ['--no-warnings', '--dump-json', `https://www.youtube.com/watch?v=${videoId}`]

    // Add cookies if available
    if (cookieManager.hasValidCookies()) {
      args.splice(2, 0, '--cookies', cookieManager.getCookieFilePath())
    }

    logger.debug('Running yt-dlp info extraction', { command: args.join(' ') })

    const ytProcess = spawn(YTDLP_PATH, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    })

    let stdout = ''
    let stderr = ''

    ytProcess.stdout?.on('data', data => {
      stdout += data.toString()
    })

    ytProcess.stderr?.on('data', data => {
      stderr += data.toString()
    })

    return new Promise((resolve, reject) => {
      ytProcess.on('close', code => {
        if (code === 0 && stdout) {
          try {
            const info = JSON.parse(stdout.trim())

            // Convert yt-dlp info to our VideoInfo format
            const videoInfo: VideoInfo = {
              id: info.id || videoId,
              title: info.title || `Video ${videoId}`,
              description: info.description || '',
              duration: info.duration || 0,
              durationFormatted: formatDuration(info.duration || 0),
              channel: {
                name: info.uploader || 'Unknown',
                id: info.channel_id || '',
                thumbnail: info.channel_thumbnail || '',
                verified: info.channel_is_verified || false,
                subscriberCount: info.channel_follower_count || 0,
              },
              thumbnails: (info.thumbnails || []).map((t: any) => ({
                url: t.url,
                width: t.width,
                height: t.height,
              })),
              views: info.view_count || 0,
              viewsFormatted: formatViewCount(info.view_count || 0),
              uploadDate: info.upload_date || '',
              tags: info.tags || [],
              isLive: info.is_live || false,
              isPrivate: info.availability === 'private',
              ageRestricted: info.age_limit && info.age_limit >= 18,
              formats: extractFormats(info.formats || []),
              availableQualities: extractAvailableQualities(info.formats || []),
            }

            logger.info('Extracted video info', { title: info.title })
            resolve(videoInfo)
          } catch (parseError) {
            logger.error(
              'Failed to parse yt-dlp output',
              parseError instanceof Error ? parseError : new Error(String(parseError)),
            )
            reject(createDownloadError('Failed to parse video info', DownloadErrorCode.UNKNOWN_ERROR))
          }
        } else {
          logger.error('yt-dlp info extraction failed', new Error(`Exit code ${code}: ${stderr}`))
          reject(createDownloadError(`Failed to get video info: ${stderr}`, DownloadErrorCode.NO_FORMAT_AVAILABLE))
        }
      })

      ytProcess.on('error', error => {
        logger.error('yt-dlp info process error', error)
        reject(createDownloadError(`Process error: ${error.message}`, DownloadErrorCode.UNKNOWN_ERROR))
      })
    })
  } catch (error) {
    logger.error('Error getting video info', error instanceof Error ? error : new Error(String(error)))
    throw createDownloadError('Failed to get video info', DownloadErrorCode.UNKNOWN_ERROR)
  }
}

export function isYtdlpInitialized(): boolean {
  return YTDLP_PATH !== null
}

export function cleanupYtdlp(): void {
  // No-op
}

// Helper functions
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
}

function secondsToTimeString(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatTimeForFilename(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s`
}

function formatDuration(seconds: number): string {
  if (!seconds) return '00:00'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function formatViewCount(views: number): string {
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M`
  } else if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K`
  }
  return views.toString()
}

function extractFormats(formats: any[]): VideoFormatInfo[] {
  // Convert yt-dlp formats to our format structure
  const result = formats.map(format => ({
    itag: parseInt(format.format_id) || 0,
    quality: format.format_note || format.quality || 'Unknown',
    format: format.format || format.ext || 'mp4',
    container: format.ext || 'mp4',
    bitrate: format.bitrate,
    audioBitrate: format.audioBitrate || format.abr,
    fps: format.fps,
    width: format.width,
    height: format.height,
    hasAudio: !!(format.acodec && format.acodec !== 'none') || !!(format.audioBitrate || format.abr),
    hasVideo: !!(format.vcodec && format.vcodec !== 'none') || !!(format.width || format.height),
    audioCodec: format.acodec,
    videoCodec: format.vcodec,
    mimeType: format.mime_type,
    url: format.url,
    contentLength: format.filesize,
    // Include protocol to distinguish direct HTTPS URLs from HLS/DASH manifests
    // 'https' = direct download, 'm3u8'/'m3u8_native' = HLS stream (problematic for proxying)
    protocol: format.protocol,
  }))

  // Debug: Log format URL availability
  const withUrls = result.filter(f => f.url)
  const combinedWithUrls = result.filter(f => f.url && f.hasAudio && f.hasVideo)
  logger.debug('Extracted formats', {
    total: result.length,
    withUrls: withUrls.length,
    combined: combinedWithUrls.length,
  })

  if (combinedWithUrls.length > 0) {
    logger.debug('Best combined format', {
      height: combinedWithUrls[0].height,
      container: combinedWithUrls[0].container,
    })
  } else if (withUrls.length > 0) {
    logger.debug('Best format with URL (no combined)', {
      height: withUrls[0].height,
      container: withUrls[0].container,
      hasAudio: withUrls[0].hasAudio,
      hasVideo: withUrls[0].hasVideo,
    })
  } else {
    logger.warn('No formats have URLs - video preview will not work')
  }

  return result
}

/**
 * Dual-stream URLs for high-quality preview with audio.
 * Returns separate video (1080p+) and audio URLs for synchronized playback.
 */
export interface DualStreamUrls {
  videoUrl: string | null
  audioUrl: string | null
  /** Quality of the video stream */
  videoQuality: string | null
  /** Whether this is a combined format (single URL with both) */
  isCombined: boolean
  /** Fallback combined URL (720p with audio) if dual-stream fails */
  fallbackUrl: string | null
  /** Quality of the fallback stream */
  fallbackQuality: string | null
}

/**
 * Get streaming URLs for live preview.
 *
 * PREVIEW STRATEGY:
 * For preview, we ALWAYS use combined formats (audio+video in one stream).
 * Combined formats are limited to ~720p max, but that's perfect for preview:
 * - Simple: No need to sync separate audio/video streams
 * - Reliable: Single URL, no dual-stream complexity
 * - Fast: Lower quality means faster loading
 *
 * Downloads use a different path (downloadWithYtdlp) which respects user's quality choice.
 *
 * PROTOCOL FILTER:
 * We must filter for 'https' protocol to get direct video URLs.
 * HLS manifests (m3u8/m3u8_native protocol) from manifest.googlevideo.com cause
 * socket hangup errors when proxied through Node.js.
 * @see https://github.com/nodejs/help/issues/1837
 */
export function getStreamingUrls(videoInfo: VideoInfo): DualStreamUrls {
  const formats = videoInfo.formats

  // Helper to check if a format uses direct HTTPS (not HLS/DASH manifests)
  const isDirectUrl = (f: VideoFormatInfo): boolean => {
    return f.protocol === 'https' || f.protocol === 'http'
  }

  // Debug: Log available protocol types
  const protocols = new Set(formats.map(f => f.protocol).filter(Boolean))
  logger.debug('Available streaming protocols', { protocols: Array.from(protocols) })

  // PREVIEW STRATEGY: ALWAYS use combined formats first (simpler, more reliable)
  // Combined formats have BOTH audio and video in one stream (up to ~720p)
  const combinedFormats = formats
    .filter(f => f.hasAudio && f.hasVideo && f.url && isDirectUrl(f))
    .sort((a, b) => {
      // Prefer mp4 container for maximum browser compatibility
      const aIsMp4 = a.container === 'mp4' ? 1 : 0
      const bIsMp4 = b.container === 'mp4' ? 1 : 0
      if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4
      // Then prefer higher quality (up to 720p for combined)
      return (b.height || 0) - (a.height || 0)
    })

  // Use combined format for preview (ALWAYS preferred for simplicity)
  if (combinedFormats.length > 0) {
    const chosen = combinedFormats[0]
    logger.info('Using combined format for preview (simple, reliable)', {
      quality: chosen.quality,
      height: chosen.height,
      container: chosen.container,
      hasAudio: chosen.hasAudio,
      hasVideo: chosen.hasVideo,
    })
    return {
      videoUrl: chosen.url!,
      audioUrl: null, // Not needed - audio is in the combined stream
      videoQuality: `${chosen.height}p`,
      isCombined: true,
      fallbackUrl: null, // No fallback needed - this IS the simple format
      fallbackQuality: null,
    }
  }

  // FALLBACK: If no combined format, try video-only (no audio for preview)
  const videoOnlyFormats = formats
    .filter(f => f.hasVideo && !f.hasAudio && f.url && isDirectUrl(f))
    .sort((a, b) => {
      const aIsGood = a.container === 'mp4' || a.container === 'webm' ? 1 : 0
      const bIsGood = b.container === 'mp4' || b.container === 'webm' ? 1 : 0
      if (aIsGood !== bIsGood) return bIsGood - aIsGood
      // For preview fallback, prefer lower quality (faster loading)
      // Cap at 720p for preview
      const aHeight = Math.min(a.height || 0, 720)
      const bHeight = Math.min(b.height || 0, 720)
      return bHeight - aHeight
    })

  if (videoOnlyFormats.length > 0) {
    const chosen = videoOnlyFormats[0]
    logger.warn('Using video-only format for preview (no combined format available)', {
      quality: chosen.quality,
      height: chosen.height,
      container: chosen.container,
    })
    return {
      videoUrl: chosen.url!,
      audioUrl: null,
      videoQuality: `${chosen.height}p (no audio)`,
      isCombined: false,
      fallbackUrl: null,
      fallbackQuality: null,
    }
  }

  // No suitable formats found
  const allWithUrls = formats.filter(f => f.url)
  if (allWithUrls.length > 0) {
    logger.warn('No direct HTTPS formats found for preview', {
      available: allWithUrls.map(f => `${f.quality}/${f.protocol}`),
    })
  } else {
    logger.warn('No formats with URLs found')
  }

  return {
    videoUrl: null,
    audioUrl: null,
    videoQuality: null,
    isCombined: false,
    fallbackUrl: null,
    fallbackQuality: null,
  }
}

/**
 * Legacy single-URL function for backward compatibility.
 * @deprecated Use getStreamingUrls() for dual-stream support
 */
export function getStreamingUrl(videoInfo: VideoInfo): string | null {
  const urls = getStreamingUrls(videoInfo)
  return urls.videoUrl
}

function extractAvailableQualities(formats: any[]): string[] {
  const qualities = new Set<string>()

  for (const format of formats) {
    if (format.height) {
      if (format.height >= 2160) qualities.add('4K')
      else if (format.height >= 1440) qualities.add('1440p')
      else if (format.height >= 1080) qualities.add('1080p')
      else if (format.height >= 720) qualities.add('720p')
      else if (format.height >= 480) qualities.add('480p')
      else if (format.height >= 360) qualities.add('360p')
    }
  }

  return Array.from(qualities)
}

// New exports for yt-dlp status
export function isFfmpegAvailable(): boolean {
  return FFMPEG_PATH !== null
}

export function isYtdlpAvailable(): boolean {
  return YTDLP_PATH !== null
}

export function hasValidCookies(): boolean {
  return cookieManager.hasValidCookies()
}

export function getCookieFilePath(): string {
  return cookieManager.getCookieFilePath()
}
