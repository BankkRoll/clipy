/**
 * Configuration Manager
 * Centralized configuration management with persistence
 */

import type { AppConfig, ThemeMode } from '../types/system'
import { existsSync, readFileSync, writeFileSync } from 'fs'

import { FileSystemUtils } from './file-system'
import { Logger } from './logger'
import { PlatformUtils } from './platform'
import { join } from 'path'

export class ConfigManager {
  private static instance: ConfigManager
  private config: AppConfig
  private configFile: string
  private logger = Logger.getInstance()
  private fileSystem = FileSystemUtils.getInstance()
  private platform = PlatformUtils.getInstance()

  // Default configuration
  private readonly DEFAULT_CONFIG: AppConfig = {
    theme: 'system' as ThemeMode,
    download: {
      defaultVideoQuality: 'best',
      videoFormat: 'mp4',
      downloadSubtitles: true,
      downloadThumbnails: true,
      saveMetadata: true,
      createSubdirectories: true,
      maxConcurrentDownloads: 3,
      autoRetryFailed: true,
      downloadPath: join(this.platform.getDownloadsDir(), 'Clipy'),
      maxRetries: 3,
      timeoutMs: 300000,
    },
    cache: {
      maxSize: 10 * 1024 * 1024 * 1024, // 10GB
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      cleanupInterval: 60 * 60 * 1000, // 1 hour
    },
    storage: {
      tempPath: join(this.platform.getAppDataDir('clipy'), 'temp'),
      cachePath: join(this.platform.getAppDataDir('clipy'), 'cache'),
    },
    editor: {
      defaultCodec: 'copy',
      defaultQuality: 'high',
      preferFastTrim: true,
      defaultAudioFormat: 'mp3',
    },
    notifications: {
      downloadComplete: true,
      downloadFailed: true,
      soundEnabled: false,
    },
    privacy: {
      saveDownloadHistory: true,
      saveRecentlyViewed: true,
    },
    advanced: {
      debugLogging: false,
      ffmpegPath: '',
      ytDlpPath: '',
    },
    shortcuts: [
      { action: 'playPause', key: 'Space', modifiers: [] },
      { action: 'seekBack5', key: 'ArrowLeft', modifiers: [] },
      { action: 'seekForward5', key: 'ArrowRight', modifiers: [] },
      { action: 'seekBack10', key: 'j', modifiers: [] },
      { action: 'seekForward10', key: 'l', modifiers: [] },
      { action: 'volumeUp', key: 'ArrowUp', modifiers: [] },
      { action: 'volumeDown', key: 'ArrowDown', modifiers: [] },
      { action: 'mute', key: 'm', modifiers: [] },
      { action: 'fullscreen', key: 'f', modifiers: [] },
      { action: 'setTrimStart', key: 'i', modifiers: [] },
      { action: 'setTrimEnd', key: 'o', modifiers: [] },
      { action: 'export', key: 'e', modifiers: ['ctrl'] },
      { action: 'save', key: 's', modifiers: ['ctrl'] },
    ],
  }

  private constructor() {
    this.configFile = join(this.platform.getAppDataDir('clipy'), 'config.json')
    this.config = { ...this.DEFAULT_CONFIG }
    this.loadConfig()
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager()
    }
    return ConfigManager.instance
  }

  /**
   * Load configuration from disk
   */
  private loadConfig(): void {
    try {
      if (existsSync(this.configFile)) {
        const data = readFileSync(this.configFile, 'utf-8')
        const storedConfig = JSON.parse(data)

        // Deep merge with defaults
        this.config = this.deepMerge(this.DEFAULT_CONFIG, storedConfig)

        this.logger.info('Configuration loaded from disk')
      } else {
        this.config = { ...this.DEFAULT_CONFIG }
        this.saveConfig()
        this.logger.info('Using default configuration')
      }
    } catch (error) {
      this.logger.error('Failed to load configuration, using defaults', error as Error)
      this.config = { ...this.DEFAULT_CONFIG }
    }
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(): void {
    try {
      const data = JSON.stringify(this.config, null, 2)
      writeFileSync(this.configFile, data, 'utf-8')
      this.logger.debug('Configuration saved to disk')
    } catch (error) {
      this.logger.error('Failed to save configuration', error as Error)
    }
  }

  /**
   * Get configuration value
   */
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key]
  }

  /**
   * Set configuration value
   */
  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value
    this.saveConfig()
    this.logger.info('Configuration updated', { key, value })
  }

  /**
   * Get nested configuration value
   */
  getNested<T>(path: string): T | undefined {
    return this.getByPath(this.config, path)
  }

  /**
   * Set nested configuration value
   */
  setNested(path: string, value: any): void {
    this.setByPath(this.config, path, value)
    this.saveConfig()
    this.logger.info('Nested configuration updated', { path, value })
  }

  /**
   * Get entire configuration
   */
  getAll(): AppConfig {
    return { ...this.config }
  }

  /**
   * Update multiple configuration values
   */
  update(updates: Partial<AppConfig>): void {
    this.config = this.deepMerge(this.config, updates)
    this.saveConfig()
    this.logger.info('Configuration batch updated', { updates })
  }

  /**
   * Reset configuration to defaults
   */
  reset(): void {
    this.config = { ...this.DEFAULT_CONFIG }
    this.saveConfig()
    this.logger.info('Configuration reset to defaults')
  }

  /**
   * Validate configuration
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Validate download settings
    if (this.config.download.maxConcurrentDownloads < 1) {
      errors.push('maxConcurrentDownloads must be at least 1')
    }

    if (this.config.download.timeoutMs < 1000) {
      errors.push('timeoutMs must be at least 1000ms')
    }

    // Validate theme
    if (!['light', 'dark', 'system'].includes(this.config.theme)) {
      errors.push('theme must be one of: light, dark, system')
    }

    // Validate cache settings
    if (this.config.cache.maxSize < 1024 * 1024) {
      // 1MB minimum
      errors.push('cache.maxSize must be at least 1MB')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Get configuration file path
   */
  getConfigFilePath(): string {
    return this.configFile
  }

  /**
   * Deep merge two objects
   */
  private deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target }

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key]
        const targetValue = result[key]

        if (this.isObject(sourceValue) && this.isObject(targetValue)) {
          result[key] = this.deepMerge(targetValue, sourceValue as Partial<typeof targetValue>)
        } else {
          result[key] = sourceValue as any
        }
      }
    }

    return result
  }

  /**
   * Check if value is an object
   */
  private isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  /**
   * Get value by path (e.g., 'download.maxConcurrentDownloads')
   */
  private getByPath(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj)
  }

  /**
   * Set value by path
   */
  private setByPath(obj: any, path: string, value: any): void {
    const keys = path.split('.')
    const lastKey = keys.pop()!

    const target = keys.reduce((current, key) => {
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {}
      }
      return current[key]
    }, obj)

    target[lastKey] = value
  }
}
