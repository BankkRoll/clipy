/**
 * ExportDialog - Clean, production-ready export dialog
 * Unified settings panel with dynamic file size estimation
 */

import { AlertCircle, CheckCircle, Download, FolderOpen, RotateCcw, Scissors, Video } from 'lucide-react'
import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { VideoInfo } from '@/types/download'

export type ExportState = 'idle' | 'preparing' | 'exporting' | 'completed' | 'failed'

export type ExportQuality = 'source' | 'high' | 'medium' | 'low' | 'custom'
export type ExportCodec = 'copy' | 'h264' | 'h265' | 'vp9' | 'av1'
export type ExportFormat = 'mp4' | 'webm' | 'mkv' | 'mov'

export interface ExportSettings {
  quality: ExportQuality
  codec: ExportCodec
  format: ExportFormat
  crf: number
  preset: 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium' | 'slow' | 'slower' | 'veryslow'
  audioBitrate: number
  audioCodec: 'copy' | 'aac' | 'opus' | 'mp3'
  resolution: 'source' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p'
  fps: 'source' | '60' | '30' | '24'
  preserveMetadata: boolean
  twoPassEncoding: boolean
}

interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  exportState: ExportState
  exportProgress: number
  exportSettings: ExportSettings
  onSettingsChange: (settings: ExportSettings) => void
  isTrimmed: boolean
  trimStart: number
  trimEnd: number
  duration: number
  isStreamingMode: boolean
  videoTitle: string | null
  filePath?: string
  exportedFilePath: string | null
  onExport: () => void
  onReset: () => void
  onOpenExportedFile: () => void
  metadata?: VideoMetadata | null
  videoInfo?: VideoInfo | null
  thumbnailUrl?: string | null
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

// ============================================================================
// FILE SIZE ESTIMATION ENGINE
// ============================================================================

const BITRATE_BY_RESOLUTION: Record<number, number> = {
  2160: 45_000_000,
  1440: 20_000_000,
  1080: 10_000_000,
  720: 6_500_000,
  480: 3_000_000,
  360: 1_500_000,
}

const getBitrateForResolution = (height: number): number => {
  if (height >= 2160) return BITRATE_BY_RESOLUTION[2160]
  if (height >= 1440) return BITRATE_BY_RESOLUTION[1440]
  if (height >= 1080) return BITRATE_BY_RESOLUTION[1080]
  if (height >= 720) return BITRATE_BY_RESOLUTION[720]
  if (height >= 480) return BITRATE_BY_RESOLUTION[480]
  return BITRATE_BY_RESOLUTION[360]
}

const getOutputHeight = (resolution: string, sourceHeight: number): number => {
  const heights: Record<string, number> = {
    '2160p': 2160,
    '1440p': 1440,
    '1080p': 1080,
    '720p': 720,
    '480p': 480,
    '360p': 360,
  }
  return resolution === 'source' ? sourceHeight : heights[resolution] || sourceHeight
}

const QUALITY_MULTIPLIERS: Record<ExportQuality, number> = {
  source: 1.0,
  high: 0.85,
  medium: 0.55,
  low: 0.3,
  custom: 1.0,
}

const CODEC_EFFICIENCY: Record<ExportCodec, number> = {
  copy: 1.0,
  h264: 1.0,
  h265: 0.6,
  vp9: 0.55,
  av1: 0.4,
}

const FPS_MULTIPLIERS: Record<string, number> = {
  source: 1.0,
  '60': 1.0,
  '30': 0.55,
  '24': 0.45,
}

interface EstimationResult {
  totalBytes: number
  videoBytes: number
  audioBytes: number
  videoBitrate: number
  audioBitrate: number
}

