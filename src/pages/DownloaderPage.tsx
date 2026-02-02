/**
 * Downloader Page
 *
 * Main download interface for YouTube videos. Handles:
 * - URL input and validation
 * - Video info fetching via yt-dlp
 * - Download options selection (quality, format)
 * - Starting downloads with duplicate detection
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { DownloadOptions, VideoInfo } from '@/types/download'
import React, { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { AlertCircle } from 'lucide-react'
import { DownloaderRoute } from '@/routes/routes'
import { UrlInputCard } from '../components/downloader/url-input-card'
import { VideoPreviewCard } from '../components/downloader/video-preview-card'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

export default function DownloaderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { url: urlFromSearch } = useSearch({ from: DownloaderRoute.id })

  const [currentUrl, setCurrentUrl] = useState(urlFromSearch || '')
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [isLoading, setIsLoading] = useState(!!urlFromSearch)
  const [error, setError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  React.useEffect(() => {
    if (currentUrl) {
      handleFetchVideoInfo(currentUrl)
    }
  }, [currentUrl])

  const handleFetchVideoInfo = async (url: string) => {
    setIsLoading(true)
    setVideoInfo(null)
    setError(null)

    // Add a small delay to show loading state even for fast responses
    const minLoadingTime = new Promise(resolve => setTimeout(resolve, 500))

    try {
      // Use getStreamingInfo to get both video info AND streaming URL
      // This ensures we have playable URLs for the video preview
      const [response] = await Promise.all([window.electronAPI.downloadManager.getStreamingInfo(url), minLoadingTime])

      if (isSuccessResponse(response)) {
        console.log('[Downloader] Got streaming info:', {
          title: response.data.videoInfo.title,
          formatsWithUrls: response.data.videoInfo.formats.filter((f: any) => f.url).length,
          streamingUrl: response.data.streamingUrl ? 'available' : 'not available',
        })
        setVideoInfo(response.data.videoInfo)
      } else {
        setError(response.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('msgUnknownError'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (options: DownloadOptions) => {
    if (!videoInfo || isDownloading) return

    console.log('[DOWNLOADER] Starting download for:', videoInfo.title)
    setIsDownloading(true)

    try {
      const fullUrl = `https://www.youtube.com/watch?v=${videoInfo.id}`

      // Check for duplicate downloads
      const downloadsResponse = await window.electronAPI.downloadManager.list('all')
      if (isSuccessResponse(downloadsResponse)) {
        const existingDownload = downloadsResponse.data.downloads.find(download => download.url === fullUrl)

        if (existingDownload) {
          if (existingDownload.status === 'downloading') {
            setError(`${t('msgDownloadAlreadyInProgress')}: ${existingDownload.title}`)
            return
          } else if (existingDownload.status === 'completed') {
            setError(`${t('msgDownloadAlreadyCompleted')}: ${existingDownload.title}`)
            return
          }
          // Allow retry for failed downloads - they can be restarted
        }
      }

      const configResponse = await window.electronAPI.config.get()
      if (isSuccessResponse(configResponse)) {
        const config = configResponse.data
        const finalOptions = {
          quality: options.quality || config.download.defaultVideoQuality,
          format: options.format || config.download.videoFormat,
          downloadSubtitles: options.downloadSubtitles ?? config.download.downloadSubtitles,
          downloadThumbnail: options.downloadThumbnail ?? config.download.downloadThumbnails,
          saveMetadata: options.saveMetadata ?? config.download.saveMetadata,
          createSubdirectories: options.createSubdirectories ?? config.download.createSubdirectories,
          startTime: options.startTime,
          endTime: options.endTime,
        }

        const response = await window.electronAPI.downloadManager.start(fullUrl, finalOptions)
        if (isSuccessResponse(response)) {
          toast.success(`${t('msgDownloadStarted')}: ${videoInfo.title}`)
          // Navigate to library page to show download progress
          navigate({ to: '/library' })
        } else {
          setError(response.error || t('msgDownloadStartFailed'))
          setIsDownloading(false)
        }
      } else {
        const response = await window.electronAPI.downloadManager.start(fullUrl, options)
        if (isSuccessResponse(response)) {
          toast.success(`${t('msgDownloadStarted')}: ${videoInfo.title}`)
          // Navigate to library page to show download progress
          navigate({ to: '/library' })
        } else {
          setError(response.error || t('msgDownloadStartFailed'))
          setIsDownloading(false)
        }
      }
    } catch (error) {
      console.error('Download failed:', error)
      setError(error instanceof Error ? error.message : t('msgUnknownError'))
      setIsDownloading(false)
    }
  }

  const handleReset = () => {
    setCurrentUrl('')
    setVideoInfo(null)
    setError(null)
    setIsLoading(false)
  }

  const renderContent = () => {
    if (isLoading) {
      return <UrlInputCard onSubmit={setCurrentUrl} isLoading={isLoading} />
    }

    if (error) {
      return (
        <div className="mx-auto w-full max-w-4xl">
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('errorGeneric')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="flex justify-center">
            <UrlInputCard onSubmit={setCurrentUrl} isLoading={false} />
          </div>
        </div>
      )
    }

    if (videoInfo) {
      return <VideoPreviewCard videoInfo={videoInfo} onDownload={handleDownload} onReset={handleReset} />
    }

    return <UrlInputCard onSubmit={setCurrentUrl} isLoading={isLoading} />
  }

  return <div className="space-y-12">{renderContent()}</div>
}
