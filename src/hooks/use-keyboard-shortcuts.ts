/**
 * useKeyboardShortcuts - Professional video editing keyboard shortcuts
 * Supports J/K/L shuttle control, frame stepping, and trim operations
 */

import { useEffect, useCallback, useRef } from 'react'
import { useTimelineStore } from '@/stores/timeline-store'

interface KeyboardShortcutsOptions {
  enabled?: boolean
  onToggleFullscreen?: () => void
}

// Playback rates for J/K/L shuttle control
const SHUTTLE_RATES = [-4, -2, -1, -0.5, 0, 0.5, 1, 2, 4]
const NORMAL_RATE_INDEX = SHUTTLE_RATES.indexOf(1)

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true, onToggleFullscreen } = options

  const shuttleIndexRef = useRef(NORMAL_RATE_INDEX)

  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    trimStart,
    trimEnd,
    isTrimmed,
    zoom,
    togglePlay,
    play,
    pause,
    seek,
    seekRelative,
    nextFrame,
    prevFrame,
    jumpToStart,
    jumpToEnd,
    setPlaybackRate,
    setTrimStart,
    setTrimEnd,
    resetTrim,
    goToTrimStart,
    goToTrimEnd,
    zoomIn,
    zoomOut,
    fitToView,
    toggleMute,
    setVolume,
    addMarker,
    goToNextMarker,
    goToPrevMarker,
    clearMarkers,
    toggleSnapping,
  } = useTimelineStore()

  // Reset shuttle when playback stops
  useEffect(() => {
    if (!isPlaying) {
      shuttleIndexRef.current = NORMAL_RATE_INDEX
    }
  }, [isPlaying])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      const key = e.key.toLowerCase()
      const isCtrl = e.ctrlKey || e.metaKey
      const isShift = e.shiftKey

      switch (key) {
        // === PLAYBACK CONTROLS ===

        // Space - Play/Pause
        case ' ':
          e.preventDefault()
          togglePlay()
          break

        // K - Pause (and reset shuttle)
        case 'k':
          e.preventDefault()
          pause()
          setPlaybackRate(1)
          shuttleIndexRef.current = NORMAL_RATE_INDEX
          break

        // J - Reverse / Slower
        case 'j':
          e.preventDefault()
          if (shuttleIndexRef.current > 0) {
            shuttleIndexRef.current--
            const rate = SHUTTLE_RATES[shuttleIndexRef.current]
            setPlaybackRate(Math.abs(rate))
            if (rate < 0) {
              // For reverse, we need to manually seek backwards
              // HTML5 video doesn't support negative playback rates
              pause()
              const interval = setInterval(() => {
                const { isPlaying: stillPlaying, currentTime: ct } = useTimelineStore.getState()
                if (shuttleIndexRef.current >= NORMAL_RATE_INDEX) {
                  clearInterval(interval)
                  return
                }
                seek(ct + rate * 0.1) // Move backwards
              }, 100)
            } else if (rate > 0) {
              play()
            } else {
              pause()
            }
          }
          break

        // L - Forward / Faster
        case 'l':
          e.preventDefault()
          if (shuttleIndexRef.current < SHUTTLE_RATES.length - 1) {
            shuttleIndexRef.current++
            const rate = SHUTTLE_RATES[shuttleIndexRef.current]
            if (rate > 0) {
              setPlaybackRate(rate)
              play()
            }
          }
          break

        // === FRAME NAVIGATION ===

        // Left Arrow - Previous frame (or 5 sec with Shift)
        case 'arrowleft':
          e.preventDefault()
          if (isShift) {
            seekRelative(-5)
          } else if (isCtrl) {
            seekRelative(-1)
          } else {
            prevFrame()
          }
          break

        // Right Arrow - Next frame (or 5 sec with Shift)
        case 'arrowright':
          e.preventDefault()
          if (isShift) {
            seekRelative(5)
          } else if (isCtrl) {
            seekRelative(1)
          } else {
            nextFrame()
          }
          break

        // Home - Jump to start
        case 'home':
          e.preventDefault()
          jumpToStart()
          break

        // End - Jump to end
        case 'end':
          e.preventDefault()
          jumpToEnd()
          break

        // === TRIM CONTROLS ===

        // I - Set In point (trim start)
        case 'i':
          e.preventDefault()
          if (isShift) {
            goToTrimStart()
          } else {
            setTrimStart(currentTime)
          }
          break

        // O - Set Out point (trim end)
        case 'o':
          e.preventDefault()
          if (isShift) {
            goToTrimEnd()
          } else {
            setTrimEnd(currentTime)
          }
          break

        // X - Clear trim (reset to full duration)
        case 'x':
          if (isCtrl) {
            e.preventDefault()
            resetTrim()
          }
          break

        // === ZOOM CONTROLS ===

        // Plus/Equals - Zoom in
        case '=':
        case '+':
          e.preventDefault()
          zoomIn()
          break

        // Minus - Zoom out
        case '-':
          e.preventDefault()
          zoomOut()
          break

        // 0 - Fit to view
        case '0':
          if (!isCtrl) {
            e.preventDefault()
            fitToView()
          }
          break

        // === AUDIO CONTROLS ===

        // M - Toggle mute (plain M) or Add marker (Shift+M)
        case 'm':
          e.preventDefault()
          if (isShift) {
            addMarker(currentTime)
          } else {
            toggleMute()
          }
          break

        // Up Arrow - Volume up
        case 'arrowup': {
          e.preventDefault()
          const currentVol = useTimelineStore.getState().volume
          setVolume(Math.min(1, currentVol + 0.1))
          break
        }

        // Down Arrow - Volume down
        case 'arrowdown': {
          e.preventDefault()
          const vol = useTimelineStore.getState().volume
          setVolume(Math.max(0, vol - 0.1))
          break
        }

        // === VIEW CONTROLS ===

        // F - Toggle fullscreen
        case 'f':
          e.preventDefault()
          onToggleFullscreen?.()
          break

        // === QUICK SEEK ===

        // Number keys 1-9 - Jump to percentage of video
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9':
          if (!isCtrl) {
            e.preventDefault()
            const percentage = parseInt(key) / 10
            const targetDuration = isTrimmed ? trimEnd - trimStart : duration
            const targetTime = isTrimmed ? trimStart + targetDuration * percentage : duration * percentage
            seek(targetTime)
          }
          break

        // === MARKERS ===

        // [ - Go to previous marker
        case '[':
          e.preventDefault()
          goToPrevMarker()
          break

        // ] - Go to next marker
        case ']':
          e.preventDefault()
          goToNextMarker()
          break

        // Backspace/Delete with Ctrl - Clear all markers
        case 'backspace':
        case 'delete':
          if (isCtrl && isShift) {
            e.preventDefault()
            clearMarkers()
          }
          break

        // S - Toggle snapping
        case 's':
          if (isShift) {
            e.preventDefault()
            toggleSnapping()
          }
          break

        default:
          break
      }
    },
    [
      togglePlay,
      play,
      pause,
      seek,
      seekRelative,
      nextFrame,
      prevFrame,
      jumpToStart,
      jumpToEnd,
      setPlaybackRate,
      setTrimStart,
      setTrimEnd,
      resetTrim,
      goToTrimStart,
      goToTrimEnd,
      zoomIn,
      zoomOut,
      fitToView,
      toggleMute,
      setVolume,
      addMarker,
      goToNextMarker,
      goToPrevMarker,
      clearMarkers,
      toggleSnapping,
      currentTime,
      duration,
      trimStart,
      trimEnd,
      isTrimmed,
      onToggleFullscreen,
    ],
  )

  // Add/remove event listener
  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])

  return {
    // Expose shuttle control state
    shuttleRate: SHUTTLE_RATES[shuttleIndexRef.current],
    resetShuttle: () => {
      shuttleIndexRef.current = NORMAL_RATE_INDEX
      setPlaybackRate(1)
    },
  }
}