const calculateEstimate = (
  settings: ExportSettings,
  durationSeconds: number,
  sourceHeight: number,
  sourceBitrate: number,
  sourceFps: number,
): EstimationResult => {
  const outputHeight = getOutputHeight(settings.resolution, sourceHeight)

  let videoBitrate: number
  if (sourceBitrate > 0 && settings.resolution === 'source') {
    videoBitrate = sourceBitrate
  } else if (sourceBitrate > 0) {
    const ratio = Math.pow(outputHeight / sourceHeight, 2)
    videoBitrate = sourceBitrate * ratio
  } else {
    videoBitrate = getBitrateForResolution(outputHeight)
  }

  let qualityMultiplier: number
  if (settings.quality === 'custom') {
    qualityMultiplier = Math.max(0.15, 1.2 - settings.crf * 0.035)
  } else {
    qualityMultiplier = QUALITY_MULTIPLIERS[settings.quality]
  }

  const codecMultiplier = settings.codec === 'copy' ? 1.0 : CODEC_EFFICIENCY[settings.codec]
  let fpsMultiplier = FPS_MULTIPLIERS[settings.fps] || 1.0
  if (settings.fps === 'source' && sourceFps > 0) {
    fpsMultiplier = 1.0
  }
  const twoPassMultiplier = settings.twoPassEncoding ? 0.92 : 1.0

  const finalVideoBitrate =
    settings.codec === 'copy'
      ? videoBitrate
      : videoBitrate * qualityMultiplier * codecMultiplier * fpsMultiplier * twoPassMultiplier

  const audioBitrate = settings.audioCodec === 'copy' ? 192_000 : settings.audioBitrate * 1000

  const videoBytes = (finalVideoBitrate * durationSeconds) / 8
  const audioBytes = (audioBitrate * durationSeconds) / 8
  const totalBytes = videoBytes + audioBytes

  return { totalBytes, videoBytes, audioBytes, videoBitrate: finalVideoBitrate, audioBitrate }
}

// ============================================================================
// CRF SLIDER COMPONENT
// ============================================================================

interface CRFSliderProps {
  crf: number
  preset: ExportSettings['preset']
  onChange: (crf: number, preset: ExportSettings['preset'], quality: ExportQuality) => void
}

/** Get quality label from CRF value */
const getCRFLabel = (crf: number): string => {
  if (crf <= 18) return 'Lossless'
  if (crf <= 20) return 'Excellent'
  if (crf <= 23) return 'High'
  if (crf <= 26) return 'Good'
  if (crf <= 30) return 'Medium'
  return 'Low'
}

/** Get preset from CRF value (lower CRF = slower preset for better compression) */
const getPresetFromCRF = (crf: number): ExportSettings['preset'] => {
  if (crf <= 18) return 'slow'
  if (crf <= 21) return 'medium'
  if (crf <= 24) return 'fast'
  if (crf <= 27) return 'veryfast'
  return 'ultrafast'
}

/** Get quality from CRF value */
const getQualityFromCRF = (crf: number): ExportQuality => {
  if (crf <= 18) return 'source'
  if (crf <= 21) return 'high'
  if (crf <= 25) return 'medium'
  return 'low'
}

