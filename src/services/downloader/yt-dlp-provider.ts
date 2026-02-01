import { DownloadErrorCode, createDownloadError } from '../../types/download'
import type { DownloadOptions, DownloadProgress, VideoFormatInfo, VideoInfo } from '../../types/download'
import { dirname, extname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { EventEmitter } from 'events'
import { PlatformUtils } from '../../utils/platform'
import { get } from 'https'
import { homedir } from 'os'
import { spawn } from 'child_process'

// Cross-platform binary detection using PlatformUtils
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
      console.error('Failed to ensure cookie file:', error)
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
function getFormatSelector(videoFormatId: string, audioFormatId: string): string | null {
  // Convert format ids to yt-dlp selectors
  // Prefer AAC/MP3 audio over Opus for better compatibility with media players
  const compatibleAudioSelector =
    'bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio[acodec=mp4a]/bestaudio[ext=mp3]/bestaudio[acodec=mp3]/bestaudio'

  if (videoFormatId === 'auto') {
    return null // Let yt-dlp choose automatically
  } else if (videoFormatId === 'shorts_auto') {
    return `bestvideo[height<=1080]+${compatibleAudioSelector}/best[height<=1080]`
  } else if (videoFormatId === 'eco_360p') {
    return `best[height<=720]/bestvideo[height<=360]+${compatibleAudioSelector}`
  } else if (videoFormatId === 'hd_720p') {
    return `bestvideo[height<=720]+${compatibleAudioSelector}`
  } else {
    return `bestvideo+${compatibleAudioSelector}/best`
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
        console.warn(`[THUMBNAIL] Failed to download thumbnail: HTTP ${response.statusCode}`)
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
          console.log(`[THUMBNAIL] ✅ Saved thumbnail to: ${finalOutputPath}`)
          resolve(finalOutputPath)
        } catch (error) {
          console.error(`[THUMBNAIL] ❌ Failed to save thumbnail: ${error}`)
          resolve(null)
        }
      })
    })

    request.on('error', error => {
      console.error(`[THUMBNAIL] ❌ Request failed: ${error.message}`)
      resolve(null)
    })

    request.setTimeout(10000, () => {
      console.warn(`[THUMBNAIL] Timeout downloading thumbnail`)
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
  console.log('='.repeat(80))
  console.log(`[YTDLP-PROVIDER] 🚀 STARTING DOWNLOAD for video: ${videoId}`)
  console.log(`[YTDLP-PROVIDER] 📋 Options:`, JSON.stringify(options, null, 2))
  console.log(`[YTDLP-PROVIDER] 📊 Progress ID: ${progress.downloadId}`)
  console.log(`[YTDLP-PROVIDER] 🍪 Cookies available: ${cookieManager.hasValidCookies()}`)
  console.log(`[YTDLP-PROVIDER] 🔧 FFmpeg available: ${FFMPEG_PATH !== null}`)
  console.log(`[YTDLP-PROVIDER] 📥 yt-dlp available: ${YTDLP_PATH !== null}`)
  console.log('='.repeat(80))

  if (!YTDLP_PATH) {
    throw createDownloadError('yt-dlp not found', DownloadErrorCode.UNKNOWN_ERROR)
  }

  return new Promise<void>((resolve, reject) => {
    const cleanupAndReject = (error: unknown) => {
      reject(error)
    }

    controller.signal.addEventListener('abort', () => {
      console.log(`[YTDLP-PROVIDER] 🛑 DOWNLOAD ABORTED: ${progress.downloadId}`)
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

        // Use format selector  - prefer compatible audio codecs
        // For full video downloads (previews), use more compatible formats
        // For trimmed downloads, use higher quality 720p
        const isFullVideo = !options.startTime && !options.endTime
        const qualitySelector = isFullVideo ? 'eco_360p' : 'hd_720p' // Use eco_360p for previews instead of auto
        const formatSelector = getFormatSelector(qualitySelector, 'auto_audio')
        if (formatSelector) {
          baseOpts.format = formatSelector
        }

        // Add time range if specified
        if (options.startTime || options.endTime) {
          baseOpts.timeRange = {
            start: options.startTime || 0,
            end: options.endTime,
          }
        }

        const opts = getYtdlpOptsWithTimeRange(baseOpts, baseOpts.timeRange)
        const finalOpts = getEnhancedYtdlpOptions(opts)

        console.log(`[YTDLP-PROVIDER] 🎬 Starting yt-dlp download...`)

        // Convert options to command line args (matching Python subprocess call)
        const args: string[] = []

        if (finalOpts.quiet) args.push('--quiet')
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

        console.log(`[YTDLP-PROVIDER] Running: ${YTDLP_PATH} ${args.join(' ')}`)

        // Spawn yt-dlp process (matching Python subprocess)
        const ytdlpProcess = spawn(YTDLP_PATH, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: process.cwd(),
        })

        let stderr = ''

        ytdlpProcess.stderr?.on('data', data => {
          stderr += data.toString()
        })

        // Add timeout to prevent hanging processes
        const timeout = setTimeout(() => {
          console.log(`[YTDLP-PROVIDER] Timeout reached, killing yt-dlp process`)
          ytdlpProcess.kill('SIGTERM')
          // The close handler will be called after kill
        }, 120000) // 2 minutes timeout

        ytdlpProcess.on('close', async code => {
          clearTimeout(timeout)
          if (code === 0) {
            console.log(`[YTDLP-PROVIDER] ✅ yt-dlp completed successfully`)

            // Find the downloaded file (matching Python's robust file detection)
            const baseName = outputTemplate.replace('.%(ext)s', '')
            const extensions = ['mp4', 'm4a', 'webm', 'mkv', 'mov', 'avi']
            let actualFile: string | null = null

            console.log(`[YTDLP-PROVIDER] Looking for downloaded file with base name: ${baseName}`)

            for (const ext of extensions) {
              const testFile = `${baseName}.${ext}`
              console.log(`[YTDLP-PROVIDER] Checking for file: ${testFile}`)
              if (existsSync(testFile)) {
                actualFile = testFile
                console.log(`[YTDLP-PROVIDER] Found file: ${actualFile}`)
                break
              }
            }

            if (!actualFile) {
              console.error(`[YTDLP-PROVIDER] Downloaded file not found. Searched in:`)
              extensions.forEach(ext => {
                console.error(`[YTDLP-PROVIDER]   - ${baseName}.${ext}`)
              })
              throw createDownloadError('Downloaded file not found', DownloadErrorCode.UNKNOWN_ERROR)
            }

            progress.filePath = actualFile

            // Download thumbnail if requested
            if (options.downloadThumbnail && videoInfo.thumbnails.length > 0) {
              console.log(`[YTDLP-PROVIDER] 📸 Downloading thumbnail...`)
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
            eventEmitter.emit('completed', progress)

            console.log(`[YTDLP-PROVIDER] ✅ DOWNLOAD COMPLETED: ${actualFile}`)
            console.log('='.repeat(80))

            resolve()
          } else {
            console.error(`[YTDLP-PROVIDER] ❌ yt-dlp failed with code ${code}: ${stderr}`)
            reject(createDownloadError(`yt-dlp failed: ${stderr}`, DownloadErrorCode.UNKNOWN_ERROR))
          }
        })

        ytdlpProcess.on('error', error => {
          clearTimeout(timeout)
          console.error(`[YTDLP-PROVIDER] Process error: ${error.message}`)
          reject(createDownloadError(`Process error: ${error.message}`, DownloadErrorCode.UNKNOWN_ERROR))
        })
      } catch (error) {
        console.error('='.repeat(80))
        console.error(`[YTDLP-PROVIDER] ❌ DOWNLOAD FAILED for ${videoId}`)
        console.error(`[YTDLP-PROVIDER] ❌ Error:`, error)
        if (error instanceof Error) {
          console.error(`[YTDLP-PROVIDER] ❌ Error message: ${error.message}`)
        }
        console.error('='.repeat(80))
        cleanupAndReject(error)
      }
    })()
  })
}

