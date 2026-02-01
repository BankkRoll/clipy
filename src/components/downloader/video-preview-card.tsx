import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileVideo,
  Image as ImageIcon,
  Info,
  Play,
  Scissors,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  X,
  Zap,
} from 'lucide-react'
import type { DownloadProgress, DownloadOptions as GlobalDownloadOptions, VideoInfo } from '@/types/download'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useRef, useState } from 'react'

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useNavigate } from '@tanstack/react-router'
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
  const videoRef = useRef<HTMLVideoElement>(null)

  const [trimRange, setTrimRange] = useState<[number, number]>([0, videoInfo.duration])
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [processedVideoId, setProcessedVideoId] = useState<string | null>(null)

  const isTrimmed = trimRange[0] > 0 || trimRange[1] < videoInfo.duration

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
    quality: 'best',
    format: 'mp4',
    downloadSubtitles: true,
    downloadThumbnail: true,
    saveMetadata: true,
    createSubdirectories: true,
  })

  // Load user defaults and generate preview when video changes
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
            format: userDefaultFormat as 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus',
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
    generatePreviewClip()
  }, [videoInfo.id])

  const generatePreviewClip = async () => {
    console.log('[PREVIEW] generatePreviewClip called', {
      hasPreviewUrl: !!previewVideoUrl,
      isGenerating: isGeneratingPreview,
      videoId: videoInfo.id,
    })
    if (previewVideoUrl || isGeneratingPreview) {
      console.log('[PREVIEW] Skipping preview generation - already have URL or generating')
      return
    }

    setIsGeneratingPreview(true)
    try {
      // Download the full video for preview/trimming
      const previewOptions: GlobalDownloadOptions = {
        // Don't specify quality - let yt-dlp choose best available for preview
        downloadSubtitles: false,
        downloadThumbnail: false,
        saveMetadata: false,
        createSubdirectories: false,
        // Mark as preview to distinguish from user downloads
        provider: 'auto', // This helps identify it as a preview
      }

      const response = await window.electronAPI.downloadManager.start(
        `https://www.youtube.com/watch?v=${videoInfo.id}`,
        previewOptions,
      )

      if (response.success) {
        const startTime = Date.now()
        // Wait for the preview download to complete
        const checkProgress = () => {
          window.electronAPI.downloadManager.getProgress(response.data.downloadId).then(progressResponse => {
            if (progressResponse.success) {
              const progress = progressResponse.data
              // Handle both single progress and array responses
              const progressData = Array.isArray(progress) ? progress[0] : progress
              if (progressData?.status === 'completed' && progressData.filePath) {
                // Convert file path to blob URL for video element
                window.electronAPI.fileSystem.read(progressData.filePath).then(fileResponse => {
                  if (fileResponse.success && fileResponse.data) {
                    const blob = new Blob([fileResponse.data], { type: 'video/mp4' })
                    const url = URL.createObjectURL(blob)
                    setPreviewVideoUrl(url)
                  }
                })
              } else if (progressData?.status === 'failed') {
                console.error('Preview download failed:', progressData.error)
                setIsGeneratingPreview(false)
                // Show error to user
                alert('Failed to generate video preview. Please try again.')
              } else if (Date.now() - startTime > 30000) {
                // 30 second timeout
                console.error('Preview download timed out')
                setIsGeneratingPreview(false)
                alert('Preview generation timed out. The video might be too large or there was a network issue.')
              } else {
                // Check again in 1 second
                setTimeout(checkProgress, 1000)
              }
            }
          })
        }
        setTimeout(checkProgress, 1000)
      }
    } catch (error) {
      console.error('Failed to generate preview:', error)
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
    }
  }

  const seekToStart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[0]
      setCurrentTime(trimRange[0])
    }
  }

  const seekToEnd = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = trimRange[1]
      setCurrentTime(trimRange[1])
    }
  }

  const handleTrimRangeChange = (newRange: [number, number]) => {
    setTrimRange(newRange)
    if (currentTime < newRange[0] || currentTime > newRange[1]) {
      if (videoRef.current) {
        videoRef.current.currentTime = newRange[0]
        setCurrentTime(newRange[0])
      }
    }
  }

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

  const handleDownload = async () => {
    setIsDownloading(true)
    setDownloadProgress(null)

    const options = {
      ...downloadOptions,
      startTime: isTrimmed ? trimRange[0] : undefined,
      endTime: isTrimmed ? trimRange[1] : undefined,
    }

    onDownload(options)
    toast.success(t('msgDownloadStarted'))
  }

  const getEstimatedFileSize = () => {
    const duration = isTrimmed ? trimRange[1] - trimRange[0] : videoInfo.duration
    const qualityMultiplier = {
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

    const multiplier = qualityMultiplier[downloadOptions.quality as keyof typeof qualityMultiplier] || 15
    const estimatedBytes = duration * multiplier * 1024 * 1024
    return formatFileSize(estimatedBytes)
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-8 p-6">
      <Card className="overflow-hidden border-0 p-0 shadow-xl">
        <div className="relative">
          <AspectRatio ratio={16 / 9} className="bg-background">
            {previewVideoUrl ? (
              <video
                ref={videoRef}
                src={previewVideoUrl}
                className="h-full w-full object-cover"
                poster={videoInfo.thumbnails.at(-1)?.url}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    videoRef.current.currentTime = trimRange[0]
                  }
                }}
                controls
              />
            ) : (
              <div className="bg-background text-foreground flex h-full w-full items-center justify-center">
                <div className="max-w-md px-6 text-center">
                  {isGeneratingPreview ? (
                    <>
                      <div className="border-primary mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-t-transparent" />
                      <p className="mb-2 text-lg font-medium">Generating Preview...</p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        Downloading full video for preview and trimming
                      </p>
                    </>
                  ) : (
                    <>
                      <FileVideo className="text-muted-foreground mx-auto mb-4 h-16 w-16" />
                      <p className="mb-2 text-lg font-medium">Preview Unavailable</p>
                      <p className="text-muted-foreground text-sm leading-relaxed">
                        Unable to generate video preview at this time
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="from-background/80 via-background/20 to-background/40 absolute inset-0 bg-gradient-to-t opacity-0 transition-opacity duration-300 hover:opacity-100">
              <div className="from-background/60 absolute top-0 right-0 left-0 bg-gradient-to-b to-transparent p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-foreground mb-2 line-clamp-2 text-lg leading-tight font-semibold">
                      {videoInfo.title}
                    </h2>
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar className="ring-foreground/20 h-8 w-8 ring-2">
                        <AvatarImage src={videoInfo.channel.thumbnail} alt={videoInfo.channel.name} />
                        <AvatarFallback className="text-background text-sm font-semibold">
                          {videoInfo.channel.name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">{videoInfo.channel.name}</span>
                        {videoInfo.channel.verified && <CheckCircle2 className="text-foreground h-4 w-4" />}
                      </div>
                    </div>
                    <div className="text-foreground/80 flex items-center gap-4 text-sm">
                      <span>{videoInfo.viewsFormatted} views</span>
                      <span>•</span>
                      <span>{videoInfo.uploadDate}</span>
                      {isTrimmed && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-medium">
                            {t('clipLabel')}: {formatTime(trimRange[1] - trimRange[0])}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/20 hover:bg-background/30 h-12 w-12 rounded-full border-0 backdrop-blur-sm"
                    onClick={seekToStart}
                  >
                    <SkipBack className="text-foreground h-6 w-6" />
                  </Button>

                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/20 hover:bg-background/30 h-16 w-16 rounded-full border-0 backdrop-blur-sm"
                    onClick={() => toast.info(t('videoPreviewNotAvailable'))}
                  >
                    <Play className="text-foreground h-8 w-8" fill="currentColor" />
                  </Button>

                  <Button
                    variant="secondary"
                    size="icon"
                    className="bg-background/20 hover:bg-background/30 h-12 w-12 rounded-full border-0 backdrop-blur-sm"
                    onClick={seekToEnd}
                  >
                    <SkipForward className="text-foreground h-6 w-6" />
                  </Button>
                </div>
              </div>

              <div className="from-background/60 absolute right-0 bottom-0 left-0 bg-gradient-to-t to-transparent p-4">
                <div className="flex items-center gap-4">
                  <div className="text-foreground/90 flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    <span className="font-mono">
                      {formatTime(currentTime)} / {formatTime(videoInfo.duration)}
                    </span>
                  </div>
                  <div className="flex-1" />
                  <div className="text-foreground/80 flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      <span>{videoInfo.viewsFormatted}</span>
                    </div>
                    {videoInfo.isLive && (
                      <Badge variant="destructive" className="animate-pulse text-xs">
                        {t('liveBadge')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {videoInfo.isLive && (
              <div className="absolute right-4 bottom-4">
                <Badge variant="destructive" className="animate-pulse">
                  {t('liveBadge')}
                </Badge>
              </div>
            )}
          </AspectRatio>

          <div className="bg-muted/30 border-t p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Scissors className="text-primary h-5 w-5" />
                  <Label className="text-base font-semibold">{t('trimVideo')}</Label>
                </div>
                <div className="bg-background flex items-center gap-2 rounded-lg border px-3 py-1 font-mono text-sm">
                  <span className="text-primary font-semibold">{formatTime(trimRange[0])}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-primary font-semibold">{formatTime(trimRange[1])}</span>
                </div>
              </div>

              <div className="relative">
                <Slider
                  value={trimRange}
                  onValueChange={handleTrimRangeChange}
                  max={videoInfo.duration}
                  step={1}
                  className="w-full"
                />
                <div
                  className="bg-primary pointer-events-none absolute top-0 h-6 w-1 -translate-x-1/2 transform rounded-full"
                  style={{
                    left: `${(currentTime / videoInfo.duration) * 100}%`,
                    top: '-2px',
                  }}
                />
                <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                  <span>0:00</span>
                  <span className="text-primary font-medium">{formatTime(currentTime)}</span>
                  <span>{formatTime(videoInfo.duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTrimRange([0, videoInfo.duration])}
                  disabled={!isTrimmed}
                >
                  {t('resetTrim')}
                </Button>
                <Button variant="outline" size="sm" onClick={seekToStart}>
                  {t('goToStart')}
                </Button>
                <Button variant="outline" size="sm" onClick={seekToEnd}>
                  {t('goToEnd')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <Card className="bg-muted/30 border-0 shadow-lg">
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
                onValueChange={(format: 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus') =>
                  setDownloadOptions(prev => ({ ...prev, format }))
                }
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

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <div className="bg-primary/10 rounded-lg p-2">
                <Download className="text-primary h-5 w-5" />
              </div>
              {t('downloadOptions')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Download Options */}
            <div className="space-y-4">
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
            </div>
          </CardContent>
        </Card>
      </div>

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
