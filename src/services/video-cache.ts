/**
 * Video Cache Service
 * Manages local caching of downloaded videos for preview and processing
 */

import { existsSync, mkdirSync, unlinkSync } from 'fs'

import { ConfigManager } from '../utils/config'
import { FileSystemUtils } from '../utils/file-system'
import { Logger } from '../utils/logger'
import { PlatformUtils } from '../utils/platform'
import { join } from 'path'

export interface CachedVideo {
  id: string
  originalUrl: string
  filePath: string
  thumbnailPath?: string
  metadataPath: string
  fileSize: number
  duration: number
  createdAt: number
  lastAccessed: number
  checksum?: string
}

export interface CacheOptions {
  maxCacheSize?: number // in bytes
  maxCacheAge?: number // in milliseconds
  cleanupInterval?: number // in milliseconds
}

export class VideoCache {
  private static instance: VideoCache
  private cacheDir: string
  private metadataFile: string
  private cacheIndex: Map<string, CachedVideo> = new Map()
  private configManager = ConfigManager.getInstance()
  private logger = Logger.getInstance()
  private fileSystem = FileSystemUtils.getInstance()
  private platform = PlatformUtils.getInstance()

  private readonly DEFAULT_OPTIONS: Required<CacheOptions> = {
    maxCacheSize: 10 * 1024 * 1024 * 1024, // 10GB
    maxCacheAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupInterval: 60 * 60 * 1000, // 1 hour
  }

  private constructor() {
    this.cacheDir = join(this.platform.getAppDataDir('clipy'), 'video-cache')
    this.metadataFile = join(this.cacheDir, 'cache-index.json')
    this.ensureCacheDirectory()
    this.initializeAsync()
  }

  private async initializeAsync(): Promise<void> {
    await this.loadCacheIndex()
    this.startCleanupTimer()
  }

  static getInstance(): VideoCache {
    if (!VideoCache.instance) {
      VideoCache.instance = new VideoCache()
    }
    return VideoCache.instance
  }

