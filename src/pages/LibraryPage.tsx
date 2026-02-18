/**
 * Library Page
 *
 * Download history and management interface. Features:
 * - Real-time download progress via IPC events
 * - Filter by status (all, active, completed, failed)
 * - Video preview modal with blob URL playback
 * - Actions: cancel, delete, retry, open folder, edit
 * - Stats cards showing download counts by status
 */

import { Download, Pause, Play, Square } from 'lucide-react'
import type { DownloadFilter, DownloadProgress } from '@/types/download'
import { DownloadsList } from '@/components/library/downloads-list'
import { LibraryHeader } from '@/components/library/library-header'
import { LibraryStats } from '@/components/library/library-stats'
import { VideoPreviewModal } from '@/components/library/video-preview-modal'
import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export default function LibraryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [downloads, setDownloads] = useState<DownloadProgress[]>([])
  const [filter, setFilter] = useState<DownloadFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDownload, setSelectedDownload] = useState<(DownloadProgress & { blobUrl?: string }) | null>(null)
  const [isVideoLoading, setIsVideoLoading] = useState(false)

  // Real-time updates using event listeners instead of polling
  React.useEffect(() => {
    loadDownloads()

    // Set up real-time event listeners for download updates
    const handleDownloadProgress = (progress: DownloadProgress) => {
      setDownloads(prev => {
        const existingIndex = prev.findIndex(d => d.downloadId === progress.downloadId)
        if (existingIndex >= 0) {
          // Update existing download
          const updated = [...prev]
          updated[existingIndex] = progress
          return updated
        } else {
          // Add new download
          return [...prev, progress]
        }
      })
    }

    const handleDownloadCompleted = (progress: DownloadProgress) => {
      setDownloads(prev => prev.map(d => (d.downloadId === progress.downloadId ? progress : d)))
      toast.success(`${t('msgDownloadCompletedToast')}: ${progress.title}`)
    }

    const handleDownloadDeleted = (downloadId: string) => {
      setDownloads(prev => prev.filter(d => d.downloadId !== downloadId))
      toast.success(t('msgDownloadDeleted'))
    }

    // Set up IPC event listeners for download updates
    const handleIpcProgress = (_event: any, progress: DownloadProgress) => {
      handleDownloadProgress(progress)
    }

    const handleIpcCompleted = (_event: any, progress: DownloadProgress) => {
      handleDownloadCompleted(progress)
    }

    const handleIpcDeleted = (_event: any, downloadId: string) => {
      handleDownloadDeleted(downloadId)
    }

    // Listen for IPC events from main process
    window.electronAPI.on('download-progress-update', handleIpcProgress)
    window.electronAPI.on('download-completed', handleIpcCompleted)
    window.electronAPI.on('download-deleted', handleIpcDeleted)

    // Keep polling as backup but make it less frequent
    const interval = setInterval(() => {
      loadDownloads()
    }, 2000) // Less frequent updates since we have real-time events

    // Keyboard support for closing modal
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedDownload) {
        handleClosePreview()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      clearInterval(interval)
      document.removeEventListener('keydown', handleKeyDown)
      window.electronAPI.removeListener('download-progress-update', handleIpcProgress)
      window.electronAPI.removeListener('download-completed', handleIpcCompleted)
      window.electronAPI.removeListener('download-deleted', handleIpcDeleted)
    }
  }, [filter, selectedDownload])

  const loadDownloads = async () => {
    try {
      const response = await window.electronAPI.downloadManager.list(filter)
      if (isSuccessResponse(response)) {
        // Server is source of truth - replace entire array
        setDownloads(response.data.downloads)
      }
    } catch (error) {
      console.error('Failed to load downloads:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await window.electronAPI.downloadManager.cancel(downloadId)
      if (isSuccessResponse(response)) {
        toast.success(t('msgDownloadCancelled'))
        loadDownloads()
      }
    } catch (error) {
      console.error('Failed to cancel download:', error)
      toast.error(t('msgDownloadCancelFailed'))
    }
  }

  const handleDeleteDownload = async (downloadId: string) => {
    try {
      const response = await window.electronAPI.downloadManager.delete(downloadId)
      if (isSuccessResponse(response)) {
        toast.success(t('msgDownloadDeleted'))
        loadDownloads()
      } else {
        toast.error(response.error || t('msgDownloadDeleteFailed'))
      }
    } catch (error) {
      console.error('Failed to delete download:', error)
      toast.error(t('msgDownloadDeleteFailed'))
    }
  }

  const handleRetryDownload = async (downloadId: string) => {
    try {
      const response = await window.electronAPI.downloadManager.retry(downloadId)
      if (isSuccessResponse(response)) {
        toast.success(t('msgDownloadRetried'))
        loadDownloads()
      } else {
        toast.error(response.error || t('msgDownloadRetryFailed'))
      }
    } catch (error) {
      console.error('Failed to retry download:', error)
      toast.error(t('msgDownloadRetryFailed'))
    }
  }

  // Calculate stats
  const stats = {
    total: downloads.length,
    active: downloads.filter(d => d.status === 'downloading').length,
    completed: downloads.filter(d => d.status === 'completed').length,
    failed: downloads.filter(d => d.status === 'failed').length,
  }

  // Enhanced preview functionality
  const handlePreviewDownload = async (download: DownloadProgress) => {
    if (download.status === 'completed' && download.filePath) {
      setIsVideoLoading(true)
      try {
        // Check if file exists via IPC
        const fileExists = await window.electronAPI.fileSystem.exists(download.filePath)
        if (fileExists) {
          // Read file as buffer via IPC and create blob URL for HTML5 video
          const response = await window.electronAPI.fileSystem.read(download.filePath)
          if (response.success && response.data) {
            // Convert Buffer to Uint8Array for Blob compatibility
            const uint8Array = new Uint8Array(response.data)
            const blob = new Blob([uint8Array], { type: 'video/mp4' })
            const blobUrl = URL.createObjectURL(blob)

            // Create a modified download object with blob URL
            setSelectedDownload({
              ...download,
              blobUrl: blobUrl,
            })
          } else {
            toast.error(t('msgUnableToReadVideoFile'))
          }
        } else {
          toast.error(t('msgVideoFileNotFound'))
        }
      } catch (error) {
        console.error('Error loading video for preview:', error)
        toast.error(t('msgUnableToLoadVideoPreview'))
      } finally {
        setIsVideoLoading(false)
      }
    }
  }

  const handleClosePreview = () => {
    // Clean up blob URL to prevent memory leaks
    if (selectedDownload?.blobUrl) {
      URL.revokeObjectURL(selectedDownload.blobUrl)
    }
    setSelectedDownload(null)
    setIsVideoLoading(false)
  }

  const handleOpenFolder = (download: DownloadProgress) => {
    if (download.filePath) {
      // Open containing folder
      window.electronAPI.shell.showItemInFolder(download.filePath)
    }
  }

  // Navigate to editor for trimming/editing
  const handleEditDownload = (download: DownloadProgress) => {
    if (download.status === 'completed' && download.filePath) {
      navigate({
        to: '/editor',
        search: { path: download.filePath },
      })
    }
  }

  // Real-time status indicators
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'downloading':
        return (
          <Badge variant="default">
            <Download className="mr-1 h-3 w-3" />
            {t('statusDownloading')}
          </Badge>
        )
      case 'completed':
        return (
          <Badge variant="default">
            <Play className="mr-1 h-3 w-3" />
            {t('statusCompleted')}
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <Square className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      case 'paused':
        return (
          <Badge variant="secondary">
            <Pause className="mr-1 h-3 w-3" />
            {t('statusPaused')}
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="container mx-auto space-y-8 py-8">
      <LibraryHeader />

      {/* Enhanced Stats with Real-time Indicators */}
      <LibraryStats stats={stats} />

      {/* Enhanced Downloads List with Better Features */}
      <DownloadsList
        downloads={downloads}
        filter={filter}
        searchQuery={searchQuery}
        isLoading={isLoading}
        onFilterChange={setFilter}
        onSearchChange={setSearchQuery}
        onCancelDownload={handleCancelDownload}
        onDeleteDownload={handleDeleteDownload}
        onRetryDownload={handleRetryDownload}
        onPreviewDownload={handlePreviewDownload}
        onOpenFolder={handleOpenFolder}
        onEditDownload={handleEditDownload}
        getStatusBadge={getStatusBadge}
      />

      {/* Enhanced Preview Modal for Completed Downloads */}
      {selectedDownload && selectedDownload.status === 'completed' && (
        <VideoPreviewModal
          download={selectedDownload}
          isLoading={isVideoLoading}
          onClose={handleClosePreview}
          onOpenFolder={() => handleOpenFolder(selectedDownload)}
        />
      )}
    </div>
  )
}
