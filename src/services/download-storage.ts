/**
 * Download Storage Service
 * Persists download history to disk as JSON for recovery across app restarts.
 * Simple file-based storage - no database dependencies.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'

import type { DownloadProgress } from '../types/download'
import { Logger } from '../utils/logger'
import { app } from 'electron'
import { join } from 'path'

const logger = Logger.getInstance()

const downloadsFilePath = join(app.getPath('userData'), 'downloads.json')

interface DownloadStorageData {
  downloads: DownloadProgress[]
  lastUpdated: number
}

const defaultStorage: DownloadStorageData = {
  downloads: [],
  lastUpdated: Date.now(),
}

let downloadStorage: DownloadStorageData

/**
 * Load download storage from disk. Returns cached data if already loaded.
 * Creates default empty storage if file doesn't exist.
 */
export function loadDownloadStorage(): DownloadStorageData {
  if (downloadStorage) {
    return downloadStorage
  }

  try {
    if (existsSync(downloadsFilePath)) {
      const fileContent = readFileSync(downloadsFilePath, 'utf-8')
      const storedData = JSON.parse(fileContent) as Partial<DownloadStorageData>
      downloadStorage = {
        downloads: storedData.downloads || [],
        lastUpdated: storedData.lastUpdated || Date.now(),
      }
    } else {
      downloadStorage = { ...defaultStorage }
    }
  } catch (error) {
    logger.warn('Error loading download storage, using defaults', error as Error)
    downloadStorage = { ...defaultStorage }
  }

  return downloadStorage
}

/** Persist current storage state to disk */
export function saveDownloadStorage(): void {
  try {
    downloadStorage.lastUpdated = Date.now()
    writeFileSync(downloadsFilePath, JSON.stringify(downloadStorage, null, 2), 'utf-8')
  } catch (error) {
    logger.error('Failed to save download storage', error as Error)
  }
}

/** Get all stored downloads from memory (loads from disk if needed) */
export function getStoredDownloads(): DownloadProgress[] {
  return loadDownloadStorage().downloads
}

/** Add or update a download in storage. Updates existing if downloadId matches. */
export function addDownloadToStorage(download: DownloadProgress): void {
  const storage = loadDownloadStorage()
  const existingIndex = storage.downloads.findIndex(d => d.downloadId === download.downloadId)

  if (existingIndex >= 0) {
    storage.downloads[existingIndex] = download
  } else {
    storage.downloads.push(download)
  }

  downloadStorage = storage
  saveDownloadStorage()
}

/** Remove a download from storage by ID. Returns true if found and removed. */
export function removeDownloadFromStorage(downloadId: string): boolean {
  const storage = loadDownloadStorage()
  const initialLength = storage.downloads.length
  storage.downloads = storage.downloads.filter(d => d.downloadId !== downloadId)

  const wasRemoved = storage.downloads.length < initialLength
  if (wasRemoved) {
    downloadStorage = storage
    saveDownloadStorage()
  }

  return wasRemoved
}

/** Partially update a download's fields. Returns true if found and updated. */
export function updateDownloadInStorage(downloadId: string, updates: Partial<DownloadProgress>): boolean {
  const storage = loadDownloadStorage()
  const downloadIndex = storage.downloads.findIndex(d => d.downloadId === downloadId)

  if (downloadIndex >= 0) {
    storage.downloads[downloadIndex] = { ...storage.downloads[downloadIndex], ...updates }
    downloadStorage = storage
    saveDownloadStorage()

    // Log status changes for debugging
    if (updates.status) {
      logger.debug('Download status updated in storage', {
        downloadId,
        newStatus: updates.status,
        title: storage.downloads[downloadIndex].title
      })
    }
    return true
  }

  logger.warn('Download not found in storage for update', { downloadId, updates })
  return false
}

/**
 * Remove downloads older than maxAgeDays.
 * Also cleans up stale "downloading"/"initializing" entries from crashed sessions.
 * Returns count of removed entries.
 */
export function clearOldDownloads(maxAgeDays: number = 30): number {
  const storage = loadDownloadStorage()
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  const initialLength = storage.downloads.length
  storage.downloads = storage.downloads.filter(download => {
    // Keep only recent downloads (within maxAgeDays)
    // Don't keep "downloading" or "initializing" status - those are stale from previous sessions
    return download.startTime > cutoffTime
  })

  const removedCount = initialLength - storage.downloads.length
  if (removedCount > 0) {
    downloadStorage = storage
    saveDownloadStorage()
  }

  return removedCount
}
