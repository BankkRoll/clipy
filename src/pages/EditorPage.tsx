/**
 * EditorPage - Video editor page for trimming and exporting clips
 * Integrates VideoEditor component with enhanced export functionality
 */

import { AlertCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { EditorHeader } from '@/components/editor/editor-header'
import type { EditorSearchParams } from '@/routes/routes'
import { ExportDialog, type ExportSettings, type ExportState } from '@/components/editor/export-dialog'
import { VideoEditor } from '@/components/editor/video-editor'
import type { VideoInfo } from '@/types/download'
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

// Default export settings
const defaultExportSettings: ExportSettings = {
  quality: 'high',
  codec: 'copy',
  format: 'mp4',
  crf: 20,
  preset: 'medium',
  audioBitrate: 192,
  audioCodec: 'copy',
  resolution: 'source',
  fps: 'source',
  preserveMetadata: true,
  twoPassEncoding: false,
}

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
  const [error, setError] = useState<string | null>(null)
  const [videoTitle, setVideoTitle] = useState<string | null>(null)
  const [isStreamingMode, setIsStreamingMode] = useState(false) // True when streaming from URL
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null) // Full video info for streaming

  // Export state
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [exportProgress, setExportProgress] = useState(0)
  const [exportedFilePath, setExportedFilePath] = useState<string | null>(null)
  const [exportSettings, setExportSettings] = useState<ExportSettings>(defaultExportSettings)

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
    setError(null)
    setIsStreamingMode(true)

    try {
      // Get video info with streaming URL
      const response = await window.electronAPI.downloadManager.getStreamingInfo(url)

      if (!isSuccessResponse(response)) {
        throw new Error(response.error || 'Failed to get video info')
      }

      const { videoInfo: info, streamingUrl } = response.data

      if (!streamingUrl) {
        throw new Error('No streaming URL available for this video. It may require authentication.')
      }

      setVideoTitle(info.title)
      setVideoInfo(info) // Store full video info for header hover card

      // Create metadata from video info
      const videoMetadata: VideoMetadata = {
        duration: info.duration,
        width: info.bestVideoFormat?.width || 1920,
        height: info.bestVideoFormat?.height || 1080,
        bitrate: info.bestVideoFormat?.bitrate || 0,
        codec: info.bestVideoFormat?.videoCodec || 'unknown',
        size: 0, // Unknown for streaming
        fps: info.bestVideoFormat?.fps || 30,
      }
      setMetadata(videoMetadata)

      // Initialize timeline with duration
      initializeForVideo(info.duration, url)

      // Use streaming URL directly for video playback
      setVideoUrl(streamingUrl)

      // Use thumbnails from video info
      if (info.thumbnails.length > 0) {
        const thumbUrls = info.thumbnails.map((t: { url: string }) => t.url)
        setThumbnails(thumbUrls)
        // Use a single thumbnail for timeline since we don't have local thumbnails
        setTimelineThumbnails(thumbUrls, info.duration / thumbUrls.length)
      }

      toast.success(`Loaded: ${info.title}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load video from URL'
      setError(message)
      toast.error(message)
    }
  }

  /**
   * Load video file and extract metadata
   */
  const loadVideo = async (path: string) => {
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

        // Map quality settings
        const qualityMap: Record<string, string> = {
          source: 'best',
          high: '1080p',
          medium: '720p',
          low: '480p',
          custom: '720p',
        }

        // Map format - 'mov' is not supported for download, fallback to mp4
        const formatMap: Record<string, 'mp4' | 'webm' | 'mkv'> = {
          mp4: 'mp4',
          webm: 'webm',
          mkv: 'mkv',
          mov: 'mp4', // MOV fallback to MP4 for downloads
        }

        const downloadResponse = await window.electronAPI.downloadManager.start(sourceUrl, {
          quality: qualityMap[exportSettings.quality] || '720p',
          format: formatMap[exportSettings.format] || 'mp4',
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
          title: 'Export Video',
          defaultPath: generateExportFilename(filePath),
          filters: [
            { name: 'MP4 Video', extensions: ['mp4'] },
            { name: 'WebM Video', extensions: ['webm'] },
            { name: 'MKV Video', extensions: ['mkv'] },
            { name: 'MOV Video', extensions: ['mov'] },
          ],
        })

        if (!isSuccessResponse(saveResult) || saveResult.data.canceled || !saveResult.data.filePath) {
          setExportState('idle')
          return
        }

        const outputPath = saveResult.data.filePath

        setExportState('exporting')
        setExportProgress(10)

        // Map export settings to video processor options
        const trimOptions: any = {
          inputPath: filePath,
          outputPath: outputPath,
          startTime: isTrimmed ? trimStart : 0,
          endTime: isTrimmed ? trimEnd : duration,
        }

        // Add codec settings
        if (exportSettings.codec !== 'copy') {
          trimOptions.quality = exportSettings.quality === 'source' ? 'high' : exportSettings.quality
          trimOptions.codec = exportSettings.codec
          trimOptions.crf = exportSettings.crf
          trimOptions.preset = exportSettings.preset

          // Resolution
          if (exportSettings.resolution !== 'source' && metadata) {
            const resHeights: Record<string, number> = {
              '2160p': 2160,
              '1440p': 1440,
              '1080p': 1080,
              '720p': 720,
              '480p': 480,
              '360p': 360,
            }
            trimOptions.height = resHeights[exportSettings.resolution]
          }

          // FPS
          if (exportSettings.fps !== 'source') {
            trimOptions.fps = parseInt(exportSettings.fps)
          }

          // Audio
          if (exportSettings.audioCodec !== 'copy') {
            trimOptions.audioCodec = exportSettings.audioCodec
            trimOptions.audioBitrate = exportSettings.audioBitrate
          }

          // Two-pass encoding
          if (exportSettings.twoPassEncoding) {
            trimOptions.twoPass = true
          }
        } else {
          trimOptions.codec = 'copy'
        }

        // Preserve metadata
        if (exportSettings.preserveMetadata) {
          trimOptions.preserveMetadata = true
        }

        const trimResponse = await window.electronAPI.videoProcessor.trim(trimOptions)

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
    const ext = `.${exportSettings.format}`

    if (inputPath) {
      const parts = inputPath.split(/[/\\]/)
      const filename = parts[parts.length - 1]
      name = filename.replace(/\.[^.]+$/, '')
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
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  // Get the title to display
  const displayTitle = isStreamingMode ? videoTitle || 'Loading...' : filePath?.split(/[/\\]/).pop() || 'Unknown'

  // Get thumbnail URL for export dialog
  const thumbnailUrl = thumbnails[0] || videoInfo?.thumbnails?.[0]?.url || null

  return (
    <div className="flex h-full flex-col">
      {/* Header with hover card */}
      <div className="container mx-auto w-full px-4 pt-4">
        <EditorHeader
          title={displayTitle}
          isStreamingMode={isStreamingMode}
          isTrimmed={isTrimmed}
          trimDuration={formatTime(trimEnd - trimStart)}
          videoUrl={videoUrl}
          onExport={() => setShowExportDialog(true)}
          metadata={metadata}
          filePath={filePath}
          videoInfo={videoInfo}
        />
      </div>

      {/* Video Editor - fills remaining space */}
      <div className="container mx-auto min-h-0 w-full flex-1 px-4 py-4">
        {error ? (
          <div className="flex h-full items-center justify-center">
            <Card className="max-w-md">
              <CardContent className="space-y-4 pt-6 text-center">
                <AlertCircle className="text-destructive mx-auto h-10 w-10" />
                <p className="text-muted-foreground">{error}</p>
                <Button variant="outline" onClick={() => navigate({ to: '/' })}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : videoUrl ? (
          <VideoEditor
            videoUrl={videoUrl}
            duration={metadata?.duration}
            thumbnails={thumbnails}
            className="h-full w-full"
            isExternalUrl={isStreamingMode}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="text-primary h-8 w-8 animate-spin" />
          </div>
        )}
      </div>

      {/* Export Dialog */}
      <ExportDialog
        open={showExportDialog}
        onOpenChange={setShowExportDialog}
        exportState={exportState}
        exportProgress={exportProgress}
        exportSettings={exportSettings}
        onSettingsChange={setExportSettings}
        isTrimmed={isTrimmed}
        trimStart={trimStart}
        trimEnd={trimEnd}
        duration={duration}
        isStreamingMode={isStreamingMode}
        videoTitle={videoTitle}
        filePath={filePath}
        exportedFilePath={exportedFilePath}
        onExport={handleExport}
        onReset={resetExport}
        onOpenExportedFile={openExportedFile}
        metadata={metadata}
        videoInfo={videoInfo}
        thumbnailUrl={thumbnailUrl}
      />
    </div>
  )
}
