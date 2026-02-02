/**
 * VideoPreviewCard - Refactored to use the new VideoEditor component
 * Provides video preview, trimming, and download options for YouTube videos
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CheckCircle2,
  Download,
  FileVideo,
  Image as ImageIcon,
  Info,
  Scissors,
  Settings,
  Subtitles,
  X,
  Zap,
} from 'lucide-react'
import type { DownloadProgress, VideoInfo } from '@/types/download'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { VideoEditor } from '@/components/editor'
import { toast } from 'sonner'
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

  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [streamQuality, setStreamQuality] = useState<string | null>(null)

  // Get trim state from the timeline store
  const { trimStart, trimEnd, isTrimmed, initializeForVideo } = useTimelineStore()

  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    quality: 'best',
    format: 'mp4',
    downloadSubtitles: true,
    downloadThumbnail: true,
    saveMetadata: true,
    createSubdirectories: true,
  })

  // Initialize timeline store with video duration
  useEffect(() => {
    initializeForVideo(videoInfo.duration)
  }, [videoInfo.duration, initializeForVideo])

  // Load user defaults from config
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
            if (availableQualities.includes('best')) {
              selectedQuality = 'best'
            } else if (availableQualities.includes('4K')) {
              selectedQuality = '4K'
            } else if (availableQualities.includes('1440p')) {
              selectedQuality = '1440p'
            } else if (availableQualities.includes('1080p')) {
              selectedQuality = '1080p'
            } else if (availableQualities.includes('720p')) {
              selectedQuality = '720p'
            } else {
              selectedQuality = availableQualities[0] || 'best'
            }
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

  // Track if we've already tried to get streaming URLs to avoid duplicate requests
  const streamSetupRef = useRef(false)

  // Get dual-stream URLs for high-quality preview with audio
  // DUAL-STREAM APPROACH:
  // - YouTube combined formats are limited to 720p max
  // - For 1080p+ quality, we use separate video-only and audio-only streams
  // - Video element plays muted video, Audio element plays synced audio
  // - Electron's webRequest API handles CORS bypass for googlevideo.com
  useEffect(() => {
    // Reset when formats change
    streamSetupRef.current = false

    const formats = videoInfo.formats

    // Helper: Check if format uses direct HTTPS (not HLS/DASH manifest)
    const isDirectHttps = (f: (typeof formats)[0]): boolean => {
      return f.protocol === 'https' || f.protocol === 'http'
    }

    const setupDualStream = async () => {
      if (streamSetupRef.current) return
      streamSetupRef.current = true

      // Get video-only formats sorted by quality (highest first)
      const videoOnlyFormats = formats
        .filter(f => f.hasVideo && !f.hasAudio && f.url && isDirectHttps(f))
        .sort((a, b) => {
          // Prefer mp4/webm for browser compatibility
          const aIsGood = a.container === 'mp4' || a.container === 'webm' ? 1 : 0
          const bIsGood = b.container === 'mp4' || b.container === 'webm' ? 1 : 0
          if (aIsGood !== bIsGood) return bIsGood - aIsGood
          // Prefer higher resolution (no cap - get the best quality!)
          return (b.height || 0) - (a.height || 0)
        })

      // Get audio-only formats sorted by quality
      const audioOnlyFormats = formats
        .filter(f => f.hasAudio && !f.hasVideo && f.url && isDirectHttps(f))
        .sort((a, b) => {
          // Prefer m4a/mp4 audio for browser compatibility
          const aIsGood = a.container === 'm4a' || a.container === 'mp4' ? 2 : a.container === 'webm' ? 1 : 0
          const bIsGood = b.container === 'm4a' || b.container === 'mp4' ? 2 : b.container === 'webm' ? 1 : 0
          if (aIsGood !== bIsGood) return bIsGood - aIsGood
          // Prefer higher bitrate
          return (b.audioBitrate || 0) - (a.audioBitrate || 0)
        })

      // Combined formats (audio+video together, but limited to ~720p)
      const combinedFormats = formats
        .filter(f => f.hasAudio && f.hasVideo && f.url && isDirectHttps(f))
        .sort((a, b) => {
          const aIsMp4 = a.container === 'mp4' ? 1 : 0
          const bIsMp4 = b.container === 'mp4' ? 1 : 0
          if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4
          return (b.height || 0) - (a.height || 0)
        })

      // STRATEGY 1: Dual-stream for 1080p+ quality with audio
      const bestVideo = videoOnlyFormats.find(f => (f.height || 0) >= 720) || videoOnlyFormats[0]
      const bestAudio = audioOnlyFormats[0]

      if (bestVideo && bestAudio) {
        console.log(
          `[PREVIEW] Using DUAL-STREAM: ${bestVideo.height}p video + ${bestAudio.audioBitrate || '?'}kbps audio`,
        )
        setStreamUrl(bestVideo.url!)
        setAudioUrl(bestAudio.url!)
        setStreamQuality(`${bestVideo.height}p`)
        return
      }

      // STRATEGY 2: Combined format (simpler but limited to ~720p)
      if (combinedFormats.length > 0) {
        const format = combinedFormats[0]
        console.log(`[PREVIEW] Using combined format: ${format.height}p (includes audio)`)
        setStreamUrl(format.url!)
        setAudioUrl(null) // No separate audio needed
        setStreamQuality(`${format.height}p`)
        return
      }

      // STRATEGY 3: Video-only (no audio available)
      if (bestVideo) {
        console.log(`[PREVIEW] Using video-only (no audio): ${bestVideo.height}p`)
        setStreamUrl(bestVideo.url!)
        setAudioUrl(null)
        setStreamQuality(`${bestVideo.height}p`)
        return
      }

      console.warn('[PREVIEW] No suitable streaming URL found')
      setStreamUrl(null)
      setAudioUrl(null)
      setStreamQuality(null)
    }

    setupDualStream()
  }, [videoInfo.formats])

  // Listen for download progress updates
  useEffect(() => {
    const handleProgressUpdate = (progress: DownloadProgress) => {
      if (progress.title === videoInfo.title) {
        setDownloadProgress(progress)
        if (progress.status === 'completed') {
          setIsDownloading(false)
          toast.success(t('msgDownloadCompleted'))
          setTimeout(() => {
            navigate({ to: '/library' })
          }, 2000)
        } else if (progress.status === 'failed') {
          setIsDownloading(false)
          toast.error(progress.error?.message || t('msgDownloadFailed'))
        }
      }
    }

    window.addEventListener('download-progress-update', handleProgressUpdate as any)
    return () => {
      window.removeEventListener('download-progress-update', handleProgressUpdate as any)
    }
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

  const handleTrimChange = useCallback((_start: number, _end: number) => {
    // Trim changes are automatically handled by the timeline store
  }, [])

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

  // Get thumbnail URL for poster
  const posterUrl = videoInfo.thumbnails.at(-1)?.url

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      {/* Video Info Header */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <Avatar className="ring-primary/20 h-12 w-12 ring-2">
              <AvatarImage src={videoInfo.channel.thumbnail} alt={videoInfo.channel.name} />
              <AvatarFallback>{videoInfo.channel.name?.[0]}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-lg font-semibold">{videoInfo.title}</h2>
              <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
                <span className="text-foreground font-medium">{videoInfo.channel.name}</span>
                {videoInfo.channel.verified && <CheckCircle2 className="text-primary h-4 w-4" />}
                <span>•</span>
                <span>{videoInfo.viewsFormatted} views</span>
                <span>•</span>
                <span>{videoInfo.uploadDate}</span>
              </div>
            </div>
            {videoInfo.isLive && (
              <Badge variant="destructive" className="animate-pulse">
                {t('liveBadge')}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Video Editor with Timeline - Dual-stream for 1080p+ with synced audio! */}
      <VideoEditor
        videoUrl={streamUrl || undefined}
        audioUrl={audioUrl || undefined}
        poster={posterUrl}
        duration={videoInfo.duration}
        title={videoInfo.title}
        onTrimChange={handleTrimChange}
        isExternalUrl={true} // YouTube streams don't support CORS for canvas capture
      />

      {/* Stream Quality Badge */}
      {streamQuality && (
        <div className="flex items-center justify-center">
          <Badge variant="secondary" className="text-xs">
            Preview: {streamQuality} {audioUrl ? '+ Audio (Synced)' : streamUrl ? '(Video only)' : ''}
          </Badge>
        </div>
      )}

      {/* Trim Info Badge */}
      {isTrimmed && (
        <div className="flex items-center justify-center gap-2">
          <Scissors className="text-primary h-4 w-4" />
          <Badge variant="outline" className="text-sm">
            Trimmed clip: {formatTime(trimStart)} → {formatTime(trimEnd)} ({formatTime(trimEnd - trimStart)})
          </Badge>
        </div>
      )}

      {/* Download Options Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Quality & Format Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Settings className="text-primary h-5 w-5" />
              </div>
              {t('qualityAndFormat')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base font-medium">
                <Zap className="h-4 w-4" />
                {t('videoQuality')}
              </Label>
              <Select
                value={downloadOptions.quality}
                onValueChange={quality => setDownloadOptions(prev => ({ ...prev, quality }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {videoInfo.availableQualities.map(quality => (
                    <SelectItem key={quality} value={quality}>
                      <div className="flex items-center gap-3 py-1">
                        {quality === 'best' && (
                          <Badge variant="secondary" className="text-xs">
                            {t('recommended')}
                          </Badge>
                        )}
                        <span className="font-medium">{quality}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2 text-base font-medium">
                <FileVideo className="h-4 w-4" />
                {t('fileFormat')}
              </Label>
              <Select
                value={downloadOptions.format}
                onValueChange={(format: DownloadOptions['format']) => setDownloadOptions(prev => ({ ...prev, format }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">
                    <div className="flex items-center gap-3 py-1">
                      <Badge variant="secondary" className="text-xs">
                        {t('mostCompatible')}
                      </Badge>
                      <span className="font-medium">{t('formatMP4')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="webm">
                    <span className="font-medium">{t('formatWebM')}</span>
                  </SelectItem>
                  <SelectItem value="mkv">
                    <span className="font-medium">{t('formatMKV')}</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="from-primary/5 to-primary/10 border-primary/20 rounded-xl border bg-gradient-to-r p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-semibold">{t('estimatedSize')}</p>
                  <p className="text-muted-foreground text-sm">
                    {isTrimmed ? t('trimmedClipSize') : t('fullVideoSize')}
                  </p>
                </div>
                <Badge variant="outline" className="bg-background px-4 py-2 font-mono text-xl">
                  {getEstimatedFileSize()}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Download Options Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Download className="text-primary h-5 w-5" />
              </div>
              {t('downloadOptions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/20 hover:bg-muted/30 flex items-center justify-between rounded-xl border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 rounded-lg p-2">
                  <Subtitles className="text-primary h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t('downloadSubtitles')}</p>
                  <p className="text-muted-foreground text-sm">{t('includeSubtitleFiles')}</p>
                </div>
              </div>
              <Switch
                checked={downloadOptions.downloadSubtitles}
                onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, downloadSubtitles: checked }))}
              />
            </div>

            <div className="bg-muted/20 hover:bg-muted/30 flex items-center justify-between rounded-xl border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 rounded-lg p-2">
                  <ImageIcon className="text-primary h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t('downloadThumbnail')}</p>
                  <p className="text-muted-foreground text-sm">{t('saveVideoThumbnail')}</p>
                </div>
              </div>
              <Switch
                checked={downloadOptions.downloadThumbnail}
                onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, downloadThumbnail: checked }))}
              />
            </div>

            <div className="bg-muted/20 hover:bg-muted/30 flex items-center justify-between rounded-xl border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 rounded-lg p-2">
                  <Info className="text-primary h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{t('saveMetadata')}</p>
                  <p className="text-muted-foreground text-sm">{t('includeVideoInformation')}</p>
                </div>
              </div>
              <Switch
                checked={downloadOptions.saveMetadata}
                onCheckedChange={checked => setDownloadOptions(prev => ({ ...prev, saveMetadata: checked }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Download Progress */}
      {downloadProgress && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Download className="text-primary h-5 w-5 animate-pulse" />
              </div>
              {t('downloadProgress')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{t('progress')}</span>
                <span className="font-mono text-lg">{downloadProgress.progress}%</span>
              </div>
              <Progress value={downloadProgress.progress} className="h-3" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-muted-foreground mb-1 text-sm">{t('speed')}</p>
                <p className="text-lg font-semibold">{downloadProgress.speed}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-muted-foreground mb-1 text-sm">{t('eta')}</p>
                <p className="text-lg font-semibold">{downloadProgress.eta}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 text-center">
                <p className="text-muted-foreground mb-1 text-sm">{t('size')}</p>
                <p className="text-lg font-semibold">{downloadProgress.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col justify-end gap-4 sm:flex-row">
        <Button variant="outline" onClick={onReset} disabled={isDownloading} className="h-12 px-8">
          <X className="mr-2 h-4 w-4" />
          {t('reset')}
        </Button>
        <Button
          onClick={handleDownload}
          disabled={isDownloading}
          className="h-12 gap-3 px-8 text-lg font-semibold"
          size="lg"
        >
          <Download className="h-5 w-5" />
          {isDownloading ? t('downloading') : isTrimmed ? t('downloadClip') : t('downloadVideo')}
        </Button>
      </div>
    </div>
  )
}

export default VideoPreviewCard
