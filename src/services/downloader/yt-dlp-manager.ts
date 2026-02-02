/**
 * yt-dlp Manager
 * High-level download orchestration layer that manages:
 * - Download queue and concurrency limits
 * - Download state persistence across app restarts
 * - Event forwarding to renderer process
 * - Retry logic for failed downloads
 *
 * Uses yt-dlp-provider.ts for actual download execution.
 */

import { existsSync, mkdirSync } from 'node:fs'
import type { DownloadConfig, DownloadFilter, DownloadOptions, DownloadProgress, VideoInfo } from '../../types/download'
import { DownloadErrorCode, createDownloadError, isDownloadError } from '../../types/download'
import {
  addDownloadToStorage,
  clearOldDownloads,
  loadDownloadStorage,
  removeDownloadFromStorage,
  updateDownloadInStorage,
} from '../download-storage'
import {
  downloadWithYtdlp,
  getVideoInfoFromYtdlp,
  initializeYtdlp,
  isYtdlpInitialized,
  getStreamingUrl,
} from './yt-dlp-provider'

import { app } from 'electron'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { Logger } from '../../utils/logger'

const logger = Logger.getInstance()

interface DownloadManagerState {
  config: DownloadConfig
  activeDownloads: Map<string, AbortController>
  downloadHistory: Map<string, DownloadProgress>
  eventEmitter: EventEmitter
  initialized: boolean
  ytdlpReady: boolean
}

let globalState: DownloadManagerState | null = null

// Cache for video info to prevent duplicate requests
const videoInfoCache = new Map<string, { info: VideoInfo; timestamp: number }>()
const VIDEO_INFO_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function initializeDownloadManager(config?: Partial<DownloadConfig>): Promise<void> {
  if (globalState && globalState.initialized) {
    return
  }

  const defaultConfig: DownloadConfig = {
    maxConcurrentDownloads: 3,
    defaultOutputPath: join(app.getPath('downloads'), 'YouTube Downloads'),
    timeoutMs: 300000,
    maxRetries: 3,
    retryDelayMs: 2000,
    chunkSizeBytes: 1024 * 1024,
  }

  const eventEmitter = new EventEmitter()

  // Wrap the emit method to automatically persist progress updates
  const originalEmit = eventEmitter.emit.bind(eventEmitter)
  eventEmitter.emit = (event: string, ...args: unknown[]) => {
    // Automatically persist progress updates to storage
    if (event === 'progress') {
      const progress = args[0] as DownloadProgress
      updateDownloadInStorage(progress.downloadId, progress)
    }
    return originalEmit(event, ...args)
  }

  globalState = {
    config: { ...defaultConfig, ...config },
    activeDownloads: new Map(),
    downloadHistory: new Map(),
    eventEmitter,
    initialized: false,
    ytdlpReady: false,
  }

  await ensureOutputDirectory(globalState.config.defaultOutputPath)

  // Load persisted downloads from storage
  const storedDownloads = loadDownloadStorage().downloads
  for (const download of storedDownloads) {
    // Mark stale "in-progress" downloads as failed on startup
    // (if they were truly in progress, the app restart interrupted them)
    if (
      download.status === 'downloading' ||
      download.status === 'initializing' ||
      download.status === 'fetching-info' ||
      download.status === 'retrying'
    ) {
      logger.debug('Marking stale download as failed', { downloadId: download.downloadId })
      download.status = 'failed'
      download.error = createDownloadError('Download interrupted by app restart', DownloadErrorCode.UNKNOWN_ERROR)
      updateDownloadInStorage(download.downloadId, { status: 'failed', error: download.error })
    }
    globalState.downloadHistory.set(download.downloadId, download)
  }

  // Clean up old completed downloads (keep only last 30 days)
  const removedCount = clearOldDownloads(30)
  if (removedCount > 0) {
    logger.info('Cleaned up old downloads', { count: removedCount })
  }

  try {
    await initializeYtdlp()
    globalState.ytdlpReady = true
    logger.info('yt-dlp initialized successfully')
    globalState.eventEmitter.emit('initialized', true)
  } catch (error) {
    logger.warn('yt-dlp failed to initialize', error as Error)
    globalState.ytdlpReady = false
    globalState.eventEmitter.emit('initialized', false)
  }

  globalState.initialized = true
}

function ensureState(): DownloadManagerState {
  if (!globalState || !globalState.initialized) {
    throw createDownloadError(
      'Download manager not initialized. Call initializeDownloadManager first.',
      DownloadErrorCode.UNKNOWN_ERROR,
    )
  }
  return globalState
}