  /**
   * Ensure cache directory exists
   */
  private ensureCacheDirectory(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true })
      this.logger.info('Created video cache directory', { path: this.cacheDir })
    }
  }

  /**
   * Load cache index from disk
   */
  private async loadCacheIndex(): Promise<void> {
    try {
      if (existsSync(this.metadataFile)) {
        const data = await this.fileSystem.readJsonFile(this.metadataFile)
        if (data && typeof data === 'object') {
          const entries = Object.entries(data) as [string, CachedVideo][]
          this.cacheIndex = new Map(entries)
          this.logger.info('Loaded video cache index', { entries: entries.length })
        }
      }
    } catch (error) {
      this.logger.error('Failed to load cache index', error as Error)
      this.cacheIndex = new Map()
    }
  }

  /**
   * Save cache index to disk
   */
  private saveCacheIndex(): void {
    try {
      const data = Object.fromEntries(this.cacheIndex)
      this.fileSystem.writeJsonFile(this.metadataFile, data)
    } catch (error) {
      this.logger.error('Failed to save cache index', error as Error)
    }
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    const interval = this.configManager.get('cache')?.cleanupInterval ?? this.DEFAULT_OPTIONS.cleanupInterval
    setInterval(() => {
      this.performCleanup()
    }, interval)
  }

  /**
   * Cache a video file
   */
  async cacheVideo(
    videoId: string,
    originalUrl: string,
    videoBuffer: Buffer,
    metadata: { duration: number; fileSize: number; checksum?: string },
  ): Promise<CachedVideo> {
    try {
      const fileName = `${videoId}_${Date.now()}.mp4`
      const filePath = join(this.cacheDir, fileName)
      const metadataPath = join(this.cacheDir, `${videoId}_${Date.now()}.json`)

      // Write video file
      await this.fileSystem.writeFile(filePath, videoBuffer)

      // Create cache entry
      const cachedVideo: CachedVideo = {
        id: videoId,
        originalUrl,
        filePath,
        metadataPath,
        fileSize: metadata.fileSize,
        duration: metadata.duration,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        checksum: metadata.checksum,
      }

      // Save metadata
      await this.fileSystem.writeJsonFile(metadataPath, {
        ...cachedVideo,
        thumbnailPath: cachedVideo.thumbnailPath,
      })

      // Update index
      this.cacheIndex.set(videoId, cachedVideo)
      this.saveCacheIndex()

      this.logger.info('Video cached successfully', {
        videoId,
        filePath,
        size: metadata.fileSize,
      })

      return cachedVideo
    } catch (error) {
      this.logger.error('Failed to cache video', error as Error, { videoId })
      throw new Error(`Failed to cache video: ${(error as Error).message}`)
    }
  }

  /**
   * Get cached video
   */
  getCachedVideo(videoId: string): CachedVideo | null {
    const cached = this.cacheIndex.get(videoId)
    if (cached && existsSync(cached.filePath)) {
      // Update last accessed time
      cached.lastAccessed = Date.now()
      this.cacheIndex.set(videoId, cached)
      this.saveCacheIndex()
      return cached
    }

    // Remove stale entry
    if (cached) {
      this.cacheIndex.delete(videoId)
      this.saveCacheIndex()
    }

    return null
  }

  /**
   * Check if video is cached
   */
  isVideoCached(videoId: string): boolean {
    return this.getCachedVideo(videoId) !== null
  }

  /**
   * Get video file path
   */
  getVideoPath(videoId: string): string | null {
    const cached = this.getCachedVideo(videoId)
    return cached?.filePath ?? null
  }

  /**
   * Remove video from cache
   */
  removeFromCache(videoId: string): boolean {
    const cached = this.cacheIndex.get(videoId)
    if (!cached) return false

    try {
      // Remove files
      if (existsSync(cached.filePath)) {
        unlinkSync(cached.filePath)
      }
      if (cached.metadataPath && existsSync(cached.metadataPath)) {
        unlinkSync(cached.metadataPath)
      }
      if (cached.thumbnailPath && existsSync(cached.thumbnailPath)) {
        unlinkSync(cached.thumbnailPath)
      }

      // Remove from index
      this.cacheIndex.delete(videoId)
      this.saveCacheIndex()

      this.logger.info('Video removed from cache', { videoId })
      return true
    } catch (error) {
      this.logger.error('Failed to remove video from cache', error as Error, { videoId })
      return false
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalSize: number
    totalVideos: number
    oldestVideo: number | null
    newestVideo: number | null
  } {
    let totalSize = 0
    let oldestVideo: number | null = null
    let newestVideo: number | null = null

    for (const video of this.cacheIndex.values()) {
      totalSize += video.fileSize
      if (!oldestVideo || video.createdAt < oldestVideo) {
        oldestVideo = video.createdAt
      }
      if (!newestVideo || video.createdAt > newestVideo) {
        newestVideo = video.createdAt
      }
    }

    return {
      totalSize,
      totalVideos: this.cacheIndex.size,
      oldestVideo,
      newestVideo,
    }
  }

  /**
   * Perform cache cleanup
   */
  private async performCleanup(): Promise<void> {
    try {
      const config = this.configManager.getAll()
      const maxSize = config.cache?.maxSize ?? this.DEFAULT_OPTIONS.maxCacheSize
      const maxAge = config.cache?.maxAge ?? this.DEFAULT_OPTIONS.maxCacheAge

      const now = Date.now()
      const stats = this.getCacheStats()

      // Remove old videos
      const toRemove: string[] = []
      for (const [videoId, video] of this.cacheIndex) {
        if (now - video.lastAccessed > maxAge) {
          toRemove.push(videoId)
        }
      }

      // Remove oldest videos if cache is too large
      if (stats.totalSize > maxSize) {
        const sortedByAccess = Array.from(this.cacheIndex.values()).sort((a, b) => a.lastAccessed - b.lastAccessed)

        let currentSize = stats.totalSize
        for (const video of sortedByAccess) {
          if (currentSize <= maxSize * 0.8) break // Keep 80% of max size
          toRemove.push(video.id)
          currentSize -= video.fileSize
        }
      }

      // Remove videos
      for (const videoId of toRemove) {
        this.removeFromCache(videoId)
      }

      if (toRemove.length > 0) {
        this.logger.info('Cache cleanup completed', {
          removed: toRemove.length,
          remainingSize:
            stats.totalSize -
            toRemove.reduce((sum, id) => {
              const video = this.cacheIndex.get(id)
              return sum + (video?.fileSize ?? 0)
            }, 0),
        })
      }
    } catch (error) {
      this.logger.error('Cache cleanup failed', error as Error)
    }
  }

  /**
   * Clear entire cache
   */
  async clearCache(): Promise<void> {
    try {
      const videoIds = Array.from(this.cacheIndex.keys())
      for (const videoId of videoIds) {
        this.removeFromCache(videoId)
      }

      this.logger.info('Cache cleared completely')
    } catch (error) {
      this.logger.error('Failed to clear cache', error as Error)
      throw error
    }
  }

  /**
   * Get all cached videos
   */
  getAllCachedVideos(): CachedVideo[] {
    return Array.from(this.cacheIndex.values())
  }

  /**
   * Update thumbnail path for cached video
   */
  updateThumbnailPath(videoId: string, thumbnailPath: string): void {
    const cached = this.cacheIndex.get(videoId)
    if (cached) {
      cached.thumbnailPath = thumbnailPath
      this.cacheIndex.set(videoId, cached)
      this.saveCacheIndex()
    }
  }
}
