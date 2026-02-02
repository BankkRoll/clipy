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

/** Represents a download task in the queue */
export interface DownloadJob {
  id: string // Internal job ID (different from yt-dlp's downloadId)
  url: string // Source URL
  options: DownloadOptions // User-specified options (quality, format, etc.)
  progress: DownloadProgress // Current download state and progress
  createdAt: number // Timestamp when job was created
  startedAt?: number // Timestamp when download actually started
  completedAt?: number // Timestamp when download finished
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
      const progress = args[0] as DownloadProgress
      // Update the job's progress in activeJobs
      const jobId = this.downloadIdToJobId.get(progress.downloadId)
      if (jobId) {
        const job = this.activeJobs.get(jobId)
        if (job) {
          job.progress = progress
        }
      }
      this.emit('progress', progress)
    })

    addEventListener('completed', (...args: unknown[]) => {
      const progress = args[0] as DownloadProgress
      // Look up job using the downloadId -> jobId map
      const jobId = this.downloadIdToJobId.get(progress.downloadId)
      const job = jobId ? this.activeJobs.get(jobId) : null
      if (job) {
        job.progress = progress
        job.completedAt = Date.now()
        this.completedJobs.set(job.id, job)
        this.activeJobs.delete(job.id)
        this.downloadIdToJobId.delete(progress.downloadId)
        this.logger.info('Download completed', { jobId: job.id, downloadId: progress.downloadId })
        this.emit('completed', progress)
        this.processQueue()
      } else {
        this.logger.warn('Received completion for unknown download', { downloadId: progress.downloadId })
      }
    })

    addEventListener('failed', (...args: unknown[]) => {
      const progress = args[0] as DownloadProgress
      // Look up job using the downloadId -> jobId map
      const jobId = this.downloadIdToJobId.get(progress.downloadId)
      const job = jobId ? this.activeJobs.get(jobId) : null
      if (job) {
        job.progress = progress
        this.failedJobs.set(job.id, job)
        this.activeJobs.delete(job.id)
        this.downloadIdToJobId.delete(progress.downloadId)
        this.logger.info('Download failed', { jobId: job.id, downloadId: progress.downloadId })
        this.emit('failed', progress)
        this.processQueue()
      } else {
        this.logger.warn('Received failure for unknown download', { downloadId: progress.downloadId })
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
      const job: DownloadJob = {
        id: this.generateJobId(),
        url,
        options: {
          ...options,
          // Ensure we download full video for caching
          startTime: undefined, // Remove trim for caching
          endTime: undefined,
        },
        progress: {
          downloadId: '', // Will be set by legacy manager
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
      this.activeJobs.set(job.id, job)

      // Use yt-dlp manager for actual download
      const downloadId = await startDownload(job.url, job.options)
      job.progress.downloadId = downloadId

      // Create mapping from yt-dlp downloadId to our job.id for event lookup
      this.downloadIdToJobId.set(downloadId, job.id)

      this.logger.info('Download job started', { jobId: job.id, downloadId })
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

      const cancelled = cancelDownload(job.progress.downloadId)

      if (cancelled) {
        job.progress.status = 'cancelled'
        this.activeJobs.delete(downloadId)
        // Clean up downloadId mapping
        if (job.progress.downloadId) {
          this.downloadIdToJobId.delete(job.progress.downloadId)
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
      // Check active jobs
      let job = this.activeJobs.get(downloadId)
      if (job) {
        await this.cancelDownload(downloadId)
      }

      // Check completed jobs
      job = this.completedJobs.get(downloadId)
      if (job) {
        this.completedJobs.delete(downloadId)
        // TODO: Clean up files
        return true
      }

      // Check failed jobs
      job = this.failedJobs.get(downloadId)
      if (job) {
        this.failedJobs.delete(downloadId)
        return true
      }

      return false
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
      const failedJob = this.failedJobs.get(downloadId)
      if (!failedJob) {
        throw new Error('Download not found or not failed')
      }

      // Remove from failed jobs
      this.failedJobs.delete(downloadId)

      // Create new job with same parameters
      const newJob: DownloadJob = {
        ...failedJob,
        id: this.generateJobId(),
        createdAt: Date.now(),
        progress: {
          ...failedJob.progress,
          downloadId: '',
          status: 'retrying',
          startTime: Date.now(),
          retryCount: failedJob.progress.retryCount + 1,
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
    let jobs: DownloadJob[]

    switch (filter) {
      case 'active':
        jobs = Array.from(this.activeJobs.values())
        break
      case 'completed':
        jobs = Array.from(this.completedJobs.values())
        break
      case 'failed':
        jobs = Array.from(this.failedJobs.values())
        break
      case 'all':
      default:
        jobs = [
          ...Array.from(this.activeJobs.values()),
          ...Array.from(this.completedJobs.values()),
          ...Array.from(this.failedJobs.values()),
          ...this.jobQueue,
        ]
        break
    }

    return jobs.map(job => job.progress).sort((a, b) => b.startTime - a.startTime)
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
