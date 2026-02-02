/**
 * EditorHeader - Advanced header with video metadata hover card and export controls
 * Production-ready with full YouTube metadata display
 */

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  BadgeCheck,
  Calendar,
  Download,
  ExternalLink,
  Eye,
  FileVideo,
  Globe,
  HardDrive,
  Hash,
  Info,
  Scissors,
  Tag,
  Video,
} from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { VideoInfo } from '@/types/download'
import { useNavigate } from '@tanstack/react-router'

interface VideoMetadata {
  duration: number
  width: number
  height: number
  bitrate: number
  codec: string
  size: number
  fps: number
}

interface EditorHeaderProps {
  title: string
  isStreamingMode: boolean
  isTrimmed: boolean
  trimDuration: string
  videoUrl: string | null
  onExport: () => void
  // Local file metadata
  metadata?: VideoMetadata | null
  filePath?: string
  // YouTube video info (for streaming mode)
  videoInfo?: VideoInfo | null
}

/**
 * Format large numbers with K/M/B suffixes
 */
const formatNumber = (num: number): string => {
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toLocaleString()
}

/**
 * Format file size in bytes to human readable format
 */
const formatSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return 'Unknown'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

/**
 * Format bitrate
 */
const formatBitrate = (bitrate: number): string => {
  if (!bitrate || bitrate <= 0) return 'Unknown'
  if (bitrate >= 1_000_000) return `${(bitrate / 1_000_000).toFixed(1)} Mbps`
  if (bitrate >= 1_000) return `${(bitrate / 1_000).toFixed(0)} Kbps`
  return `${bitrate} bps`
}

/**
 * Get default bitrate based on resolution (in bps)
 */
const getDefaultBitrate = (height: number): number => {
  if (height >= 2160) return 35_000_000 // 4K: ~35 Mbps
  if (height >= 1440) return 16_000_000 // 1440p: ~16 Mbps
  if (height >= 1080) return 8_000_000 // 1080p: ~8 Mbps
  if (height >= 720) return 5_000_000 // 720p: ~5 Mbps
  if (height >= 480) return 2_500_000 // 480p: ~2.5 Mbps
  return 1_000_000 // Default: ~1 Mbps
}

/**
 * Estimate file size from bitrate and duration
 */
const estimateSize = (bitrate: number, duration: number, height: number): number => {
  const baseBitrate = bitrate > 0 ? bitrate : getDefaultBitrate(height)
  const audioBitrate = 192 * 1000 // ~192 kbps audio
  return ((baseBitrate + audioBitrate) * duration) / 8
}

/**
 * Format date to readable string
 */
const formatDate = (dateStr: string): string => {
  try {
    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(dateStr)) {
      const year = dateStr.slice(0, 4)
      const month = dateStr.slice(4, 6)
      const day = dateStr.slice(6, 8)
      const date = new Date(`${year}-${month}-${day}`)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return dateStr
  }
}

/**
 * Format duration in seconds to human readable format
 */
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * YouTube Video Info Hover Card Content
 */
