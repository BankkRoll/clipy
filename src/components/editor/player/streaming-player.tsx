/**
 * StreamingPlayer - Video player with HLS streaming support
 * Simplified to use combined formats (single video+audio stream)
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import Hls from 'hls.js'
import { cn } from '@/utils/tailwind'
import { useTimelineStore } from '@/stores/timeline-store'

export interface StreamingPlayerProps {
  src?: string
  poster?: string
  className?: string
  /** Set to true for external URLs (YouTube, etc.) - Electron's webRequest handles CORS */
  isExternalUrl?: boolean
  onReady?: () => void
  onError?: (error: string) => void
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onLoadedMetadata?: () => void
  onEnded?: () => void
  onBuffering?: (isBuffering: boolean) => void
  onSeeked?: (time: number) => void
}

export interface StreamingPlayerRef {
  play: () => Promise<void>
  pause: () => void
  seek: (time: number) => void
  getCurrentTime: () => number
  getDuration: () => number
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  setMuted: (muted: boolean) => void
  getVideoElement: () => HTMLVideoElement | null
  captureFrame: () => string | null
}

export const StreamingPlayer = forwardRef<StreamingPlayerRef, StreamingPlayerProps>(
  (
    {
      src,
      poster,
      className,
      isExternalUrl = false,
      onReady,
      onError,
      onTimeUpdate,
      onDurationChange,
      onLoadedMetadata,
      onEnded,
      onBuffering,
      onSeeked,
    },
    ref,
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const hlsRef = useRef<Hls | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isReady, setIsReady] = useState(false)

    // Track pending seeks to prevent loops
    const lastExternalSeekTime = useRef<number>(0)

    const {
      isPlaying,
      currentTime,
      playbackRate,
      volume,
      isMuted,
      trimStart,
      trimEnd,
      isTrimmed,
      isDragging,
      dragType,
      setCurrentTime,
      setDuration,
      setIsPlaying,
      setIsLoading,
      setIsBuffering,
      setQualities,
      setError,
    } = useTimelineStore()

    // Cleanup HLS instance
    const destroyHls = useCallback(() => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }, [])

    // Initialize HLS or direct playback
    useEffect(() => {
      const video = videoRef.current
      if (!video || !src) return

      setIsLoading(true)
      setIsReady(false)
      destroyHls()

      // Check if source is HLS
      const isHlsSource = src.includes('.m3u8') || src.includes('manifest')

      if (isHlsSource && Hls.isSupported()) {
        // Use HLS.js for adaptive streaming
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 60,
          startLevel: -1, // Auto quality
        })

        hlsRef.current = hls

        hls.loadSource(src)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          console.log('[HLS] Manifest parsed, levels:', data.levels.length)

          // Extract quality levels
          const qualities = data.levels.map(level => ({
            label: `${level.height}p`,
            height: level.height,
            bitrate: level.bitrate,
            url: level.url[0],
          }))

          setQualities([{ label: 'Auto', height: 0 }, ...qualities])
          setIsLoading(false)
          setIsReady(true)
          onReady?.()
        })

        hls.on(Hls.Events.ERROR, (_, data) => {
          console.error('[HLS] Error:', data.type, data.details)
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('[HLS] Fatal network error, trying to recover...')
                hls.startLoad()
                break
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('[HLS] Fatal media error, trying to recover...')
                hls.recoverMediaError()
                break
              default:
                destroyHls()
                setError(`Playback error: ${data.details}`)
                onError?.(`Playback error: ${data.details}`)
                break
            }
          }
        })

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          console.log('[HLS] Quality switched to level:', data.level)
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl') && isHlsSource) {
        // Native HLS support (Safari)
        video.src = src
        setIsLoading(false)
        setIsReady(true)
        onReady?.()
      } else {
        // Direct video URL (MP4, WebM, etc.)
        console.log('[StreamingPlayer] Loading video URL:', src.substring(0, 100))

        video.src = src

        // Wait for canplay event to confirm video is loading
        const handleCanPlay = () => {
          console.log('[StreamingPlayer] Video can play - stream working!')
          setIsLoading(false)
          setIsReady(true)
          onReady?.()
          video.removeEventListener('canplay', handleCanPlay)
        }

        video.addEventListener('canplay', handleCanPlay)
      }

      return () => {
        destroyHls()
      }
    }, [src, destroyHls, setIsLoading, setQualities, setError, onReady, onError])

    // Sync playback state with store
    useEffect(() => {
      const video = videoRef.current
      if (!video || !isReady) return

      if (isPlaying) {
        video.play().catch(err => {
          console.warn('[Player] Video play failed:', err)
          setIsPlaying(false)
        })
      } else {
        video.pause()
      }
    }, [isPlaying, isReady, setIsPlaying])

    // Sync playback rate
    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate
      }
    }, [playbackRate])

    // Sync volume
    useEffect(() => {
      const video = videoRef.current
      if (video) {
        video.volume = volume
        video.muted = isMuted
      }
    }, [volume, isMuted])

    // Handle external seek (from timeline)
    useEffect(() => {
      const video = videoRef.current
      if (!video || !isReady) return

      const diff = Math.abs(video.currentTime - currentTime)

      // During active dragging, always seek immediately for smooth scrubbing
      if (isDragging && (dragType === 'playhead' || dragType === 'seek')) {
        if (diff > 0.01) {
          lastExternalSeekTime.current = Date.now()
          video.currentTime = currentTime
        }
        return
      }

      // For non-dragging seeks (clicks, keyboard), use slightly larger threshold
      if (diff > 0.05) {
        lastExternalSeekTime.current = Date.now()
        video.currentTime = currentTime
      }
    }, [currentTime, isReady, isDragging, dragType])

    // Video event handlers
    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current
      if (!video) return

      // Don't update store while timeline is being dragged
      if (
        isDragging &&
        (dragType === 'playhead' || dragType === 'seek' || dragType === 'trim-start' || dragType === 'trim-end')
      ) {
        return
      }

      // Don't update if we recently initiated an external seek (debounce)
      const timeSinceExternalSeek = Date.now() - lastExternalSeekTime.current
      if (timeSinceExternalSeek < 100) {
        return
      }

      const time = video.currentTime
      setCurrentTime(time)
      onTimeUpdate?.(time)

      // Auto-pause at trim end if playing trimmed
      if (isTrimmed && time >= trimEnd && isPlaying) {
        video.pause()
        setIsPlaying(false)
      }
    }, [setCurrentTime, onTimeUpdate, isTrimmed, trimEnd, isPlaying, setIsPlaying, isDragging, dragType])

    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current
      if (!video) return

      setDuration(video.duration)
      onDurationChange?.(video.duration)
      onLoadedMetadata?.()
    }, [setDuration, onDurationChange, onLoadedMetadata])

    const handleSeeked = useCallback(() => {
      onSeeked?.(videoRef.current?.currentTime ?? 0)
    }, [onSeeked])

    const handleWaiting = useCallback(() => {
      setIsBuffering(true)
      onBuffering?.(true)
    }, [setIsBuffering, onBuffering])

    const handlePlaying = useCallback(() => {
      setIsBuffering(false)
      onBuffering?.(false)
    }, [setIsBuffering, onBuffering])

    const handleEnded = useCallback(() => {
      setIsPlaying(false)
      onEnded?.()

      // Loop to trim start if trimmed
      if (isTrimmed) {
        const video = videoRef.current
        if (video) {
          video.currentTime = trimStart
          setCurrentTime(trimStart)
        }
      }
    }, [setIsPlaying, onEnded, isTrimmed, trimStart, setCurrentTime])

    const handlePlay = useCallback(() => {
      setIsPlaying(true)
    }, [setIsPlaying])

    const handlePause = useCallback(() => {
      setIsPlaying(false)
    }, [setIsPlaying])

    const handleError = useCallback(() => {
      const video = videoRef.current
      if (!video?.error) return

      console.error('[StreamingPlayer] Video error:', {
        code: video.error.code,
        message: video.error.message,
        src: src?.substring(0, 150),
      })

      // Map error codes to helpful messages
      let errorMessage = ''
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video loading aborted'
          break
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error loading video'
          break
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decode error - format may not be supported'
          break
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = 'Video format not supported'
          break
        default:
          errorMessage = `Video error: ${video.error.message || 'Unknown error'}`
      }

      console.error('[StreamingPlayer] Error:', errorMessage)
      setError(errorMessage)
      onError?.(errorMessage)
    }, [setError, onError, src])

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        play: async () => {
          const video = videoRef.current
          if (!video) return

          // Start from trim start if at beginning and trimmed
          if (isTrimmed && video.currentTime < trimStart) {
            video.currentTime = trimStart
          }

          await video.play()
        },

        pause: () => {
          videoRef.current?.pause()
        },

        seek: (time: number) => {
          const video = videoRef.current
          if (!video) return

          let targetTime = Math.max(0, Math.min(time, video.duration))
          if (isTrimmed) {
            targetTime = Math.max(trimStart, Math.min(targetTime, trimEnd))
          }

          video.currentTime = targetTime
          setCurrentTime(targetTime)
        },

        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getDuration: () => videoRef.current?.duration ?? 0,

        setPlaybackRate: (rate: number) => {
          if (videoRef.current) {
            videoRef.current.playbackRate = rate
          }
        },

        setVolume: (vol: number) => {
          if (videoRef.current) {
            videoRef.current.volume = vol
          }
        },

        setMuted: (muted: boolean) => {
          if (videoRef.current) {
            videoRef.current.muted = muted
          }
        },

        getVideoElement: () => videoRef.current,

        captureFrame: () => {
          const video = videoRef.current
          const canvas = canvasRef.current
          if (!video || !canvas) return null

          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          const ctx = canvas.getContext('2d')
          if (!ctx) return null

          ctx.drawImage(video, 0, 0)
          return canvas.toDataURL('image/jpeg', 0.8)
        },
      }),
      [isTrimmed, trimStart, trimEnd, setCurrentTime],
    )

    return (
      <div className={cn('relative overflow-hidden bg-black', className)}>
        <video
          ref={videoRef}
          poster={poster}
          className="h-full w-full object-contain"
          playsInline
          preload="auto"
          // Don't use crossOrigin for external URLs - Electron's webRequest handles CORS
          crossOrigin={isExternalUrl ? undefined : 'anonymous'}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          onError={handleError}
        />

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  },
)

StreamingPlayer.displayName = 'StreamingPlayer'

export default StreamingPlayer