// Keyboard shortcuts reference for UI display
export const KEYBOARD_SHORTCUTS = [
  {
    category: 'Playback',
    shortcuts: [
      { key: 'Space', action: 'Play/Pause' },
      { key: 'K', action: 'Pause' },
      { key: 'J', action: 'Slower/Reverse' },
      { key: 'L', action: 'Faster/Forward' },
    ],
  },
  {
    category: 'Navigation',
    shortcuts: [
      { key: '←', action: 'Previous frame' },
      { key: '→', action: 'Next frame' },
      { key: 'Shift + ←', action: 'Back 5 seconds' },
      { key: 'Shift + →', action: 'Forward 5 seconds' },
      { key: 'Home', action: 'Go to start' },
      { key: 'End', action: 'Go to end' },
      { key: '1-9', action: 'Jump to 10%-90%' },
    ],
  },
  {
    category: 'Trimming',
    shortcuts: [
      { key: 'I', action: 'Set In point' },
      { key: 'O', action: 'Set Out point' },
      { key: 'Shift + I', action: 'Go to In point' },
      { key: 'Shift + O', action: 'Go to Out point' },
      { key: 'Ctrl + X', action: 'Clear trim' },
    ],
  },
  {
    category: 'Zoom',
    shortcuts: [
      { key: '+', action: 'Zoom in' },
      { key: '-', action: 'Zoom out' },
      { key: '0', action: 'Fit to view' },
    ],
  },
  {
    category: 'Audio',
    shortcuts: [
      { key: 'M', action: 'Toggle mute' },
      { key: '↑', action: 'Volume up' },
      { key: '↓', action: 'Volume down' },
    ],
  },
  { category: 'View', shortcuts: [{ key: 'F', action: 'Toggle fullscreen' }] },
  {
    category: 'Markers',
    shortcuts: [
      { key: 'Shift + M', action: 'Add marker' },
      { key: '[', action: 'Previous marker' },
      { key: ']', action: 'Next marker' },
      { key: 'Shift + S', action: 'Toggle snapping' },
    ],
  },
]

export default useKeyboardShortcuts