function YouTubeInfoCard({ videoInfo }: { videoInfo: VideoInfo }) {
  const bestFormat = videoInfo.bestVideoFormat
  const thumbnail = videoInfo.thumbnails[videoInfo.thumbnails.length - 1]?.url || videoInfo.thumbnails[0]?.url

  return (
    <div className="space-y-2">
      {/* Thumbnail with duration overlay */}
      <div className="relative overflow-hidden rounded-lg">
        {thumbnail && <img src={thumbnail} alt={videoInfo.title} className="aspect-video w-full object-cover" />}
        {/* Duration badge - only show if not live and has valid duration */}
        {!videoInfo.isLive && videoInfo.duration > 0 && (
          <div className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
            {videoInfo.durationFormatted || formatDuration(videoInfo.duration)}
          </div>
        )}
      </div>

      {/* Title */}
      <div>
        <h4 className="line-clamp-2 text-sm leading-tight font-semibold">{videoInfo.title}</h4>
      </div>

      {/* Channel Info */}
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          {videoInfo.channel.thumbnail && (
            <AvatarImage src={videoInfo.channel.thumbnail} alt={videoInfo.channel.name} />
          )}
          <AvatarFallback className="text-xs">{videoInfo.channel.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-medium">{videoInfo.channel.name}</span>
            {videoInfo.channel.verified && <BadgeCheck className="h-4 w-4 flex-shrink-0 text-blue-500" />}
          </div>
          {videoInfo.channel.subscriberCount && (
            <p className="text-muted-foreground text-xs">
              {formatNumber(videoInfo.channel.subscriberCount)} subscribers
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Eye className="text-muted-foreground h-4 w-4" />
          <span>{videoInfo.viewsFormatted || formatNumber(videoInfo.views)} views</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="text-muted-foreground h-4 w-4" />
          <span>{formatDate(videoInfo.uploadDate)}</span>
        </div>
        {videoInfo.category && (
          <div className="flex items-center gap-2">
            <Tag className="text-muted-foreground h-4 w-4" />
            <span>{videoInfo.category}</span>
          </div>
        )}
        {videoInfo.language && (
          <div className="flex items-center gap-2">
            <Globe className="text-muted-foreground h-4 w-4" />
            <span>{videoInfo.language.toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Description Preview */}
      {videoInfo.description && (
        <>
          <Separator />
          <div>
            <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">Description</p>
            <ScrollArea className="h-20">
              <p className="text-xs leading-relaxed whitespace-pre-wrap">
                {videoInfo.description.slice(0, 500)}
                {videoInfo.description.length > 500 && '...'}
              </p>
            </ScrollArea>
          </div>
        </>
      )}

      {/* Tags */}
      {videoInfo.tags && videoInfo.tags.length > 0 && (
        <>
          <Separator />
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Tags</p>
            <div className="flex flex-wrap gap-1">
              {videoInfo.tags.slice(0, 8).map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  #{tag}
                </Badge>
              ))}
              {videoInfo.tags.length > 8 && (
                <Badge variant="outline" className="text-xs">
                  +{videoInfo.tags.length - 8} more
                </Badge>
              )}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Technical Details */}
      <div>
        <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Video Quality</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {bestFormat?.width && bestFormat?.height && (
            <div className="flex items-center gap-1.5">
              <FileVideo className="text-muted-foreground h-3.5 w-3.5" />
              <span>
                {bestFormat.width}x{bestFormat.height}
              </span>
            </div>
          )}
          {bestFormat?.fps && (
            <div className="flex items-center gap-1.5">
              <Video className="text-muted-foreground h-3.5 w-3.5" />
              <span>{bestFormat.fps} FPS</span>
            </div>
          )}
          {bestFormat?.videoCodec && (
            <div className="flex items-center gap-1.5">
              <Hash className="text-muted-foreground h-3.5 w-3.5" />
              <span>{bestFormat.videoCodec}</span>
            </div>
          )}
          {bestFormat?.bitrate && (
            <div className="flex items-center gap-1.5">
              <HardDrive className="text-muted-foreground h-3.5 w-3.5" />
              <span>{formatBitrate(bestFormat.bitrate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Available Qualities */}
      {videoInfo.availableQualities && videoInfo.availableQualities.length > 0 && (
        <div>
          <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">Available Formats</p>
          <div className="flex flex-wrap gap-1">
            {videoInfo.availableQualities.slice(0, 6).map((quality, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {quality}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Video ID */}
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>ID: {videoInfo.id}</span>
        <button
          onClick={() => window.electronAPI.shell.openExternal(`https://youtube.com/watch?v=${videoInfo.id}`)}
          className="hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Open on YouTube
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

/**
 * Local File Info Hover Card Content
 */
function LocalFileInfoCard({ metadata, filePath }: { metadata: VideoMetadata; filePath?: string }) {
  const fileName = filePath?.split(/[/\\]/).pop() || 'Unknown'
  const folderPath = filePath?.replace(/[/\\][^/\\]+$/, '') || ''

  return (
    <div className="space-y-4">
      {/* File Name */}
      <div>
        <h4 className="line-clamp-2 text-sm leading-tight font-semibold">{fileName}</h4>
        {folderPath && <p className="text-muted-foreground mt-1 truncate text-xs">{folderPath}</p>}
      </div>

      <Separator />

      {/* Video Details */}
      <div className="space-y-3">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Video Properties</p>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">Resolution</p>
            <p className="font-medium">
              {metadata.width}x{metadata.height}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">Duration</p>
            <p className="font-medium">{formatDuration(metadata.duration)}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">File Size</p>
            <p className="font-medium">
              {metadata.size > 0
                ? formatSize(metadata.size)
                : `~${formatSize(estimateSize(metadata.bitrate, metadata.duration, metadata.height))}`}
            </p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">Frame Rate</p>
            <p className="font-medium">{metadata.fps.toFixed(2)} FPS</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">Codec</p>
            <p className="font-medium">{metadata.codec.toUpperCase()}</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-muted-foreground text-xs">Bitrate</p>
            <p className="font-medium">
              {metadata.bitrate > 0
                ? formatBitrate(metadata.bitrate)
                : `~${formatBitrate(getDefaultBitrate(metadata.height))}`}
            </p>
          </div>
        </div>
      </div>

      {/* Quality Badges */}
      <div className="flex flex-wrap gap-1.5">
        {metadata.height >= 2160 && <Badge className="bg-purple-500/20 text-purple-400">4K UHD</Badge>}
        {metadata.height >= 1080 && metadata.height < 2160 && (
          <Badge className="bg-blue-500/20 text-blue-400">Full HD</Badge>
        )}
        {metadata.height >= 720 && metadata.height < 1080 && (
          <Badge className="bg-green-500/20 text-green-400">HD</Badge>
        )}
        {metadata.height < 720 && <Badge variant="secondary">SD</Badge>}
        {metadata.fps >= 60 && <Badge variant="outline">High Frame Rate</Badge>}
        {metadata.codec.toLowerCase().includes('hevc') || metadata.codec.toLowerCase().includes('h265') ? (
          <Badge variant="outline">HEVC</Badge>
        ) : metadata.codec.toLowerCase().includes('h264') || metadata.codec.toLowerCase().includes('avc') ? (
          <Badge variant="outline">H.264</Badge>
        ) : (
          <Badge variant="outline">{metadata.codec}</Badge>
        )}
      </div>
    </div>
  )
}

export function EditorHeader({
  title,
  isStreamingMode,
  isTrimmed,
  trimDuration,
  videoUrl,
  onExport,
  metadata,
  filePath,
  videoInfo,
}: EditorHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="flex items-center justify-between">
      {/* Left side - Back button and title with hover card */}
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {/* Title with hover card for metadata */}
        <HoverCard openDelay={200} closeDelay={100}>
          <HoverCardTrigger asChild>
            <button className="hover:bg-accent group flex max-w-md min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors">
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium">{title}</p>
                {isStreamingMode && videoInfo && (
                  <p className="text-muted-foreground truncate text-xs">
                    {videoInfo.channel.name} · {videoInfo.viewsFormatted || formatNumber(videoInfo.views)} views
                  </p>
                )}
                {!isStreamingMode && metadata && (
                  <p className="text-muted-foreground truncate text-xs">
                    {metadata.width}x{metadata.height} · {formatDuration(metadata.duration)} ·{' '}
                    {metadata.size > 0
                      ? formatSize(metadata.size)
                      : `~${formatSize(estimateSize(metadata.bitrate, metadata.duration, metadata.height))}`}
                  </p>
                )}
              </div>
              <Info className="text-muted-foreground group-hover:text-foreground h-4 w-4 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-96 p-4" side="bottom">
            {isStreamingMode && videoInfo ? (
              <YouTubeInfoCard videoInfo={videoInfo} />
            ) : metadata ? (
              <LocalFileInfoCard metadata={metadata} filePath={filePath} />
            ) : (
              <div className="text-muted-foreground py-4 text-center text-sm">No metadata available</div>
            )}
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Right side - Trim badge and export button */}
      <div className="flex items-center gap-3">
        {isTrimmed && (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1">
            <Scissors className="h-3.5 w-3.5" />
            <span>Trimmed: {trimDuration}</span>
          </Badge>
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={onExport} disabled={!videoUrl} size="default">
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{isTrimmed ? 'Export trimmed clip' : 'Export video'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
