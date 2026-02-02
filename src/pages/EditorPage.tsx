/**
 * EditorPage - Video editor page for trimming and exporting clips
 * Integrates VideoEditor component with export functionality
 */

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  FileVideo,
  FolderOpen,
  HardDrive,
  Loader2,
  RotateCcw,
  Scissors,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { EditorSearchParams } from '@/routes/routes'
import { Progress } from '@/components/ui/progress'
import { VideoEditor } from '@/components/editor/video-editor'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTimelineStore } from '@/stores/timeline-store'

interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

interface ExportSettings {
  quality: 'low' | 'medium' | 'high'
  codec: 'copy' | 'h264' | 'h265'
}

type ExportState = 'idle' | 'preparing' | 'exporting' | 'completed' | 'failed'

export default function EditorPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/editor' }) as EditorSearchParams

  // Get parameters from URL - can be file path OR streaming URL
  const filePath = search?.path
  const sourceUrl = search?.url // YouTube URL for live streaming

  // State
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [thumbnails, setThumbnails] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoTitle, setVideoTitle] = useState<string | null>(null)
  const [isStreamingMode, setIsStreamingMode] = useState(false) // True when streaming from URL

  // Export state
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null)
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    quality: 'high',
    codec: 'copy',
  })

  // Timeline store
  const {
    trimStart,
    trimEnd,
    isTrimmed,
    duration,
    initializeForVideo,
    setWaveformData,
    setThumbnails: setTimelineThumbnails,
    reset: resetTimeline,
  } = useTimelineStore()

  // Load video on mount - either from local file OR streaming URL
  useEffect(() => {
    // Priority: URL streaming > local file
    if (sourceUrl) {
      loadFromUrl(sourceUrl)
    } else if (filePath) {
      loadVideo(filePath)
    } else {
      setError('No video source specified')
      setIsLoading(false)
    }

    return () => {
      // Cleanup blob URL on unmount (only for local files)
      if (videoUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(videoUrl)
      }
      resetTimeline()
    }
  }, [filePath, sourceUrl])

  /**
   * Load video from YouTube URL for live streaming preview
   */
  const loadFromUrl = async (url: string) => {
    setIsLoading(true)
    setError(null)
    setIsStreamingMode(true)

    try {
      // Get video info with streaming URL
      const response = await window.electronAPI.downloadManager.getStreamingInfo(url)

      if (!isSuccessResponse(response)) {
        throw new Error(response.error || 'Failed to get video info')
      }

      const { videoInfo, streamingUrl } = response.data

      if (!streamingUrl) {
        throw new Error('No streaming URL available for this video. It may require authentication.')
      }

      setVideoTitle(videoInfo.title)

      // Create metadata from video info
      const videoMetadata: VideoMetadata = {
        duration: videoInfo.duration,
        width: videoInfo.bestVideoFormat?.width || 1920,
        height: videoInfo.bestVideoFormat?.height || 1080,
        bitrate: videoInfo.bestVideoFormat?.bitrate || 0,
        codec: videoInfo.bestVideoFormat?.videoCodec || 'unknown',
        size: 0, // Unknown for streaming
        fps: videoInfo.bestVideoFormat?.fps || 30,
      }
      setMetadata(videoMetadata)

      // Initialize timeline with duration
      initializeForVideo(videoInfo.duration, url)

      // Use streaming URL directly for video playback
      setVideoUrl(streamingUrl)

      // Use thumbnails from video info
      if (videoInfo.thumbnails.length > 0) {
        const thumbUrls = videoInfo.thumbnails.map((t: { url: string }) => t.url)
        setThumbnails(thumbUrls)
        // Use a single thumbnail for timeline since we don't have local thumbnails
        setTimelineThumbnails(thumbUrls, videoInfo.duration / thumbUrls.length)
      }

      toast.success(`Loaded: ${videoInfo.title}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load video from URL'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Load video file and extract metadata
   */
  const loadVideo = async (path: string) => {
    setIsLoading(true)
    setError(null)

    try {
      // Check if file exists
      const exists = await window.electronAPI.fileSystem.exists(path)
      if (!exists) {
        throw new Error('Video file not found')
      }

      // Get video metadata
      const metadataResponse = await window.electronAPI.videoProcessor.getInfo(path)
      if (!isSuccessResponse(metadataResponse)) {
        throw new Error(metadataResponse.error || 'Failed to get video metadata')
      }
      setMetadata(metadataResponse.data)

      // Initialize timeline with duration
      initializeForVideo(metadataResponse.data.duration, path)

      // Use clipy-file:// protocol for efficient video streaming from disk
      // This avoids loading the entire video into memory
      const normalizedPath = path.replace(/\\/g, '/')
      const videoFileUrl = /^[a-zA-Z]:\//.test(normalizedPath)
        ? `clipy-file:///${normalizedPath}`
        : `clipy-file://${normalizedPath}`
      setVideoUrl(videoFileUrl)

      // Generate thumbnails in background
      generateThumbnails(path)

      // Extract waveform in background
      extractWaveform(path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load video'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Generate thumbnail strip for timeline
   */
  const generateThumbnails = async (path: string) => {
    try {
      const response = await window.electronAPI.videoProcessor.getThumbnails({
        inputPath: path,
        count: 20,
        width: 160,
      })

      if (isSuccessResponse(response) && response.data.thumbnails) {
        // Convert file paths to clipy-file:// URLs (custom protocol for safe local file access)
        const thumbUrls = response.data.thumbnails.map((p: string) => {
          // On Windows, convert backslashes to forward slashes for URLs
          const normalizedPath = p.replace(/\\/g, '/')
          // Handle drive letter (e.g., C:/) on Windows
          if (/^[a-zA-Z]:\//.test(normalizedPath)) {
            return `clipy-file:///${normalizedPath}`
          }
          return `clipy-file://${normalizedPath}`
        })
        setThumbnails(thumbUrls)
        setTimelineThumbnails(thumbUrls, response.data.interval)
      }
    } catch (err) {
      console.warn('Failed to generate thumbnails:', err)
    }
  }

  /**
   * Extract audio waveform for timeline
   */
  const extractWaveform = async (path: string) => {
    try {
      const response = await window.electronAPI.videoProcessor.getWaveform({
        inputPath: path,
        samples: 500,
      })

      if (isSuccessResponse(response) && response.data.waveform) {
        setWaveformData(response.data.waveform)
      }
    } catch (err) {
      console.warn('Failed to extract waveform:', err)
    }
  }

  /**
   * Handle export - works for both local files and streaming URLs
   */
  const handleExport = async () => {
    if (!filePath && !sourceUrl) return

    setExportState('preparing')
    setExportProgress(0)

    try {
      if (isStreamingMode && sourceUrl) {
        // Streaming mode: Download from URL with time range
        setExportState('exporting')
        setExportProgress(10)

        const downloadResponse = await window.electronAPI.downloadManager.start(sourceUrl, {
          quality: exportSettings.quality === 'high' ? '720p' : exportSettings.quality === 'medium' ? '480p' : '360p',
          format: 'mp4',
          startTime: isTrimmed ? trimStart : undefined,
          endTime: isTrimmed ? trimEnd : undefined,
          downloadThumbnail: true,
        })

        if (!isSuccessResponse(downloadResponse)) {
          throw new Error(downloadResponse.error || 'Download failed')
        }

        setExportProgress(50)

        toast.success('Download started! Check the Library for progress.')
        setExportState('completed')
        setExportedFilePath(null) // Will be in library when done

        // Navigate to library to see progress
        setTimeout(() => {
          navigate({ to: '/library' })
        }, 1500)
      } else if (filePath) {
        // Local file mode: Use video processor to trim
        const saveResult = await window.electronAPI.system.saveDialog({
          title: 'Export Trimmed Video',
          defaultPath: generateExportFilename(filePath),
          filters: [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'WebM Video', extensions: ['webm'] },
            { name: 'MKV Video', extensions: ['mkv'] },
          ],
        })

        if (!isSuccessResponse(saveResult) || saveResult.data.canceled || !saveResult.data.filePath) {
          setExportState('idle')
          return
        }

        const outputPath = saveResult.data.filePath

        setExportState('exporting')
        setExportProgress(10)

        const trimResponse = await window.electronAPI.videoProcessor.trim({
          inputPath: filePath,
          outputPath: outputPath,
          startTime: isTrimmed ? trimStart : 0,
          endTime: isTrimmed ? trimEnd : duration,
          quality: exportSettings.quality,
          codec: exportSettings.codec,
        })

        setExportProgress(90)

        if (!isSuccessResponse(trimResponse)) {
          throw new Error(trimResponse.error || 'Export failed')
        }

        setExportProgress(100)
        setExportState('completed')
        setExportedFilePath(trimResponse.data.outputPath)

        toast.success('Video exported successfully!')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      setExportState('failed')
      toast.error(message)
    }
  }

  /**
   * Generate default export filename
   */
  const generateExportFilename = (inputPath?: string): string => {
    let name = 'video'
    let ext = '.mp4'

    if (inputPath) {
      const parts = inputPath.split(/[/\\]/)
      const filename = parts[parts.length - 1]
      name = filename.replace(/\.[^.]+$/, '')
      ext = filename.match(/\.[^.]+$/)?.[0] || '.mp4'
    } else if (videoTitle) {
      // Use video title for streaming mode
      name = videoTitle
        .replace(/[<>:"/\\|?*]/g, '')
        .trim()
        .substring(0, 100)
    }

    if (isTrimmed) {
      const startStr = formatTime(trimStart).replace(/:/g, '-')
      const endStr = formatTime(trimEnd).replace(/:/g, '-')
      return `${name}_clip_${startStr}_to_${endStr}${ext}`
    }

    return `${name}_export${ext}`
  }

  /**
   * Format time for display
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * Format file size
   */
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  /**
   * Open exported file location
   */
  const openExportedFile = () => {
    if (exportedFilePath) {
      window.electronAPI.shell.showItemInFolder(exportedFilePath)
    }
  }

  /**
   * Reset export state for another export
   */
  const resetExport = () => {
    setExportState('idle')
    setExportProgress(0)
    setExportedFilePath(null)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4 text-center">
          <Loader2 className="text-primary mx-auto h-12 w-12 animate-spin" />
          <p className="text-muted-foreground">Loading video...</p>
        </div>
      </div>
    )
  }

  // Error state - only show if we have no source at all
  if (error || (!filePath && !sourceUrl)) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="space-y-4 pt-6 text-center">
            <AlertCircle className="text-destructive mx-auto h-12 w-12" />
            <h2 className="text-xl font-semibold">Failed to Load Video</h2>
            <p className="text-muted-foreground">{error || 'No video source specified'}</p>
            <Button onClick={() => navigate({ to: '/library' })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Library
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/library' })}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-muted-foreground max-w-md truncate text-sm">
              {isStreamingMode ? videoTitle || 'Loading...' : filePath?.split(/[/\\]/).pop() || 'Unknown'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isTrimmed && (
            <Badge variant="secondary" className="gap-1">
              <Scissors className="h-3 w-3" />
              Trimmed: {formatTime(trimEnd - trimStart)}
            </Badge>
          )}
          <Button onClick={() => setShowExportDialog(true)} disabled={!videoUrl}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Video Metadata Bar */}
      {metadata && (
        <div className="text-muted-foreground flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1">
            <FileVideo className="h-4 w-4" />
            <span>
              {metadata.width}x{metadata.height}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>{formatTime(metadata.duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="h-4 w-4" />
            <span>{formatSize(metadata.size)}</span>
          </div>
          <Badge variant="outline">{metadata.codec.toUpperCase()}</Badge>
          <Badge variant="outline">{metadata.fps.toFixed(0)} FPS</Badge>
        </div>
      )}

      {/* Video Editor */}
      {videoUrl && (
        <VideoEditor
          videoUrl={videoUrl}
          duration={metadata?.duration}
          thumbnails={thumbnails}
          className="w-full"
          isExternalUrl={isStreamingMode}
        />
      )}

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Video</DialogTitle>
            <DialogDescription>
              {isTrimmed
                ? `Export trimmed clip (${formatTime(trimStart)} - ${formatTime(trimEnd)})`
                : 'Export full video'}
            </DialogDescription>
          </DialogHeader>

          {exportState === 'idle' && (
            <div className="space-y-4 py-4">
              {/* Quality Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Quality</label>
                <Select
                  value={exportSettings.quality}
                  onValueChange={v => setExportSettings(s => ({ ...s, quality: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High (Larger file)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="low">Low (Smaller file)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Codec Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Processing</label>
                <Select
                  value={exportSettings.codec}
                  onValueChange={v => setExportSettings(s => ({ ...s, codec: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy">Fast (Copy streams)</SelectItem>
                    <SelectItem value="h264">Re-encode (H.264)</SelectItem>
                    <SelectItem value="h265">Re-encode (H.265/HEVC)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  {exportSettings.codec === 'copy'
                    ? 'Fastest option, preserves original quality'
                    : 'Slower but allows quality adjustments'}
                </p>
              </div>

              {/* Export Info */}
              <div className="bg-muted space-y-1 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Duration:</span>
                  <span>{formatTime(isTrimmed ? trimEnd - trimStart : duration)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Source:</span>
                  <span className="max-w-[200px] truncate">
                    {isStreamingMode ? videoTitle : filePath?.split(/[/\\]/).pop() || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {(exportState === 'preparing' || exportState === 'exporting') && (
            <div className="space-y-4 py-8">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="text-primary h-10 w-10 animate-spin" />
                <p className="text-muted-foreground text-sm">
                  {exportState === 'preparing' ? 'Preparing export...' : 'Exporting video...'}
                </p>
              </div>
              <Progress value={exportProgress} className="w-full" />
            </div>
          )}

          {exportState === 'completed' && (
            <div className="space-y-4 py-8">
              <div className="flex flex-col items-center gap-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
                <div className="text-center">
                  <p className="font-medium">Export Complete!</p>
                  <p className="text-muted-foreground max-w-[300px] truncate text-sm">
                    {exportedFilePath?.split(/[/\\]/).pop()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {exportState === 'failed' && (
            <div className="space-y-4 py-8">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="text-destructive h-12 w-12" />
                <p className="text-muted-foreground text-sm">Export failed. Please try again.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            {exportState === 'idle' && (
              <>
                <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </>
            )}

            {exportState === 'completed' && (
              <>
                <Button variant="outline" onClick={resetExport}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Export Another
                </Button>
                <Button onClick={openExportedFile}>
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Show in Folder
                </Button>
              </>
            )}

            {exportState === 'failed' && (
              <>
                <Button variant="outline" onClick={() => setShowExportDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={resetExport}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