// Legacy exports for compatibility (keeping youtubei.js interface)
export async function initializeYtdlp(): Promise<void> {
  // No-op - we're using yt-dlp now
  console.log('[YTDLP-PROVIDER] Initialized (using yt-dlp)')
}

export async function getVideoInfoFromYtdlp(videoId: string): Promise<VideoInfo> {
  if (!YTDLP_PATH) {
    throw createDownloadError('yt-dlp not found', DownloadErrorCode.UNKNOWN_ERROR)
  }

  try {
    // Use yt-dlp to extract video info (similar to Python extract_video_info_with_fallback)
    const args = ['--quiet', '--no-warnings', '--dump-json', `https://www.youtube.com/watch?v=${videoId}`]

    // Add cookies if available
    if (cookieManager.hasValidCookies()) {
      args.splice(3, 0, '--cookies', cookieManager.getCookieFilePath())
    }

    console.log(`[YTDLP-INFO] Running: ${YTDLP_PATH} ${args.join(' ')}`)

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

            console.log(`[YTDLP-INFO] ✅ Successfully extracted info for: ${info.title}`)
            resolve(videoInfo)
          } catch (parseError) {
            console.error(`[YTDLP-INFO] ❌ Failed to parse yt-dlp output: ${parseError}`)
            reject(createDownloadError('Failed to parse video info', DownloadErrorCode.UNKNOWN_ERROR))
          }
        } else {
          console.error(`[YTDLP-INFO] ❌ yt-dlp failed with code ${code}: ${stderr}`)
          reject(createDownloadError(`Failed to get video info: ${stderr}`, DownloadErrorCode.NO_FORMAT_AVAILABLE))
        }
      })

      ytProcess.on('error', error => {
        console.error(`[YTDLP-INFO] Process error: ${error.message}`)
        reject(createDownloadError(`Process error: ${error.message}`, DownloadErrorCode.UNKNOWN_ERROR))
      })
    })
  } catch (error) {
    console.error(`[YTDLP-INFO] ❌ Error getting video info:`, error)
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
  return formats.map(format => ({
    itag: parseInt(format.format_id) || 0,
    quality: format.format_note || format.quality || 'Unknown',
    format: format.format || format.ext || 'mp4',
    container: format.ext || 'mp4',
    bitrate: format.bitrate,
    audioBitrate: format.audioBitrate || format.abr,
    fps: format.fps,
    width: format.width,
    height: format.height,
    hasAudio: !!(format.audioBitrate || format.abr),
    hasVideo: !!(format.width || format.height),
    audioCodec: format.audio_codec,
    videoCodec: format.video_codec,
    mimeType: format.mime_type,
    url: format.url,
    contentLength: format.filesize,
  }))
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
