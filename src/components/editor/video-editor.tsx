/**
 * VideoEditor - Video editor with player, timeline, and controls
 */

import { AlertCircle, Loader2 } from 'lucide-react'
import { StreamingPlayer, StreamingPlayerRef } from './player/streaming-player'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AspectRatio } from '@/components/ui/aspect-ratio'
import { PlayerControls } from './player/player-controls'
import { Timeline } from './timeline/timeline'
import { cn } from '@/utils/tailwind'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useTimelineStore } from '@/stores/timeline-store'

interface VideoEditorProps {
  videoUrl?: string
  poster?: string
  duration?: number
  title?: string
  thumbnails?: string[]
  className?: string
  /** Set to true for external URLs (YouTube streaming) that don't support CORS */
  isExternalUrl?: boolean
  onTimeUpdate?: (time: number) => void
  onTrimChange?: (start: number, end: number) => void
  onReady?: () => void
  onError?: (error: string) => void
}

export function VideoEditor({
  videoUrl,
  poster,
  duration: initialDuration,
  title,
  thumbnails = [],
  className,
  isExternalUrl = false,
  onTimeUpdate,
  onTrimChange,
  onReady,
  onError,
}: VideoEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<StreamingPlayerRef>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const {
    trimStart,
    trimEnd,
    isTrimmed,
    isLoading,
    isBuffering,
    error,
    initializeForVideo,
    setStreamUrl,
    setError,
    setIsLoading,
  } = useTimelineStore()

  useKeyboardShortcuts({
    enabled: true,
  })

  useEffect(() => {
    if (initialDuration) {
      initializeForVideo(initialDuration, videoUrl)
    }
    if (videoUrl) {
      setStreamUrl(videoUrl)
    }
  }, [videoUrl, initialDuration, initializeForVideo, setStreamUrl])

  useEffect(() => {
    onTrimChange?.(trimStart, trimEnd)
  }, [trimStart, trimEnd, onTrimChange])

  const handleSeek = useCallback(
    (time: number) => {
      playerRef.current?.seek(time)
      onTimeUpdate?.(time)
    },
    [onTimeUpdate],
  )

  const handlePlayerReady = useCallback(() => {
    setIsLoading(false)
    onReady?.()
  }, [setIsLoading, onReady])

  const handlePlayerError = useCallback(
    (err: string) => {
      setError(err)
      onError?.(err)
    },
    [setError, onError],
  )

  const handleDurationChange = useCallback(
    (dur: number) => {
      if (!initialDuration) {
        initializeForVideo(dur, videoUrl)
      }
    },
    [initialDuration, videoUrl, initializeForVideo],
  )

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn('flex flex-col', isFullscreen && 'bg-background fixed inset-0 z-50', className)}
    >
      {/* Player */}
      <div className="border-border bg-card overflow-hidden border">
        <div className="relative bg-black">
          <AspectRatio ratio={16 / 9}>
            {videoUrl ? (
              <StreamingPlayer
                ref={playerRef}
                src={videoUrl}
                poster={poster}
                className="h-full w-full"
                isExternalUrl={isExternalUrl}
                onReady={handlePlayerReady}
                onError={handlePlayerError}
                onTimeUpdate={onTimeUpdate}
                onDurationChange={handleDurationChange}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                {poster ? (
                  <img src={poster} alt={title || 'Video'} className="h-full w-full object-cover opacity-50" />
                ) : (
                  <div className="px-4 text-center">
                    <p className="text-muted-foreground">No video preview</p>
                    <p className="text-muted-foreground mt-1 text-sm">Use timeline to set trim points</p>
                  </div>
                )}
              </div>
            )}

            {isLoading && videoUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center">
                  <Loader2 className="text-foreground mx-auto h-8 w-8 animate-spin" />
                  {isExternalUrl && <p className="text-muted-foreground mt-2 text-sm">Loading YouTube video...</p>}
                </div>
              </div>
            )}

            {isBuffering && !isLoading && videoUrl && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Loader2 className="text-foreground h-6 w-6 animate-spin" />
              </div>
            )}

            {error && videoUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* Show poster/thumbnail behind the error message */}
                {poster && (
                  <img
                    src={poster}
                    alt={title || 'Video thumbnail'}
                    className="absolute inset-0 h-full w-full object-cover opacity-30"
                  />
                )}
                <div className="relative z-10 rounded-lg bg-black/70 px-6 py-4 text-center">
                  <AlertCircle className="text-destructive mx-auto mb-2 h-8 w-8" />
                  <p className="text-foreground">Preview unavailable</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {isExternalUrl
                      ? 'YouTube videos cannot be streamed directly due to browser restrictions.'
                      : 'Failed to load video preview.'}
                  </p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    Use the timeline below to set trim points, then download.
                  </p>
                </div>
              </div>
            )}

            {isTrimmed && !error && (
              <div className="pointer-events-none absolute bottom-4 left-4 flex gap-2">
                <span className="text-primary rounded bg-black/60 px-2 py-1 text-xs">IN: {formatTime(trimStart)}</span>
                <span className="text-primary rounded bg-black/60 px-2 py-1 text-xs">OUT: {formatTime(trimEnd)}</span>
              </div>
            )}
          </AspectRatio>

          <PlayerControls />
        </div>
      </div>

      {/* Timeline */}
      <Timeline
        showWaveform={true}
        showThumbnails={thumbnails.length > 0}
        thumbnails={thumbnails}
        onSeek={handleSeek}
      />
    </div>
  )
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export default VideoEditor
