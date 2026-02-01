import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, Folder, Pause, Play, Square } from 'lucide-react'
import type { DownloadFilter, DownloadProgress } from '@/types/download'
import { DownloadsList, LibraryHeader } from '@/components/library'
import React, { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

export default function LibraryPage() {
  const { t } = useTranslation()
  const [downloads, setDownloads] = useState<DownloadProgress[]>([])
  const [filter, setFilter] = useState<DownloadFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDownload, setSelectedDownload] = useState<DownloadProgress | null>(null)
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
        // Clean up blob URL to prevent memory leaks
        if ((selectedDownload as any).blobUrl) {
          URL.revokeObjectURL((selectedDownload as any).blobUrl)
        }
        setSelectedDownload(null)
        setIsVideoLoading(false)
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
      if (!isSuccessResponse(response)) {
        toast.error(response.error || t('msgDownloadDeleteFailed'))
      }
      // Real-time event will handle UI update
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

  const activeDownloads = downloads.filter(d => d.status === 'downloading')
  const completedDownloads = downloads.filter(d => d.status === 'completed')
  const failedDownloads = downloads.filter(d => d.status === 'failed')

  const stats = {
    total: downloads.length,
    active: activeDownloads.length,
    completed: completedDownloads.length,
    failed: failedDownloads.length,
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
            const blob = new Blob([response.data], { type: 'video/mp4' })
            const blobUrl = URL.createObjectURL(blob)

            // Create a modified download object with blob URL
            const downloadWithBlob = {
              ...download,
              blobUrl: blobUrl,
            }

            setSelectedDownload(downloadWithBlob as any)
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

  const handleOpenFolder = (download: DownloadProgress) => {
    if (download.filePath) {
      // Open containing folder
      window.electronAPI.shell.showItemInFolder(download.filePath)
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Downloads</CardTitle>
            <Download className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('activeDownloads')}</CardTitle>
            <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-primary text-2xl font-bold">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('completedDownloads')}</CardTitle>
            <div className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('failedDownloads')}</CardTitle>
            <div className="bg-destructive h-2 w-2 rounded-full" />
          </CardHeader>
          <CardContent>
            <div className="text-destructive text-2xl font-bold">{stats.failed}</div>
          </CardContent>
        </Card>
      </div>

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
        getStatusBadge={getStatusBadge}
      />

      {/* Enhanced Preview Modal for Completed Downloads */}
      {selectedDownload && selectedDownload.status === 'completed' && (
        <div
          className="bg-background/50 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => {
            // Clean up blob URL to prevent memory leaks
            if ((selectedDownload as any).blobUrl) {
              URL.revokeObjectURL((selectedDownload as any).blobUrl)
            }
            setSelectedDownload(null)
            setIsVideoLoading(false)
          }}
        >
          <div
            className="bg-background max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col md:flex-row">
              {/* Video Player Section */}
              <div className="flex-1 p-4">
                {isVideoLoading ? (
                  <div className="bg-muted flex h-64 w-full items-center justify-center rounded-lg">
                    <div className="text-center">
                      <div className="border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2"></div>
                      <p className="text-muted-foreground text-sm">{t('loadingVideo')}</p>
                    </div>
                  </div>
                ) : (
                  <video
                    controls
                    className="w-full rounded-lg"
                    preload="metadata"
                    onError={e => {
                      console.error('Video playback error:', e)
                      toast.error(t('msgUnableToPlayVideoPreview'))
                    }}
                    onLoadStart={() => {
                      // Video is loading
                    }}
                    onCanPlay={() => {
                      // Video is ready to play
                    }}
                  >
                    <source
                      src={(selectedDownload as any).blobUrl || `file://${selectedDownload.filePath || ''}`}
                      type="video/mp4"
                    />
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>

              {/* Info Section */}
              <div className="w-full border-t p-4 md:w-80 md:border-t-0 md:border-l">
                <h3 className="mb-4 text-lg font-semibold">{selectedDownload.title}</h3>
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">{t('previewSize')}</span>
                    <span className="text-sm font-medium">{selectedDownload.size}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">{t('previewQuality')}</span>
                    <span className="text-sm font-medium">{t('previewQualityMP4')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">{t('previewCompleted')}</span>
                    <span className="text-sm font-medium">
                      {new Date(selectedDownload.startTime || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">{t('previewDuration')}</span>
                    <span className="text-sm font-medium">{t('previewDurationVideoFile')}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() =>
                      selectedDownload.filePath && window.electronAPI.shell.openPath(selectedDownload.filePath)
                    }
                    className="w-full"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {t('openInExternalPlayer')}
                  </Button>
                  <Button variant="outline" onClick={() => handleOpenFolder(selectedDownload)} className="w-full">
                    <Folder className="mr-2 h-4 w-4" />
                    {t('openFolder')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Clean up blob URL to prevent memory leaks
                      if ((selectedDownload as any).blobUrl) {
                        URL.revokeObjectURL((selectedDownload as any).blobUrl)
                      }
                      setSelectedDownload(null)
                      setIsVideoLoading(false)
                    }}
                    className="w-full"
                  >
                    {t('closePreview')}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
