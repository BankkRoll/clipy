/**
 * Download Manager Service
 *
 * High-level orchestration layer for video downloads. Provides:
 * - Queue management with configurable concurrency
 * - Job state tracking (active, completed, failed)
 * - Event-based progress updates to renderer
 * - Retry support for failed downloads
 *
 * Uses yt-dlp-manager internally for actual download execution.
 * This is the main entry point for download operations from IPC handlers.
 */

import type { DownloadFilter, DownloadOptions, DownloadProgress, VideoInfo } from '../types/download'
import {
  addEventListener,
  cancelDownload,
  getVideoInfo,
  initializeDownloadManager,
  startDownload,
} from './downloader/yt-dlp-manager'

import { EventEmitter } from 'events'
import { ConfigManager } from '../utils/config'
import { Logger } from '../utils/logger'
import { VideoCache } from './video-cache'
import { VideoProcessor } from './video-processor'
import { removeDownloadFromStorage, getStoredDownloads, addDownloadToStorage } from './download-storage'

/** Represents a download task in the queue */
export interface DownloadJob {
  id: string // Internal job ID - THIS is the public downloadId exposed to UI
  url: string // Source URL
  options: DownloadOptions // User-specified options (quality, format, etc.)
  progress: DownloadProgress // Current download state and progress
  createdAt: number // Timestamp when job was created
  startedAt?: number // Timestamp when download actually started
  completedAt?: number // Timestamp when download finished
  ytDlpDownloadId?: string // Internal yt-dlp ID, used only for event mapping
}

export class DownloadManager extends EventEmitter {
  private static instance: DownloadManager
  private activeJobs = new Map<string, DownloadJob>()
  private completedJobs = new Map<string, DownloadJob>()
  private failedJobs = new Map<string, DownloadJob>()
  private jobQueue: DownloadJob[] = []
  private maxConcurrentDownloads: number
  private isProcessing = false
  // Maps yt-dlp downloadId to job.id for event lookup
  private downloadIdToJobId = new Map<string, string>()

  private configManager = ConfigManager.getInstance()
  private logger = Logger.getInstance()
  private videoCache = VideoCache.getInstance()
  private videoProcessor = VideoProcessor.getInstance()

  private constructor() {
    super()
    this.maxConcurrentDownloads = this.configManager.getNested<number>('download.maxConcurrentDownloads') ?? 3

    this.initializeAsync()
  }

  private async initializeAsync(): Promise<void> {
    try {
      // Initialize the yt-dlp manager
      await initializeDownloadManager({
        maxConcurrentDownloads: this.maxConcurrentDownloads,
        timeoutMs: this.configManager.get('download')?.timeoutMs ?? 300000,
        maxRetries: this.configManager.get('download')?.maxRetries ?? 3,
      })

      this.setupEventForwarding()
      this.startQueueProcessor()

      this.logger.info('DownloadManager initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize DownloadManager', error as Error)
      throw error
    }
  }

