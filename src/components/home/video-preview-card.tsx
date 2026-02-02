/**
 * VideoPreviewCard - Full-screen video editor with export dialog
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { CheckCircle2, ChevronLeft } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { DownloadProgress, VideoInfo } from '@/types/download'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { VideoEditor } from '@/components/editor/video-editor'
import { toast } from 'sonner'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTimelineStore } from '@/stores/timeline-store'
import { useTranslation } from 'react-i18next'

interface VideoPreviewCardProps {
  videoInfo: VideoInfo
  onDownload: (options: DownloadOptions) => void
  onReset: () => void
}

interface DownloadOptions {
  quality: string
  format: 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus'
  startTime?: number
  endTime?: number
  downloadSubtitles: boolean
  downloadThumbnail: boolean
  saveMetadata: boolean
  createSubdirectories: boolean
}

function formatTime(seconds: number): string {
  const floor = Math.floor(seconds)
  const min = Math.floor(floor / 60)
  const sec = floor % 60
  return `${min}:${sec < 10 ? '0' : ''}${sec}`
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`
  }
  return `${minutes}m ${secs}s`
}

function formatUploadDate(dateStr: string): string {
  if (!dateStr) return ''
  // Handle YYYYMMDD format (e.g., "20260130")
  if (/^\d{8}$/.test(dateStr)) {
    const year = dateStr.slice(0, 4)
    const month = dateStr.slice(4, 6)
    const day = dateStr.slice(6, 8)
    const date = new Date(`${year}-${month}-${day}`)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  // Handle ISO date or other formats
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return dateStr
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function VideoPreviewCard({ videoInfo, onDownload, onReset }: VideoPreviewCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [streamQuality, setStreamQuality] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)

  const { trimStart, trimEnd, isTrimmed, initializeForVideo } = useTimelineStore()

  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    quality: 'best',
    format: 'mp4',
    downloadSubtitles: true,
    downloadThumbnail: true,
    saveMetadata: true,
    createSubdirectories: true,
  })

  useEffect(() => {
    initializeForVideo(videoInfo.duration)
  }, [videoInfo.duration, initializeForVideo])

  useEffect(() => {
    const loadUserDefaults = async () => {
      try {
        const config = await window.electronAPI.config.get()
        if (config.success) {
          const userDefaultQuality = config.data.download.defaultVideoQuality
          const userDefaultFormat = config.data.download.videoFormat
          const availableQualities = videoInfo.availableQualities
          let selectedQuality = userDefaultQuality

          if (!availableQualities.includes(userDefaultQuality)) {
            if (availableQualities.includes('best')) selectedQuality = 'best'
            else if (availableQualities.includes('4K')) selectedQuality = '4K'
            else if (availableQualities.includes('1440p')) selectedQuality = '1440p'
            else if (availableQualities.includes('1080p')) selectedQuality = '1080p'
            else if (availableQualities.includes('720p')) selectedQuality = '720p'
            else selectedQuality = availableQualities[0] || 'best'
          }

          setDownloadOptions(prev => ({
            ...prev,
            quality: selectedQuality,
            format: userDefaultFormat as DownloadOptions['format'],
            downloadSubtitles: config.data.download.downloadSubtitles,
            downloadThumbnail: config.data.download.downloadThumbnails,
            saveMetadata: config.data.download.saveMetadata,
            createSubdirectories: config.data.download.createSubdirectories,
          }))
        }
      } catch (error) {
        console.error('Failed to load user defaults:', error)
      }
    }
    loadUserDefaults()
  }, [videoInfo.availableQualities])

  const streamSetupRef = useRef(false)

  useEffect(() => {
    streamSetupRef.current = false
    const formats = videoInfo.formats

    const isDirectHttps = (f: (typeof formats)[0]): boolean => {
      return f.protocol === 'https' || f.protocol === 'http'
    }

    const setupPreviewStream = async () => {
      if (streamSetupRef.current) return
      streamSetupRef.current = true

      const videoOnlyFormats = formats
        .filter(f => f.hasVideo && !f.hasAudio && f.url && isDirectHttps(f))
        .sort((a, b) => {
          const aIsGood = a.container === 'mp4' || a.container === 'webm' ? 1 : 0
          const bIsGood = b.container === 'mp4' || b.container === 'webm' ? 1 : 0
          if (aIsGood !== bIsGood) return bIsGood - aIsGood
          return (a.height || 0) - (b.height || 0)
        })

      const combinedFormats = formats
        .filter(f => f.hasAudio && f.hasVideo && f.url && isDirectHttps(f))
        .sort((a, b) => {
          const aIsMp4 = a.container === 'mp4' ? 1 : 0
          const bIsMp4 = b.container === 'mp4' ? 1 : 0
          if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4
          return (b.height || 0) - (a.height || 0)
        })

      if (combinedFormats.length > 0) {
        const format = combinedFormats[0]
        setStreamUrl(format.url!)
        setStreamQuality(`${format.height}p`)
        return
      }

      const bestVideo = videoOnlyFormats.find(f => (f.height || 0) <= 720) || videoOnlyFormats[0]
      if (bestVideo) {
        setStreamUrl(bestVideo.url!)
        setStreamQuality(`${bestVideo.height}p`)
        return
      }

      setStreamUrl(null)
      setStreamQuality(null)
    }

    setupPreviewStream()
  }, [videoInfo.formats])

  useEffect(() => {
    const handleProgressUpdate = (progress: DownloadProgress) => {
      if (progress.title === videoInfo.title) {
        setDownloadProgress(progress)
        if (progress.status === 'completed') {
          setIsDownloading(false)
          setShowExportDialog(false)
          toast.success(t('msgDownloadCompleted'))
          setTimeout(() => navigate({ to: '/library' }), 2000)
        } else if (progress.status === 'failed') {
          setIsDownloading(false)
          toast.error(progress.error?.message || t('msgDownloadFailed'))
        }
      }
    }

    window.addEventListener('download-progress-update', handleProgressUpdate as any)
    return () => window.removeEventListener('download-progress-update', handleProgressUpdate as any)
  }, [videoInfo.title, t, navigate])

  const handleDownload = useCallback(async () => {
    setIsDownloading(true)
    setDownloadProgress(null)

    const options = {
      ...downloadOptions,
      startTime: isTrimmed ? trimStart : undefined,
      endTime: isTrimmed ? trimEnd : undefined,
    }

    onDownload(options)
    toast.success(t('msgDownloadStarted'))
  }, [downloadOptions, isTrimmed, trimStart, trimEnd, onDownload, t])

  const handleTrimChange = useCallback((_start: number, _end: number) => {}, [])

  const getEstimatedFileSize = useCallback(() => {
    const duration = isTrimmed ? trimEnd - trimStart : videoInfo.duration
    const qualityMultiplier: Record<string, number> = {
      '4K': 50,
      '1440p': 25,
      '1080p': 15,
      '720p': 8,
      '480p': 4,
      '360p': 2,
      '240p': 1,
      '144p': 0.5,
      tiny: 0.3,
      best: 15,
      worst: 1,
    }
    const multiplier = qualityMultiplier[downloadOptions.quality] || 15
    const estimatedBytes = duration * multiplier * 1024 * 1024
    return formatFileSize(estimatedBytes)
  }, [isTrimmed, trimStart, trimEnd, videoInfo.duration, downloadOptions.quality])

  const posterUrl = videoInfo.thumbnails.at(-1)?.url
  const clipDuration = isTrimmed ? trimEnd - trimStart : videoInfo.duration

  return (
    <div className="flex h-full flex-col">
      {/* Top Header Bar */}
      <div className="bg-background/80 relative z-20 flex items-center justify-between border-b px-4 py-3 backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onReset} className="shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div
            className="group relative min-w-0 flex-1 cursor-pointer"
            onMouseEnter={() => setShowInfo(true)}
            onMouseLeave={() => setShowInfo(false)}
          >
            <h1 className="truncate text-sm font-medium">{videoInfo.title}</h1>
            <p className="text-muted-foreground truncate text-xs">
              {videoInfo.channel.name} · {formatDuration(videoInfo.duration)}
              {isTrimmed && ` · ${t('playerClip')}: ${formatDuration(clipDuration)}`}
            </p>

            {/* Hover Card with full info */}
            {showInfo && (
              <div className="bg-popover absolute top-full left-0 z-[100] mt-2 w-96 overflow-hidden rounded-xl border shadow-2xl">
                {/* Thumbnail Header */}
                <div className="relative aspect-video w-full bg-black">
                  {posterUrl && <img src={posterUrl} alt="" className="h-full w-full object-cover" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute right-3 bottom-3 left-3">
                    <h3 className="line-clamp-2 text-sm font-semibold text-white drop-shadow-lg">{videoInfo.title}</h3>
                  </div>
                  <div className="absolute top-2 right-2 rounded bg-black/80 px-1.5 py-0.5 font-mono text-xs text-white">
                    {formatDuration(videoInfo.duration)}
                  </div>
                </div>

                {/* Content */}
                <div className="space-y-3 p-3">
                  {/* Channel */}
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={videoInfo.channel.thumbnail} />
                      <AvatarFallback className="text-xs">{videoInfo.channel.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="truncate text-sm font-medium">{videoInfo.channel.name}</span>
                        {videoInfo.channel.verified && <CheckCircle2 className="text-primary h-3.5 w-3.5 shrink-0" />}
                      </div>
                      {videoInfo.channel.subscriberCount && (
                        <p className="text-muted-foreground text-xs">
                          {videoInfo.channel.subscriberCount.toLocaleString()} {t('previewSubscribers')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-medium">{videoInfo.viewsFormatted}</p>
                      <p className="text-muted-foreground text-[10px]">{t('previewViews')}</p>
                    </div>
                    <div className="bg-muted/50 rounded-lg px-2 py-1.5 text-center">
                      <p className="text-xs font-medium">
                        {formatUploadDate(videoInfo.uploadDate) || t('editorUnknown')}
                      </p>
                      <p className="text-muted-foreground text-[10px]">{t('previewUploaded')}</p>
                    </div>
                  </div>

                  {/* Description */}
                  {videoInfo.description && (
                    <p className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                      {videoInfo.description}
                    </p>
                  )}

                  {/* Preview & Download Quality */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px]">{t('previewPreview')}</span>
                      <span className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
                        {streamQuality || 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px]">{t('previewBestAvailable')}</span>
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
                        {videoInfo.availableQualities.find(q => q !== 'best' && q !== 'worst') || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Download qualities */}
                  <div className="space-y-1.5">
                    <span className="text-muted-foreground text-[10px]">{t('previewDownloadOptions')}</span>
                    <div className="flex flex-wrap gap-1">
                      {videoInfo.availableQualities
                        .filter(q => q !== 'best' && q !== 'worst')
                        .map(q => (
                          <span key={q} className="bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                            {q}
                          </span>
                        ))}
                    </div>
                  </div>

                  {/* Tags */}
                  {videoInfo.tags && videoInfo.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {videoInfo.tags.slice(0, 4).map(tag => (
                        <span key={tag} className="text-muted-foreground text-[10px]">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="text-muted-foreground hidden items-center gap-3 text-xs sm:flex">
            {isTrimmed && (
              <span className="font-mono">
                {formatTime(trimStart)} → {formatTime(trimEnd)}
              </span>
            )}
            <span className="font-mono">~{getEstimatedFileSize()}</span>
          </div>
          <Button onClick={() => setShowExportDialog(true)} disabled={isDownloading}>
            {t('editorExport')}
          </Button>
        </div>
      </div>

      {/* Video Editor - Takes remaining space */}
      <div className="relative z-10 min-h-0 flex-1">
        <VideoEditor
          videoUrl={streamUrl || undefined}
          poster={posterUrl}
          duration={videoInfo.duration}
          title={videoInfo.title}
          onTrimChange={handleTrimChange}
          isExternalUrl={true}
        />

        {/* Download Progress Overlay */}
        {isDownloading && downloadProgress && (
          <div className="bg-background/90 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
            <div className="w-full max-w-md space-y-4 p-6">
              <div className="text-center">
                <h3 className="text-lg font-semibold">{t('downloading')}</h3>
                <p className="text-muted-foreground text-sm">{videoInfo.title}</p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{downloadProgress.progress}%</span>
                  <span>{downloadProgress.speed || '--'}</span>
                </div>
                <Progress value={downloadProgress.progress} className="h-2" />
                <div className="text-muted-foreground flex justify-between text-xs">
                  <span>
                    {t('eta')}: {downloadProgress.eta || '--'}
                  </span>
                  <span>{downloadProgress.size || '--'}</span>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={() => setIsDownloading(false)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          {/* Preview Header */}
          <div className="bg-muted/30 relative">
            <div className="flex gap-4 p-4">
              {/* Thumbnail */}
              <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-black">
                {posterUrl && <img src={posterUrl} alt="" className="h-full w-full object-cover" />}
                <div className="absolute right-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white">
                  {isTrimmed ? formatDuration(clipDuration) : formatDuration(videoInfo.duration)}
                </div>
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1 py-1">
                <h3 className="line-clamp-2 text-sm leading-tight font-medium">{videoInfo.title}</h3>
                <p className="text-muted-foreground mt-1 text-xs">{videoInfo.channel.name}</p>
                {isTrimmed && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="bg-primary/10 text-primary rounded px-2 py-0.5 font-mono text-[10px] font-medium">
                      CLIP
                    </div>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {formatTime(trimStart)} → {formatTime(trimEnd)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Trim visualization bar */}
            {isTrimmed && (
              <div className="bg-muted mx-4 mb-4 h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{
                    marginLeft: `${(trimStart / videoInfo.duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / videoInfo.duration) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-5 p-4">
            {/* Quality Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">{t('previewQualityLabel')}</label>
                <span className="text-muted-foreground text-[10px]">
                  {downloadOptions.quality === 'best' ? t('previewAuto') : downloadOptions.quality}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setDownloadOptions(prev => ({ ...prev, quality: 'best' }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    downloadOptions.quality === 'best'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  {t('previewBest')}
                </button>
                {videoInfo.availableQualities
                  .filter(q => q !== 'best' && q !== 'worst')
                  .slice(0, 5)
                  .map(quality => (
                    <button
                      key={quality}
                      onClick={() => setDownloadOptions(prev => ({ ...prev, quality }))}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        downloadOptions.quality === quality
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      {quality}
                    </button>
                  ))}
              </div>
            </div>

            {/* Format Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium">{t('previewFormat')}</label>
              <div className="grid grid-cols-5 gap-2">
                {(['mp4', 'webm', 'mkv', 'mp3', 'm4a'] as const).map(format => (
                  <button
                    key={format}
                    onClick={() => setDownloadOptions(prev => ({ ...prev, format }))}
                    className={`rounded-lg border py-2 text-xs font-medium uppercase transition-colors ${
                      downloadOptions.format === format
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    } ${format === 'mp3' || format === 'm4a' ? 'text-muted-foreground' : ''}`}
                  >
                    {format}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-[10px]">
                {downloadOptions.format === 'mp3' || downloadOptions.format === 'm4a'
                  ? t('previewAudioOnly')
                  : t('previewVideoAudio')}
              </p>
            </div>

            {/* Options */}
            <div className="flex items-center justify-between border-t pt-4">
              <div className="flex gap-4">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Switch
                    checked={downloadOptions.downloadSubtitles}
                    onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, downloadSubtitles: checked }))}
                    className="scale-75"
                  />
                  <span className="text-[11px]">{t('previewSubtitles')}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Switch
                    checked={downloadOptions.downloadThumbnail}
                    onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, downloadThumbnail: checked }))}
                    className="scale-75"
                  />
                  <span className="text-[11px]">{t('previewThumbnail')}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <Switch
                    checked={downloadOptions.saveMetadata}
                    onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, saveMetadata: checked }))}
                    className="scale-75"
                  />
                  <span className="text-[11px]">{t('previewMetadata')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-muted/30 flex items-center justify-between border-t px-4 py-3">
            <div>
              <p className="text-muted-foreground text-[10px]">{t('previewEstimatedSize')}</p>
              <p className="font-mono text-sm font-semibold">~{getEstimatedFileSize()}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowExportDialog(false)}>
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={handleDownload} disabled={isDownloading} className="px-6">
                {isDownloading ? t('editorExporting') : t('editorExport')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default VideoPreviewCard
