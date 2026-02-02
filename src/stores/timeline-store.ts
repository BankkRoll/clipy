/**
 * Timeline Store - Zustand state management for video editor timeline
 * Handles playback state, trim ranges, zoom, and timeline interactions
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

export interface TimelineState {
  // Video info
  duration: number
  currentTime: number
  isPlaying: boolean
  playbackRate: number
  volume: number
  isMuted: boolean

  // Trim range
  trimStart: number
  trimEnd: number
  isTrimmed: boolean

  // Timeline view
  zoom: number // 1 = fit to view, higher = zoomed in
  scrollPosition: number // horizontal scroll in timeline
  viewportStart: number // visible start time
  viewportEnd: number // visible end time

  // Interaction states
  isDragging: boolean
  dragType: 'playhead' | 'trim-start' | 'trim-end' | 'seek' | null
  isLoading: boolean
  isBuffering: boolean

  // Waveform data
  waveformData: number[]
  waveformLoaded: boolean

  // Thumbnail data
  thumbnails: string[]
  thumbnailsLoaded: boolean
  thumbnailInterval: number // seconds between thumbnails

  // Streaming
  streamUrl: string | null
  qualities: VideoQuality[]
  selectedQuality: string

  // Error state
  error: string | null

  // Markers
  markers: TimelineMarker[]

  // Snapping
  snapConfig: SnapConfig
}

export interface VideoQuality {
  label: string
  height: number
  bitrate?: number
  url?: string
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
  color: string
}

export interface SnapConfig {
  enabled: boolean
  threshold: number // pixels to snap within
  snapToMarkers: boolean
  snapToTrimPoints: boolean
  snapToPlayhead: boolean
}

export interface TimelineActions {
  // Playback controls
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  seekRelative: (delta: number) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void

  // Frame navigation
  nextFrame: () => void
  prevFrame: () => void
  jumpToStart: () => void
  jumpToEnd: () => void

  // Trim controls
  setTrimStart: (time: number) => void
  setTrimEnd: (time: number) => void
  setTrimRange: (start: number, end: number) => void
  resetTrim: () => void
  goToTrimStart: () => void
  goToTrimEnd: () => void

  // Timeline view controls
  setZoom: (zoom: number) => void
  zoomIn: () => void
  zoomOut: () => void
  fitToView: () => void
  setScrollPosition: (position: number) => void

  // State setters
  setDuration: (duration: number) => void
  setCurrentTime: (time: number) => void
  setIsPlaying: (isPlaying: boolean) => void
  setIsLoading: (isLoading: boolean) => void
  setIsBuffering: (isBuffering: boolean) => void
  setIsDragging: (isDragging: boolean, dragType?: TimelineState['dragType']) => void

  // Data setters
  setWaveformData: (data: number[]) => void
  setThumbnails: (thumbnails: string[], interval: number) => void
  setStreamUrl: (url: string | null) => void
  setQualities: (qualities: VideoQuality[]) => void
  setSelectedQuality: (quality: string) => void

  // Error handling
  setError: (error: string | null) => void
  clearError: () => void

  // Reset
  reset: () => void
  initializeForVideo: (duration: number, streamUrl?: string) => void

  // Markers
  addMarker: (time: number, label?: string, color?: string) => void
  removeMarker: (id: string) => void
  updateMarker: (id: string, updates: Partial<Omit<TimelineMarker, 'id'>>) => void
  clearMarkers: () => void
  goToMarker: (id: string) => void
  goToNextMarker: () => void
  goToPrevMarker: () => void

  // Snapping
  setSnapConfig: (config: Partial<SnapConfig>) => void
  toggleSnapping: () => void
  getSnapPoints: () => number[]
  snapTime: (time: number, pixelsPerSecond: number) => number
}

const FRAME_RATE = 30 // Assumed frame rate for frame stepping
const MIN_ZOOM = 0.5
const MAX_ZOOM = 50
const ZOOM_STEP = 1.5

const initialState: TimelineState = {
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  playbackRate: 1,
  volume: 1,
  isMuted: false,

  trimStart: 0,
  trimEnd: 0,
  isTrimmed: false,

  zoom: 1,
  scrollPosition: 0,
  viewportStart: 0,
  viewportEnd: 0,

  isDragging: false,
  dragType: null,
  isLoading: true,
  isBuffering: false,

  waveformData: [],
  waveformLoaded: false,

  thumbnails: [],
  thumbnailsLoaded: false,
  thumbnailInterval: 10,

  streamUrl: null,
  qualities: [],
  selectedQuality: 'auto',

  error: null,

  markers: [],

  snapConfig: {
    enabled: true,
    threshold: 10,
    snapToMarkers: true,
    snapToTrimPoints: true,
    snapToPlayhead: false,
  },
}

export const useTimelineStore = create<TimelineState & TimelineActions>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Playback controls
    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    togglePlay: () => set(state => ({ isPlaying: !state.isPlaying })),

    seek: (time: number) => {
      const { duration, trimStart, trimEnd, isTrimmed } = get()
      let clampedTime = Math.max(0, Math.min(time, duration))

      // If trimmed, constrain to trim range
      if (isTrimmed) {
        clampedTime = Math.max(trimStart, Math.min(clampedTime, trimEnd))
      }

      set({ currentTime: clampedTime })
    },

    seekRelative: (delta: number) => {
      const { currentTime } = get()
      get().seek(currentTime + delta)
    },

    setPlaybackRate: (rate: number) => set({ playbackRate: Math.max(0.25, Math.min(rate, 4)) }),
    setVolume: (volume: number) => set({ volume: Math.max(0, Math.min(volume, 1)) }),
    toggleMute: () => set(state => ({ isMuted: !state.isMuted })),

    // Frame navigation (assuming 30fps)
    nextFrame: () => {
      const { currentTime } = get()
      get().seek(currentTime + 1 / FRAME_RATE)
    },

    prevFrame: () => {
      const { currentTime } = get()
      get().seek(currentTime - 1 / FRAME_RATE)
    },

    jumpToStart: () => {
      const { trimStart, isTrimmed } = get()
      set({ currentTime: isTrimmed ? trimStart : 0 })
    },

    jumpToEnd: () => {
      const { duration, trimEnd, isTrimmed } = get()
      set({ currentTime: isTrimmed ? trimEnd : duration })
    },

    // Trim controls
    setTrimStart: (time: number) => {
      const { duration, trimEnd } = get()
      const clampedStart = Math.max(0, Math.min(time, trimEnd - 0.1))
      set({
        trimStart: clampedStart,
        isTrimmed: clampedStart > 0 || trimEnd < duration,
      })
    },

    setTrimEnd: (time: number) => {
      const { duration, trimStart } = get()
      const clampedEnd = Math.max(trimStart + 0.1, Math.min(time, duration))
      set({
        trimEnd: clampedEnd,
        isTrimmed: trimStart > 0 || clampedEnd < duration,
      })
    },

    setTrimRange: (start: number, end: number) => {
      const { duration } = get()
      const clampedStart = Math.max(0, Math.min(start, end - 0.1))
      const clampedEnd = Math.max(clampedStart + 0.1, Math.min(end, duration))
      set({
        trimStart: clampedStart,
        trimEnd: clampedEnd,
        isTrimmed: clampedStart > 0 || clampedEnd < duration,
      })
    },

    resetTrim: () => {
      const { duration } = get()
      set({
        trimStart: 0,
        trimEnd: duration,
        isTrimmed: false,
      })
    },

    goToTrimStart: () => {
      const { trimStart } = get()
      set({ currentTime: trimStart })
    },

    goToTrimEnd: () => {
      const { trimEnd } = get()
      set({ currentTime: trimEnd })
    },

    // Timeline view controls
    setZoom: (zoom: number) => {
      set({ zoom: Math.max(MIN_ZOOM, Math.min(zoom, MAX_ZOOM)) })
    },

    zoomIn: () => {
      const { zoom } = get()
      set({ zoom: Math.min(zoom * ZOOM_STEP, MAX_ZOOM) })
    },

    zoomOut: () => {
      const { zoom } = get()
      set({ zoom: Math.max(zoom / ZOOM_STEP, MIN_ZOOM) })
    },

    fitToView: () => set({ zoom: 1, scrollPosition: 0 }),

    setScrollPosition: (position: number) => set({ scrollPosition: Math.max(0, position) }),

    // State setters
    setDuration: (duration: number) =>
      set(state => ({
        duration,
        trimEnd: state.trimEnd === 0 ? duration : state.trimEnd,
      })),

    setCurrentTime: (currentTime: number) => set({ currentTime }),
    setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
    setIsLoading: (isLoading: boolean) => set({ isLoading }),
    setIsBuffering: (isBuffering: boolean) => set({ isBuffering }),

    setIsDragging: (isDragging: boolean, dragType: TimelineState['dragType'] = null) =>
      set({ isDragging, dragType: isDragging ? dragType : null }),

    // Data setters
    setWaveformData: (data: number[]) => set({ waveformData: data, waveformLoaded: true }),
    setThumbnails: (thumbnails: string[], interval: number) =>
      set({ thumbnails, thumbnailInterval: interval, thumbnailsLoaded: true }),
    setStreamUrl: (url: string | null) => set({ streamUrl: url }),
    setQualities: (qualities: VideoQuality[]) => set({ qualities }),
    setSelectedQuality: (quality: string) => set({ selectedQuality: quality }),

    // Error handling
    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    // Reset
    reset: () => set(initialState),

    initializeForVideo: (duration: number, streamUrl?: string) => {
      set({
        ...initialState,
        duration,
        trimEnd: duration,
        streamUrl: streamUrl || null,
        isLoading: false,
      })
    },

    // Markers
    addMarker: (time: number, label?: string, color?: string) => {
      const { markers, duration } = get()
      const clampedTime = Math.max(0, Math.min(time, duration))
      const newMarker: TimelineMarker = {
        id: `marker_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        time: clampedTime,
        label: label || `Marker ${markers.length + 1}`,
        color: color || '#f59e0b', // amber-500
      }
      set({ markers: [...markers, newMarker].sort((a, b) => a.time - b.time) })
    },

    removeMarker: (id: string) => {
      const { markers } = get()
      set({ markers: markers.filter(m => m.id !== id) })
    },

    updateMarker: (id: string, updates: Partial<Omit<TimelineMarker, 'id'>>) => {
      const { markers } = get()
      set({
        markers: markers.map(m => (m.id === id ? { ...m, ...updates } : m)).sort((a, b) => a.time - b.time),
      })
    },

    clearMarkers: () => set({ markers: [] }),

    goToMarker: (id: string) => {
      const { markers } = get()
      const marker = markers.find(m => m.id === id)
      if (marker) {
        set({ currentTime: marker.time })
      }
    },

    goToNextMarker: () => {
      const { markers, currentTime } = get()
      const nextMarker = markers.find(m => m.time > currentTime + 0.01)
      if (nextMarker) {
        set({ currentTime: nextMarker.time })
      }
    },

    goToPrevMarker: () => {
      const { markers, currentTime } = get()
      const prevMarkers = markers.filter(m => m.time < currentTime - 0.01)
      if (prevMarkers.length > 0) {
        set({ currentTime: prevMarkers[prevMarkers.length - 1].time })
      }
    },

    // Snapping
    setSnapConfig: (config: Partial<SnapConfig>) => {
      const { snapConfig } = get()
      set({ snapConfig: { ...snapConfig, ...config } })
    },

    toggleSnapping: () => {
      const { snapConfig } = get()
      set({ snapConfig: { ...snapConfig, enabled: !snapConfig.enabled } })
    },

    getSnapPoints: () => {
      const { markers, trimStart, trimEnd, isTrimmed, currentTime, snapConfig } = get()
      const points: number[] = []

      if (snapConfig.snapToMarkers) {
        points.push(...markers.map(m => m.time))
      }

      if (snapConfig.snapToTrimPoints && isTrimmed) {
        points.push(trimStart, trimEnd)
      }

      if (snapConfig.snapToPlayhead) {
        points.push(currentTime)
      }

      // Always snap to start/end
      points.push(0)
      const { duration } = get()
      if (duration > 0) points.push(duration)

      return [...new Set(points)].sort((a, b) => a - b)
    },

    snapTime: (time: number, pixelsPerSecond: number) => {
      const { snapConfig } = get()
      if (!snapConfig.enabled || pixelsPerSecond === 0) return time

      const snapPoints = get().getSnapPoints()
      const thresholdInSeconds = snapConfig.threshold / pixelsPerSecond

      for (const point of snapPoints) {
        if (Math.abs(time - point) <= thresholdInSeconds) {
          return point
        }
      }

      return time
    },
  })),
)

// Selectors for optimized re-renders
export const selectPlaybackState = (state: TimelineState) => ({
  isPlaying: state.isPlaying,
  currentTime: state.currentTime,
  duration: state.duration,
  playbackRate: state.playbackRate,
})

export const selectTrimState = (state: TimelineState) => ({
  trimStart: state.trimStart,
  trimEnd: state.trimEnd,
  isTrimmed: state.isTrimmed,
})

export const selectTimelineView = (state: TimelineState) => ({
  zoom: state.zoom,
  scrollPosition: state.scrollPosition,
  duration: state.duration,
})

export const selectStreamState = (state: TimelineState) => ({
  streamUrl: state.streamUrl,
  qualities: state.qualities,
  selectedQuality: state.selectedQuality,
  isLoading: state.isLoading,
  isBuffering: state.isBuffering,
})
