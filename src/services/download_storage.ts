import { existsSync, readFileSync, writeFileSync } from 'fs'

import type { DownloadProgress } from '../types/download'
import { app } from 'electron'
import { join } from 'path'

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
    console.error('Error loading download storage file, falling back to defaults:', error)
    downloadStorage = { ...defaultStorage }
  }

  return downloadStorage
}

export function saveDownloadStorage(): void {
  try {
    downloadStorage.lastUpdated = Date.now()
    writeFileSync(downloadsFilePath, JSON.stringify(downloadStorage, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save download storage file:', error)
  }
}

export function getStoredDownloads(): DownloadProgress[] {
  return loadDownloadStorage().downloads
}

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

export function updateDownloadInStorage(downloadId: string, updates: Partial<DownloadProgress>): boolean {
  const storage = loadDownloadStorage()
  const downloadIndex = storage.downloads.findIndex(d => d.downloadId === downloadId)

  if (downloadIndex >= 0) {
    storage.downloads[downloadIndex] = { ...storage.downloads[downloadIndex], ...updates }
    downloadStorage = storage
    saveDownloadStorage()
    return true
  }

  return false
}

export function clearOldDownloads(maxAgeDays: number = 30): number {
  const storage = loadDownloadStorage()
  const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  const initialLength = storage.downloads.length
  storage.downloads = storage.downloads.filter(download => {
    // Keep active downloads and recently completed ones
    return download.status === 'downloading' || download.status === 'initializing' || download.startTime > cutoffTime
  })

  const removedCount = initialLength - storage.downloads.length
  if (removedCount > 0) {
    downloadStorage = storage
    saveDownloadStorage()
  }

  return removedCount
}