async function ensureOutputDirectory(outputPath: string): Promise<void> {
  try {
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true })
    }
  } catch (error) {
    throw createDownloadError(
      'Failed to create output directory',
      DownloadErrorCode.PERMISSION_DENIED,
      error instanceof Error ? error : undefined,
    )
  }
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const state = ensureState()

  const videoId = extractVideoId(url)

  if (!videoId) {
    throw createDownloadError(`Invalid YouTube URL: ${url}`, DownloadErrorCode.INVALID_URL)
  }

  // Check cache first
  const cacheKey = videoId
  const cached = videoInfoCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < VIDEO_INFO_CACHE_TTL) {
    logger.debug('Returning cached video info', { videoId })
    return cached.info
  }

  logger.debug('Getting video info', { url })

  if (!state.ytdlpReady || !isYtdlpInitialized()) {
    throw createDownloadError(
      'yt-dlp is not initialized. Please ensure the download manager is properly set up.',
      DownloadErrorCode.UNKNOWN_ERROR,
    )
  }

  try {
    logger.debug('Fetching video info via yt-dlp')
    const info = await getVideoInfoFromYtdlp(videoId)
    if (info.formats.length === 0) {
      throw createDownloadError('No formats available for this video', DownloadErrorCode.NO_FORMAT_AVAILABLE)
    }

    // Cache the result
    videoInfoCache.set(cacheKey, { info, timestamp: Date.now() })

    return info
  } catch (error: unknown) {
    logger.error('Failed to get video info', error as Error)
    throw isDownloadError(error)
      ? error
      : createDownloadError(error instanceof Error ? error.message : String(error), DownloadErrorCode.UNKNOWN_ERROR)
  }
}

export async function startDownload(url: string, options: DownloadOptions = {}): Promise<string> {
  const state = ensureState()

  // Check if this URL is already being actively downloaded
  // Only consider it "in progress" if we have an active AbortController for it
  const existingDownload = Array.from(state.downloadHistory.values()).find(
    download =>
      download.url === url &&
      (download.status === 'downloading' ||
        download.status === 'initializing' ||
        download.status === 'fetching-info') &&
      state.activeDownloads.has(download.downloadId), // Must have active controller
  )

  if (existingDownload) {
    logger.debug('Download already in progress', { url })
    return existingDownload.downloadId
  }

  if (state.activeDownloads.size >= state.config.maxConcurrentDownloads) {
    throw createDownloadError(
      `Maximum concurrent downloads (${state.config.maxConcurrentDownloads}) reached`,
      DownloadErrorCode.UNKNOWN_ERROR,
    )
  }

  const downloadId = generateDownloadId()
  const controller = new AbortController()
  const videoId = extractVideoId(url)

  if (!videoId) {
    throw createDownloadError(`Invalid YouTube URL: ${url}`, DownloadErrorCode.INVALID_URL)
  }

  state.activeDownloads.set(downloadId, controller)
  ;(async () => {
    let progress: DownloadProgress | null = null
    let videoInfo: VideoInfo | null = null

    try {
      progress = {
        downloadId,
        url,
        title: 'Fetching video information...',
        progress: 0,
        speed: '0 B/s',
        eta: '--:--',
        size: '0 B',
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'fetching-info',
        filePath: '',
        startTime: Date.now(),
        retryCount: 0,
        provider: options.provider || 'auto',
      }
      state.downloadHistory.set(downloadId, progress)
      addDownloadToStorage(progress)
      state.eventEmitter.emit('progress', progress)

      // Fetch video info first
      videoInfo = await getVideoInfo(url)
      progress.title = videoInfo.title
      progress.status = 'initializing'
      updateDownloadInStorage(downloadId, { title: videoInfo.title, status: 'initializing' })
      state.eventEmitter.emit('progress', progress)

      const selectedProvider = options.provider || 'auto'
      logger.debug('Selected download provider', { provider: selectedProvider })

      if ((selectedProvider === 'ytdlp' || selectedProvider === 'auto') && state.ytdlpReady && isYtdlpInitialized()) {
        try {
          logger.debug('Attempting download with yt-dlp')
          progress.usedProvider = 'ytdlp'
          await downloadWithYtdlp(videoId, options, progress, videoInfo!, state.eventEmitter, controller)
          return
        } catch (ytdlpError: unknown) {
          logger.warn(
            'yt-dlp download failed',
            ytdlpError instanceof Error ? ytdlpError : new Error(String(ytdlpError)),
          )
          if (selectedProvider === 'ytdlp') {
            throw ytdlpError
          }
          progress.status = 'retrying'
          updateDownloadInStorage(downloadId, { status: 'retrying' })
          state.eventEmitter.emit('progress', progress)
        }
      }

      throw createDownloadError('yt-dlp is not available for download.', DownloadErrorCode.NO_FORMAT_AVAILABLE)
    } catch (error) {
      const finalError = isDownloadError(error)
        ? error
        : createDownloadError(String(error), DownloadErrorCode.UNKNOWN_ERROR)
      if (progress) {
        progress.status = 'failed'
        progress.error = finalError
        updateDownloadInStorage(downloadId, { status: 'failed', error: finalError })
        state.eventEmitter.emit('progress', progress)
        state.eventEmitter.emit('failed', {
          ...progress,
        })
      }
      logger.error(
        `Download failed permanently [${downloadId}]`,
        finalError instanceof Error ? finalError : new Error(String(finalError)),
      )
    } finally {
      state.activeDownloads.delete(downloadId)
    }
  })()

  return downloadId
}