  static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager()
    }
    return DownloadManager.instance
  }

  /**
   * Setup event forwarding from yt-dlp manager
   */
  private setupEventForwarding(): void {
    // Forward events from the yt-dlp manager
    addEventListener('progress', (...args: unknown[]) => {
      const ytDlpProgress = args[0] as DownloadProgress
      // Look up our job.id using the yt-dlp downloadId
      const jobId = this.downloadIdToJobId.get(ytDlpProgress.downloadId)
      if (jobId) {
        const job = this.activeJobs.get(jobId)
        if (job) {
          // Update job progress but preserve OUR job.id as the public downloadId
          job.progress = { ...ytDlpProgress, downloadId: job.id }
          // Emit with our consistent job.id
          this.emit('progress', job.progress)
        }
      }
    })

    addEventListener('completed', (...args: unknown[]) => {
      const ytDlpProgress = args[0] as DownloadProgress
      // Look up job using the yt-dlp downloadId -> jobId map
      const jobId = this.downloadIdToJobId.get(ytDlpProgress.downloadId)
      const job = jobId ? this.activeJobs.get(jobId) : null
      if (job) {
        // Update job progress but preserve OUR job.id as the public downloadId
        job.progress = { ...ytDlpProgress, downloadId: job.id }
        job.completedAt = Date.now()
        this.completedJobs.set(job.id, job)
        this.activeJobs.delete(job.id)
        this.downloadIdToJobId.delete(ytDlpProgress.downloadId)

        // Save to storage with OUR job.id so delete/retry works correctly
        // This overwrites any entry saved by yt-dlp-provider with the correct ID
        addDownloadToStorage(job.progress)

        this.logger.info('Download completed', { jobId: job.id, ytDlpId: ytDlpProgress.downloadId })
        // Emit with our consistent job.id
        this.emit('completed', job.progress)
        this.processQueue()
      } else {
        this.logger.warn('Received completion for unknown download', { ytDlpId: ytDlpProgress.downloadId })
      }
    })

    addEventListener('failed', (...args: unknown[]) => {
      const ytDlpProgress = args[0] as DownloadProgress
      // Look up job using the yt-dlp downloadId -> jobId map
      const jobId = this.downloadIdToJobId.get(ytDlpProgress.downloadId)
      const job = jobId ? this.activeJobs.get(jobId) : null
      if (job) {
        // Update job progress but preserve OUR job.id as the public downloadId
        job.progress = { ...ytDlpProgress, downloadId: job.id }
        this.failedJobs.set(job.id, job)
        this.activeJobs.delete(job.id)
        this.downloadIdToJobId.delete(ytDlpProgress.downloadId)

        // Save to storage with OUR job.id so retry works correctly
        addDownloadToStorage(job.progress)

        this.logger.info('Download failed', { jobId: job.id, ytDlpId: ytDlpProgress.downloadId })
        // Emit with our consistent job.id
        this.emit('failed', job.progress)
        this.processQueue()
      } else {
        this.logger.warn('Received failure for unknown download', { ytDlpId: ytDlpProgress.downloadId })
      }
    })
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing) {
        this.processQueue()
      }
    }, 1000) // Check queue every second
  }

  /**
   * Process download queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.activeJobs.size >= this.maxConcurrentDownloads) {
      return
    }

    this.isProcessing = true

    try {
      while (this.activeJobs.size < this.maxConcurrentDownloads && this.jobQueue.length > 0) {
        const job = this.jobQueue.shift()!
        await this.startJob(job)
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Start a download job
   */
  async startDownload(url: string, options: DownloadOptions = {}): Promise<{ downloadId: string }> {
    try {
      // Validate URL and get video info
      const videoInfo = await this.getVideoInfo(url)

      // Create download job
      const jobId = this.generateJobId()
      const job: DownloadJob = {
        id: jobId,
        url,
        options: {
          ...options,
          // Ensure we download full video for caching
          startTime: undefined, // Remove trim for caching
          endTime: undefined,
        },
        progress: {
          downloadId: jobId, // Use our job.id as the public downloadId for UI consistency
          url,
          title: videoInfo.title,
          progress: 0,
          speed: '0 B/s',
          eta: '--:--',
          size: '0 B',
          downloadedBytes: 0,
          totalBytes: 0,
          status: 'initializing',
          filePath: '',
          startTime: Date.now(),
          retryCount: 0,
        },
        createdAt: Date.now(),
      }

      // Add to queue or start immediately
      if (this.activeJobs.size < this.maxConcurrentDownloads) {
        await this.startJob(job)
      } else {
        this.jobQueue.push(job)
        job.progress.status = 'queued'
        this.emit('queued', job.progress)
      }

      this.logger.info('Download job created', {
        jobId: job.id,
        url,
        queueSize: this.jobQueue.length,
        activeJobs: this.activeJobs.size,
      })

      return { downloadId: job.id }
    } catch (error) {
      this.logger.error('Failed to create download job', error as Error, { url, options })
      throw error
    }
  }

  /**
   * Start processing a job
   */
  private async startJob(job: DownloadJob): Promise<void> {
    try {
      job.startedAt = Date.now()
      job.progress.status = 'initializing'
      job.progress.downloadId = job.id // Ensure our job.id is the public downloadId
      this.activeJobs.set(job.id, job)

      // Use yt-dlp manager for actual download
      const ytDlpId = await startDownload(job.url, job.options)

      // Store yt-dlp ID separately for internal event mapping (NOT in progress.downloadId!)
      job.ytDlpDownloadId = ytDlpId

      // Create mapping from yt-dlp downloadId to our job.id for event lookup
      this.downloadIdToJobId.set(ytDlpId, job.id)

      this.logger.info('Download job started', { jobId: job.id, ytDlpId })
    } catch (error) {
      this.logger.error('Failed to start job', error as Error, { jobId: job.id })
      job.progress.status = 'failed'
      this.failedJobs.set(job.id, job)
      this.activeJobs.delete(job.id)
      this.emit('failed', job.progress)
    }
  }

  /**
   * Cancel download
   */
  async cancelDownload(downloadId: string): Promise<boolean> {
    try {
      const job = this.activeJobs.get(downloadId)
      if (!job) {
        return false
      }

      // Use the stored yt-dlp ID for cancellation
      const ytDlpId = job.ytDlpDownloadId
      const cancelled = ytDlpId ? cancelDownload(ytDlpId) : false

      if (cancelled) {
        job.progress.status = 'cancelled'
        this.activeJobs.delete(downloadId)
        // Clean up yt-dlp ID mapping
        if (ytDlpId) {
          this.downloadIdToJobId.delete(ytDlpId)
        }
        this.emit('cancelled', job.progress)
        this.processQueue() // Process next in queue
      }

      return cancelled
    } catch (error) {
      this.logger.error('Failed to cancel download', error as Error, { downloadId })
      return false
    }
  }

  /**
   * Delete download
   */
  async deleteDownload(downloadId: string): Promise<boolean> {
    try {
      let deletedFromMemory = false

      // Check active jobs
      if (this.activeJobs.has(downloadId)) {
        await this.cancelDownload(downloadId)
        this.activeJobs.delete(downloadId)
        deletedFromMemory = true
      }

      // Check completed jobs
      if (this.completedJobs.has(downloadId)) {
        this.completedJobs.delete(downloadId)
        deletedFromMemory = true
      }

      // Check failed jobs
      if (this.failedJobs.has(downloadId)) {
        this.failedJobs.delete(downloadId)
        deletedFromMemory = true
      }

      // Remove from persistent storage
      const deletedFromStorage = removeDownloadFromStorage(downloadId)

      const deleted = deletedFromMemory || deletedFromStorage

      if (deleted) {
        this.logger.info('Download deleted', { downloadId, fromMemory: deletedFromMemory, fromStorage: deletedFromStorage })
        // Emit deleted event so UI gets updated
        this.emit('deleted', downloadId)
      } else {
        this.logger.warn('Download not found for deletion', { downloadId })
      }

      return deleted
    } catch (error) {
      this.logger.error('Failed to delete download', error as Error, { downloadId })
      return false
    }
  }

  /**
   * Retry download
   */
  async retryDownload(downloadId: string): Promise<{ downloadId: string }> {
    try {
      // Check in-memory failed jobs first
      let failedJob = this.failedJobs.get(downloadId)
      let failedProgress: DownloadProgress | undefined

      if (failedJob) {
        failedProgress = failedJob.progress
        this.failedJobs.delete(downloadId)
      } else {
        // Check persistent storage for failed downloads
        const storedDownloads = getStoredDownloads()
        failedProgress = storedDownloads.find(d => d.downloadId === downloadId && d.status === 'failed')
      }

      if (!failedProgress) {
        throw new Error('Download not found or not failed')
      }

      // Remove from storage
      removeDownloadFromStorage(downloadId)

      // Create new job with same parameters (use defaults for options since DownloadProgress doesn't store them)
      const newJobId = this.generateJobId()
      const newJob: DownloadJob = {
        id: newJobId,
        url: failedProgress.url,
        options: {}, // Use defaults - original options are not stored in DownloadProgress
        createdAt: Date.now(),
        progress: {
          ...failedProgress,
          downloadId: newJobId, // Use our new job.id as the public downloadId
          status: 'retrying',
          startTime: Date.now(),
          retryCount: (failedProgress.retryCount || 0) + 1,
        },
      }

      // Start immediately or queue
      if (this.activeJobs.size < this.maxConcurrentDownloads) {
        await this.startJob(newJob)
      } else {
        this.jobQueue.push(newJob)
        newJob.progress.status = 'queued'
        this.emit('queued', newJob.progress)
      }

      return { downloadId: newJob.id }
    } catch (error) {
      this.logger.error('Failed to retry download', error as Error, { downloadId })
      throw error
    }
  }

  /**
   * Get download progress
   */
  async getDownloadProgress(downloadId: string): Promise<DownloadProgress | null> {
    // Check active jobs
    const activeJob = this.activeJobs.get(downloadId)
    if (activeJob) {
      return activeJob.progress
    }

    // Check completed jobs
    const completedJob = this.completedJobs.get(downloadId)
    if (completedJob) {
      return completedJob.progress
    }

    // Check failed jobs
    const failedJob = this.failedJobs.get(downloadId)
    if (failedJob) {
      return failedJob.progress
    }

    return null
  }

  /**
   * Get active downloads
   */
  async getActiveDownloads(): Promise<DownloadProgress[]> {
    return Array.from(this.activeJobs.values()).map(job => job.progress)
  }

  /**
   * Get downloads by filter
   */
  async getDownloadsByFilter(filter: DownloadFilter): Promise<DownloadProgress[]> {
    // Get in-memory jobs
    const activeProgress = Array.from(this.activeJobs.values()).map(job => job.progress)
    const completedProgress = Array.from(this.completedJobs.values()).map(job => job.progress)
    const failedProgress = Array.from(this.failedJobs.values()).map(job => job.progress)
    const queuedProgress = this.jobQueue.map(job => job.progress)

    // Get persisted downloads from storage (includes downloads from previous sessions)
    const storedDownloads = getStoredDownloads()

    // Merge in-memory and stored, avoiding duplicates (in-memory takes precedence)
    const inMemoryIds = new Set([
      ...activeProgress.map(p => p.downloadId),
      ...completedProgress.map(p => p.downloadId),
      ...failedProgress.map(p => p.downloadId),
      ...queuedProgress.map(p => p.downloadId),
    ])

    // Only include stored downloads that aren't already in memory
    const persistedOnly = storedDownloads.filter(d => !inMemoryIds.has(d.downloadId))

    let downloads: DownloadProgress[]

    switch (filter) {
      case 'active':
        downloads = activeProgress
        break
      case 'completed':
        downloads = [
          ...completedProgress,
          ...persistedOnly.filter(d => d.status === 'completed'),
        ]
        break
      case 'failed':
        downloads = [
          ...failedProgress,
          ...persistedOnly.filter(d => d.status === 'failed'),
        ]
        break
      case 'all':
      default:
        downloads = [
          ...activeProgress,
          ...completedProgress,
          ...failedProgress,
          ...queuedProgress,
          ...persistedOnly,
        ]
        break
    }

    return downloads.sort((a, b) => b.startTime - a.startTime)
  }

  /**
   * Get video info
   */
  async getVideoInfo(url: string): Promise<VideoInfo> {
    try {
      return await getVideoInfo(url)
    } catch (error) {
      this.logger.error('Failed to get video info', error as Error, { url })
      throw error
    }
  }

  /**
   * Get download statistics
   */
  getStats(): {
    active: number
    queued: number
    completed: number
    failed: number
    total: number
  } {
    return {
      active: this.activeJobs.size,
      queued: this.jobQueue.length,
      completed: this.completedJobs.size,
      failed: this.failedJobs.size,
      total: this.activeJobs.size + this.jobQueue.length + this.completedJobs.size + this.failedJobs.size,
    }
  }

  /**
   * Update configuration
   */
  updateConfig(): void {
    this.maxConcurrentDownloads = this.configManager.get('download')?.maxConcurrentDownloads ?? 3
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}
