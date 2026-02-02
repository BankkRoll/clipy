/**
 * StreamingPlayer - Advanced video player with HLS streaming support
 * Supports direct URLs and HLS/DASH adaptive streaming
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import Hls from 'hls.js'
import { cn } from '@/utils/tailwind'
import { useTimelineStore } from '@/stores/timeline-store'

export interface StreamingPlayerProps {
  src?: string
  /** Separate audio URL for dual-stream playback (1080p+ video with synced audio) */
  audioSrc?: string
  poster?: string
  className?: string
  /** Set to true for external URLs (YouTube, etc.) that don't support CORS */
  isExternalUrl?: boolean
  onReady?: () => void
  onError?: (error: string) => void
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onLoadedMetadata?: () => void
  onEnded?: () => void
  onBuffering?: (isBuffering: boolean) => void
  onSeeked?: (time: number) => void // New callback for seek confirmation
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
      audioSrc,
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
    const audioRef = useRef<HTMLAudioElement>(null)
    const hlsRef = useRef<Hls | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isReady, setIsReady] = useState(false)
    const [audioReady, setAudioReady] = useState(false)

    // Track pending seeks to prevent loops and confirm sync
    const pendingSeekTime = useRef<number | null>(null)
    const lastExternalSeekTime = useRef<number>(0)

    // Track if we're using dual-stream mode
    const isDualStream = !!(audioSrc && src)

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
          const qualities = data.levels.map((level, index) => ({
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
        console.log('[StreamingPlayer] Loading direct video URL:', src.substring(0, 100))
        console.log('[StreamingPlayer] isExternalUrl:', isExternalUrl)
        video.src = src
        setIsLoading(false)
        setIsReady(true)
        onReady?.()
      }

      return () => {
        destroyHls()
      }
    }, [src, destroyHls, setIsLoading, setQualities, setError, onReady, onError])

    // Initialize audio element for dual-stream mode
    useEffect(() => {
      const audio = audioRef.current
      if (!audio || !audioSrc) {
        setAudioReady(false)
        return
      }

      console.log('[StreamingPlayer] Loading audio for dual-stream:', audioSrc.substring(0, 100))
      audio.src = audioSrc

      const handleAudioReady = () => {
        console.log('[StreamingPlayer] Audio ready for dual-stream playback')
        setAudioReady(true)
      }

      const handleAudioError = () => {
        console.warn('[StreamingPlayer] Audio failed to load, falling back to video-only')
        setAudioReady(false)
      }

      audio.addEventListener('canplaythrough', handleAudioReady)
      audio.addEventListener('error', handleAudioError)

      return () => {
        audio.removeEventListener('canplaythrough', handleAudioReady)
        audio.removeEventListener('error', handleAudioError)
      }
    }, [audioSrc])

    // Periodic audio sync to prevent drift during playback
    useEffect(() => {
      if (!isDualStream || !audioReady || !isPlaying) return

      const video = videoRef.current
      const audio = audioRef.current
      if (!video || !audio) return

      // Sync audio to video every 2 seconds to prevent drift
      const syncInterval = setInterval(() => {
        const drift = Math.abs(video.currentTime - audio.currentTime)
        if (drift > 0.3) {
          console.log(`[StreamingPlayer] Correcting audio drift: ${drift.toFixed(2)}s`)
          audio.currentTime = video.currentTime
        }
      }, 2000)

      return () => clearInterval(syncInterval)
    }, [isDualStream, audioReady, isPlaying])

    // Sync playback state with store (handles both video and audio for dual-stream)
    useEffect(() => {
      const video = videoRef.current
      const audio = audioRef.current
      if (!video || !isReady) return

      if (isPlaying) {
        // Play video first
        video.play().catch(err => {
          console.warn('[Player] Video play failed:', err)
          setIsPlaying(false)
        })
        // Sync audio if dual-stream
        if (isDualStream && audio && audioReady) {
          audio.play().catch(err => {
            console.warn('[Player] Audio play failed:', err)
          })
        }
      } else {
        video.pause()
        // Sync audio pause
        if (isDualStream && audio) {
          audio.pause()
        }
      }
    }, [isPlaying, isReady, setIsPlaying, isDualStream, audioReady])

    // Sync playback rate
    useEffect(() => {
      if (videoRef.current) {
        videoRef.current.playbackRate = playbackRate
      }
    }, [playbackRate])

    // Sync volume (in dual-stream mode, audio controls volume; video is muted)
    useEffect(() => {
      const video = videoRef.current
      const audio = audioRef.current

      if (isDualStream) {
        // In dual-stream mode: video is always muted, audio element controls sound
        if (video) {
          video.muted = true
          video.volume = 0
        }
        if (audio) {
          audio.volume = volume
          audio.muted = isMuted
        }
      } else {
        // Single stream mode: video controls everything
        if (video) {
          video.volume = volume
          video.muted = isMuted
        }
      }
    }, [volume, isMuted, isDualStream])

    // Handle external seek (from timeline) - use isDragging to detect scrubbing
    // Syncs both video and audio in dual-stream mode
    useEffect(() => {
      const video = videoRef.current
      const audio = audioRef.current
      if (!video || !isReady) return

      // Check if this is an external seek (from timeline dragging or clicking)
      const diff = Math.abs(video.currentTime - currentTime)

      // During active dragging, always seek immediately for smooth scrubbing
      if (isDragging && (dragType === 'playhead' || dragType === 'seek')) {
        if (diff > 0.01) {
          pendingSeekTime.current = currentTime
          lastExternalSeekTime.current = Date.now()
          video.currentTime = currentTime
          // Sync audio seek in dual-stream mode
          if (isDualStream && audio && audioReady) {
            audio.currentTime = currentTime
          }
        }
        return
      }

      // For non-dragging seeks (clicks, keyboard), use slightly larger threshold
      if (diff > 0.05) {
        pendingSeekTime.current = currentTime
        lastExternalSeekTime.current = Date.now()
        video.currentTime = currentTime
        // Sync audio seek in dual-stream mode
        if (isDualStream && audio && audioReady) {
          audio.currentTime = currentTime
        }
      }
    }, [currentTime, isReady, isDragging, dragType, isDualStream, audioReady])

    // Video event handlers
    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current
      if (!video) return

      // Don't update store while timeline is being dragged (prevents jitter during scrubbing)
      // The timeline is the source of truth during drag operations
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

    // Handle seek completion - confirms video actually seeked
    const handleSeeked = useCallback(() => {
      const video = videoRef.current
      if (!video) return

      // Clear pending seek
      pendingSeekTime.current = null

      // Notify callback of confirmed seek position
      onSeeked?.(video.currentTime)
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

      // Map error codes to helpful messages
      let errorMessage = ''
      switch (video.error.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = 'Video loading aborted'
          break
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = 'Network error loading video - this may be due to CORS restrictions or expired URL'
          break
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = 'Video decode error - format may not be supported'
          break
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage =
            'Video format not supported or CORS blocked - YouTube URLs cannot be played directly in browser'
          break
        default:
          errorMessage = `Video error: ${video.error.message || 'Unknown error'}`
      }

      console.error('[StreamingPlayer] Video error:', {
        code: video.error.code,
        message: video.error.message,
        src: src?.substring(0, 100),
      })

      setError(errorMessage)
      onError?.(errorMessage)
    }, [setError, onError, src])

    // Expose methods via ref (handles dual-stream synchronization)
    useImperativeHandle(
      ref,
      () => ({
        play: async () => {
          const video = videoRef.current
          const audio = audioRef.current
          if (!video) return

          // Start from trim start if at beginning and trimmed
          if (isTrimmed && video.currentTime < trimStart) {
            video.currentTime = trimStart
            if (isDualStream && audio && audioReady) {
              audio.currentTime = trimStart
            }
          }

          await video.play()
          // Sync audio play
          if (isDualStream && audio && audioReady) {
            audio.currentTime = video.currentTime // Ensure sync before play
            await audio.play().catch(() => {}) // Don't fail if audio can't play
          }
        },

        pause: () => {
          videoRef.current?.pause()
          // Sync audio pause
          if (isDualStream && audioRef.current) {
            audioRef.current.pause()
          }
        },

        seek: (time: number) => {
          const video = videoRef.current
          const audio = audioRef.current
          if (!video) return

          let targetTime = Math.max(0, Math.min(time, video.duration))
          if (isTrimmed) {
            targetTime = Math.max(trimStart, Math.min(targetTime, trimEnd))
          }

          video.currentTime = targetTime
          // Sync audio seek
          if (isDualStream && audio && audioReady) {
            audio.currentTime = targetTime
          }
          setCurrentTime(targetTime)
        },

        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getDuration: () => videoRef.current?.duration ?? 0,

        setPlaybackRate: (rate: number) => {
          if (videoRef.current) {
            videoRef.current.playbackRate = rate
          }
          // Sync audio playback rate
          if (isDualStream && audioRef.current) {
            audioRef.current.playbackRate = rate
          }
        },

        setVolume: (vol: number) => {
          if (isDualStream) {
            // In dual-stream, audio element controls volume
            if (audioRef.current) {
              audioRef.current.volume = vol
            }
          } else {
            if (videoRef.current) {
              videoRef.current.volume = vol
            }
          }
        },

        setMuted: (muted: boolean) => {
          if (isDualStream) {
            // In dual-stream, audio element controls mute
            if (audioRef.current) {
              audioRef.current.muted = muted
            }
          } else {
            if (videoRef.current) {
              videoRef.current.muted = muted
            }
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
      [isTrimmed, trimStart, trimEnd, setCurrentTime, isDualStream, audioReady],
    )

    return (
      <div className={cn('relative overflow-hidden bg-black', className)}>
        <video
          ref={videoRef}
          poster={poster}
          className="h-full w-full object-contain"
          playsInline
          preload="auto"
          // Don't use crossOrigin for external URLs (YouTube, etc.) - they don't support CORS
          // This disables canvas frame capture but allows video playback
          crossOrigin={isExternalUrl ? undefined : 'anonymous'}
          // In dual-stream mode, video is muted (audio element handles sound)
          muted={isDualStream}
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

        {/* Hidden audio element for dual-stream mode (1080p+ video with separate audio) */}
        {isDualStream && <audio ref={audioRef} preload="auto" crossOrigin={isExternalUrl ? undefined : 'anonymous'} />}

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  },
)

StreamingPlayer.displayName = 'StreamingPlayer'

export default StreamingPlayer