export function cancelDownload(downloadId: string): boolean {
  const state = ensureState()

  const controller = state.activeDownloads.get(downloadId)
  if (controller) {
    controller.abort()
    return true
  }
  return false
}

export function getActiveDownloads(): DownloadProgress[] {
  const state = ensureState()

  return Array.from(state.activeDownloads.keys())
    .map(id => state.downloadHistory.get(id))
    .filter((progress): progress is DownloadProgress => progress !== undefined)
}

export function getDownloadHistory(): DownloadProgress[] {
  const state = ensureState()

  return Array.from(state.downloadHistory.values()).sort((a, b) => b.startTime - a.startTime)
}

export function getDownloadProgress(downloadId: string): DownloadProgress | null {
  const state = ensureState()
  return state.downloadHistory.get(downloadId) || null
}

export function getDownloadsByFilter(filter: DownloadFilter): DownloadProgress[] {
  let downloads: DownloadProgress[] = []

  switch (filter) {
    case 'active':
      downloads = getActiveDownloads()
      break
    case 'completed':
      downloads = getDownloadHistory().filter(d => d.status === 'completed')
      break
    case 'failed':
      downloads = getDownloadHistory().filter(d => d.status === 'failed')
      break
    case 'all':
    default:
      downloads = [...getActiveDownloads(), ...getDownloadHistory()]
      break
  }

  return downloads.sort((a, b) => b.startTime - a.startTime)
}

export function addEventListener(event: string, listener: (...args: unknown[]) => void): void {
  const state = ensureState()
  state.eventEmitter.on(event, listener)
}

export function removeEventListener(event: string, listener: (...args: unknown[]) => void): void {
  const state = ensureState()
  state.eventEmitter.off(event, listener)
}

export function removeAllEventListeners(): void {
  const state = ensureState()
  state.eventEmitter.removeAllListeners()
}

function generateDownloadId(): string {
  return `clipy_dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
    /music\.youtube\.com\/watch\?v=([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  return null
}

export function deleteDownload(downloadId: string): boolean {
  if (!globalState) {
    return false
  }

  // Check if it's an active download first
  if (globalState.activeDownloads.has(downloadId)) {
    // Cancel the active download
    const cancelled = cancelDownload(downloadId)
    if (cancelled) {
      // Remove from active downloads
      globalState.activeDownloads.delete(downloadId)
      return true
    }
    return false
  }

  // Remove from download history
  const deleted = globalState.downloadHistory.delete(downloadId)
  if (deleted) {
    removeDownloadFromStorage(downloadId)
    globalState.eventEmitter.emit('deleted', downloadId)
  }

  return deleted
}

export async function retryDownload(downloadId: string): Promise<string> {
  if (!globalState) {
    throw createDownloadError('Download manager not initialized', DownloadErrorCode.UNKNOWN_ERROR)
  }

  // Find the download in history
  const downloadProgress = globalState.downloadHistory.get(downloadId)
  if (!downloadProgress) {
    throw createDownloadError('Download not found', DownloadErrorCode.UNKNOWN_ERROR)
  }

  if (downloadProgress.status !== 'failed') {
    throw createDownloadError('Can only retry failed downloads', DownloadErrorCode.UNKNOWN_ERROR)
  }

  // Update status to retrying
  downloadProgress.status = 'retrying'
  downloadProgress.retryCount += 1
  updateDownloadInStorage(downloadId, { status: 'retrying', retryCount: downloadProgress.retryCount })
  globalState.eventEmitter.emit('progress', downloadProgress)

  try {
    // Start a new download with the same URL and options
    const newDownloadId = await startDownload(downloadProgress.url, {
      // Use original options if available, otherwise use defaults
      quality: downloadProgress.usedProvider ? undefined : 'highest',
      format: 'mp4',
      // Add other options as needed
    })

    // Remove the old failed download from history
    globalState.downloadHistory.delete(downloadId)

    return newDownloadId
  } catch (error) {
    // Reset status back to failed if retry fails
    downloadProgress.status = 'failed'
    globalState.eventEmitter.emit('progress', downloadProgress)
    throw error
  }
}

export function cleanup(): void {
  if (globalState) {
    for (const controller of globalState.activeDownloads.values()) {
      controller.abort()
    }

    globalState.activeDownloads.clear()
    globalState.eventEmitter.removeAllListeners()
    globalState = null
  }
}

/**
 * Get video info with streaming URL for live preview
 * Returns video info plus a direct streaming URL for the editor
 */
export async function getVideoInfoWithStreamingUrl(
  url: string,
): Promise<{ videoInfo: VideoInfo; streamingUrl: string | null }> {
  const videoInfo = await getVideoInfo(url)
  const streamingUrl = getStreamingUrl(videoInfo)

  logger.debug('Streaming URL status', { available: !!streamingUrl })

  return { videoInfo, streamingUrl }
}