function CRFSlider({ crf, onChange }: CRFSliderProps) {
  const handleChange = (value: number[]) => {
    const newCrf = value[0]
    const preset = getPresetFromCRF(newCrf)
    const quality = getQualityFromCRF(newCrf)
    onChange(newCrf, preset, quality)
  }

  const label = getCRFLabel(crf)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">CRF (Constant Rate Factor)</Label>
        <span className="text-xs font-medium">
          {crf} · {label}
        </span>
      </div>
      <Slider value={[crf]} onValueChange={handleChange} min={16} max={32} step={1} className="w-full" />
      <div className="text-muted-foreground flex justify-between text-[10px]">
        <span>Better quality</span>
        <span>Smaller file</span>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ExportDialog({
  open,
  onOpenChange,
  exportState,
  exportProgress,
  exportSettings,
  onSettingsChange,
  isTrimmed,
  trimStart,
  trimEnd,
  duration,
  videoTitle,
  filePath,
  exportedFilePath,
  onExport,
  onReset,
  onOpenExportedFile,
  metadata,
  videoInfo,
  thumbnailUrl,
}: ExportDialogProps) {
  const clipDuration = isTrimmed ? trimEnd - trimStart : duration
  const thumbnail = thumbnailUrl || videoInfo?.thumbnails?.[videoInfo.thumbnails.length - 1]?.url

  const estimate = useMemo(() => {
    const height = metadata?.height || 1080
    const bitrate = metadata?.bitrate || 0
    const fps = metadata?.fps || 30
    return calculateEstimate(exportSettings, clipDuration, height, bitrate, fps)
  }, [metadata, clipDuration, exportSettings])

  const outputResolution = useMemo(() => {
    const sourceWidth = metadata?.width || 1920
    const sourceHeight = metadata?.height || 1080
    const outputHeight = getOutputHeight(exportSettings.resolution, sourceHeight)
    const aspectRatio = sourceWidth / sourceHeight
    const outputWidth = Math.round((outputHeight * aspectRatio) / 2) * 2
    return { width: outputWidth, height: outputHeight }
  }, [metadata, exportSettings.resolution])

  const updateSetting = <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => {
    onSettingsChange({ ...exportSettings, [key]: value })
  }

  const isReencoding = exportSettings.codec !== 'copy'

  // ============================================================================
  // RENDER: IDLE STATE (Settings)
  // ============================================================================
  const renderSettings = () => (
    <div className="space-y-4">
      {/* Video Preview */}
      <div className="flex gap-4">
        <div className="w-32 flex-shrink-0">
          <AspectRatio ratio={16 / 9} className="bg-muted overflow-hidden rounded-lg">
            {thumbnail ? (
              <img src={thumbnail} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Video className="text-muted-foreground h-8 w-8" />
              </div>
            )}
            <div className="absolute right-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {formatTime(clipDuration)}
            </div>
            {isTrimmed && (
              <Badge variant="secondary" className="absolute top-1 left-1 gap-0.5 px-1 py-0 text-[10px]">
                <Scissors className="h-2.5 w-2.5" />
              </Badge>
            )}
          </AspectRatio>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm leading-tight font-semibold">
            {videoTitle || filePath?.split(/[/\\]/).pop() || 'Video'}
          </h4>
          <p className="text-muted-foreground mt-1 text-xs">
            {metadata?.width}×{metadata?.height} · {metadata?.fps?.toFixed(0)} fps ·{' '}
            {metadata?.codec?.toUpperCase() || 'Unknown'}
          </p>
          {isTrimmed && (
            <p className="text-primary mt-1 text-xs font-medium">
              Trimmed: {formatTime(trimStart)} → {formatTime(trimEnd)}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Settings */}
      <ScrollArea className="h-[300px] pr-4">
        <div className="space-y-4">
          {/* Format & Codec */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Format</Label>
              <Select value={exportSettings.format} onValueChange={v => updateSetting('format', v as ExportFormat)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4 (H.264/H.265)</SelectItem>
                  <SelectItem value="webm">WebM (VP9/AV1)</SelectItem>
                  <SelectItem value="mkv">MKV (Universal)</SelectItem>
                  <SelectItem value="mov">MOV (Apple)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Video Codec</Label>
              <Select value={exportSettings.codec} onValueChange={v => updateSetting('codec', v as ExportCodec)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy">Copy (No Re-encode)</SelectItem>
                  <SelectItem value="h264">H.264 (Compatible)</SelectItem>
                  <SelectItem value="h265">H.265 (Efficient)</SelectItem>
                  <SelectItem value="vp9">VP9 (Web)</SelectItem>
                  <SelectItem value="av1">AV1 (Modern)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Resolution & FPS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Resolution</Label>
              <Select
                value={exportSettings.resolution}
                onValueChange={v => updateSetting('resolution', v as ExportSettings['resolution'])}
                disabled={!isReencoding}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">Original ({metadata?.height || 1080}p)</SelectItem>
                  <SelectItem value="2160p">4K (2160p){metadata?.height === 2160 && ' ← Source'}</SelectItem>
                  <SelectItem value="1440p">
                    2K (1440p){metadata?.height && metadata.height >= 1440 && metadata.height < 2160 && ' ← Source'}
                  </SelectItem>
                  <SelectItem value="1080p">Full HD (1080p){metadata?.height === 1080 && ' ← Source'}</SelectItem>
                  <SelectItem value="720p">HD (720p){metadata?.height === 720 && ' ← Source'}</SelectItem>
                  <SelectItem value="480p">SD (480p){metadata?.height === 480 && ' ← Source'}</SelectItem>
                  <SelectItem value="360p">
                    Low (360p){metadata?.height && metadata.height <= 360 && ' ← Source'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Frame Rate</Label>
              <Select
                value={exportSettings.fps}
                onValueChange={v => updateSetting('fps', v as ExportSettings['fps'])}
                disabled={!isReencoding}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">Original ({metadata?.fps?.toFixed(0) || 30} fps)</SelectItem>
                  <SelectItem value="60">
                    60 fps (Smooth){metadata?.fps && metadata.fps >= 55 && ' ← Source'}
                  </SelectItem>
                  <SelectItem value="30">
                    30 fps (Standard){metadata?.fps && metadata.fps >= 28 && metadata.fps < 55 && ' ← Source'}
                  </SelectItem>
                  <SelectItem value="24">
                    24 fps (Cinematic){metadata?.fps && metadata.fps < 28 && ' ← Source'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CRF Slider (only when re-encoding) */}
          {isReencoding && (
            <CRFSlider
              crf={exportSettings.crf}
              preset={exportSettings.preset}
              onChange={(crf, preset, quality) => {
                onSettingsChange({ ...exportSettings, crf, preset, quality })
              }}
            />
          )}

          <Separator />

          {/* Audio Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Audio Codec</Label>
              <Select
                value={exportSettings.audioCodec}
                onValueChange={v => updateSetting('audioCodec', v as ExportSettings['audioCodec'])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="copy">Copy (No Re-encode)</SelectItem>
                  <SelectItem value="aac">AAC (Compatible)</SelectItem>
                  <SelectItem value="opus">Opus (Efficient)</SelectItem>
                  <SelectItem value="mp3">MP3 (Legacy)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {exportSettings.audioCodec !== 'copy' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Audio Bitrate</Label>
                <Select
                  value={exportSettings.audioBitrate.toString()}
                  onValueChange={v => updateSetting('audioBitrate', parseInt(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="320">320 kbps (High)</SelectItem>
                    <SelectItem value="256">256 kbps (Good)</SelectItem>
                    <SelectItem value="192">192 kbps (Standard)</SelectItem>
                    <SelectItem value="128">128 kbps (Low)</SelectItem>
                    <SelectItem value="96">96 kbps (Lowest)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Advanced Options */}
          {isReencoding && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">Two-Pass Encoding</Label>
                    <p className="text-muted-foreground text-[10px]">Better quality, slower</p>
                  </div>
                  <Switch
                    checked={exportSettings.twoPassEncoding}
                    onCheckedChange={v => updateSetting('twoPassEncoding', v)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs font-medium">Preserve Metadata</Label>
                    <p className="text-muted-foreground text-[10px]">Keep original file info</p>
                  </div>
                  <Switch
                    checked={exportSettings.preserveMetadata}
                    onCheckedChange={v => updateSetting('preserveMetadata', v)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <Separator />

      {/* Export Summary */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium">{formatTime(clipDuration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Output</span>
            <span className="font-medium">
              {outputResolution.width}×{outputResolution.height}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Codec</span>
            <span className="font-medium">{exportSettings.codec.toUpperCase()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Est. Size</span>
            <span className="text-primary font-semibold">~{formatBytes(estimate.totalBytes)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // ============================================================================
  // RENDER: EXPORTING STATE
  // ============================================================================
  const renderExporting = () => (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="border-primary/20 h-20 w-20 rounded-full border-4" />
          <div
            className="border-primary absolute inset-0 h-20 w-20 animate-spin rounded-full border-4 border-t-transparent"
            style={{ animationDuration: '1.5s' }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold">{Math.round(exportProgress)}%</span>
          </div>
        </div>
        <div className="text-center">
          <p className="font-medium">{exportState === 'preparing' ? 'Preparing...' : 'Exporting...'}</p>
          <p className="text-muted-foreground text-sm">
            {exportSettings.codec === 'copy'
              ? 'Copying streams'
              : `Encoding with ${exportSettings.codec.toUpperCase()}`}
          </p>
        </div>
      </div>
      <Progress value={exportProgress} className="h-2" />
    </div>
  )

  // ============================================================================
  // RENDER: COMPLETED STATE
  // ============================================================================
  const renderCompleted = () => (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle className="h-10 w-10 text-green-500" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">Export Complete!</p>
          {exportedFilePath && (
            <p className="text-muted-foreground mt-1 max-w-[300px] truncate text-sm">
              {exportedFilePath.split(/[/\\]/).pop()}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  // ============================================================================
  // RENDER: FAILED STATE
  // ============================================================================
  const renderFailed = () => (
    <div className="space-y-6 py-8">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <AlertCircle className="h-10 w-10 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">Export Failed</p>
          <p className="text-muted-foreground mt-1 text-sm">Please try again</p>
        </div>
      </div>
    </div>
  )

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export Video
          </DialogTitle>
          <DialogDescription>
            {isTrimmed
              ? `Export trimmed clip (${formatTime(trimStart)} - ${formatTime(trimEnd)})`
              : 'Configure export settings'}
          </DialogDescription>
        </DialogHeader>

        {exportState === 'idle' && renderSettings()}
        {(exportState === 'preparing' || exportState === 'exporting') && renderExporting()}
        {exportState === 'completed' && renderCompleted()}
        {exportState === 'failed' && renderFailed()}

        <DialogFooter>
          {exportState === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onExport} className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </>
          )}
          {exportState === 'completed' && (
            <>
              <Button variant="outline" onClick={onReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Export Another
              </Button>
              <Button onClick={onOpenExportedFile} className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Show in Folder
              </Button>
            </>
          )}
          {exportState === 'failed' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={onReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
