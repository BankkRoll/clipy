/**
 * Timeline - Professional video timeline with waveform, thumbnails, and trim handles
 * Advanced features: minimap, zoom slider, proper overflow handling, keyboard shortcuts
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Bookmark,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Focus,
  Keyboard,
  Magnet,
  Minus,
  Plus,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
} from 'lucide-react'
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { KEYBOARD_SHORTCUTS } from '@/hooks/use-keyboard-shortcuts'
import { Slider } from '@/components/ui/slider'
import { useTimelineStore } from '@/stores/timeline-store'
import { cn } from '@/utils/tailwind'
import { ThumbnailStrip } from './thumbnail-strip'
import { TimelineMarkers } from './timeline-markers'
import { TimelineRuler } from './timeline-ruler'
import { TrimHandles } from './trim-handles'
import { WaveformTrack } from './waveform-track'

interface TimelineProps {
  className?: string
  showWaveform?: boolean
  showThumbnails?: boolean
  thumbnails?: string[]
  onSeek?: (time: number) => void
}

// Constants
const MIN_ZOOM = 0.5
const MAX_ZOOM = 20
const ZOOM_WHEEL_SENSITIVITY = 0.002
const TRACK_LABEL_WIDTH = 44

export function Timeline({
  className,
  showWaveform = true,
  showThumbnails = true,
  thumbnails = [],
  onSeek,
}: TimelineProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const trackContainerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  // Local state
  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)
  const [isDraggingMinimap, setIsDraggingMinimap] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)

  // Store
  const {
    duration,
    currentTime,
    trimStart,
    trimEnd,
    isTrimmed,
    zoom,
    thumbnailInterval,
    markers,
    snapConfig,
    seek,
    setIsDragging,
    setZoom,
    addMarker,
    toggleSnapping,
    snapTime,
    resetTrim,
    goToTrimStart,
    goToTrimEnd,
    jumpToStart,
    jumpToEnd,
    prevFrame,
    nextFrame,
    goToPrevMarker,
    goToNextMarker,
  } = useTimelineStore()

  // Computed values
  const trackAreaWidth = Math.max(0, containerWidth - TRACK_LABEL_WIDTH)
  const timelineWidth = Math.max(trackAreaWidth, trackAreaWidth * zoom)
  const pixelsPerSecond = duration > 0 ? timelineWidth / duration : 0
  const playheadPosition = currentTime * pixelsPerSecond

  // Minimap calculations
  const minimapScale = (containerWidth - 32) / (timelineWidth || 1)
  const viewportWidth = trackAreaWidth * minimapScale
  const viewportLeft = scrollLeft * minimapScale

  // Derived states for button colors
  const hasMarkers = markers.length > 0
  const canZoomOut = zoom > MIN_ZOOM
  const canZoomIn = zoom < MAX_ZOOM
  const isAtStart = currentTime <= 0.01
  const isAtEnd = currentTime >= duration - 0.01

  // Track container width
  useEffect(() => {
    const container = trackContainerRef.current
    if (!container) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Track scroll position
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => setScrollLeft(scrollContainer.scrollLeft)
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll to follow playhead
  useEffect(() => {
    if (!scrollContainerRef.current || isDraggingPlayhead) return

    const container = scrollContainerRef.current
    const viewportW = container.clientWidth
    const margin = viewportW * 0.15

    if (playheadPosition < scrollLeft + margin) {
      container.scrollTo({ left: Math.max(0, playheadPosition - margin), behavior: 'smooth' })
    } else if (playheadPosition > scrollLeft + viewportW - margin) {
      container.scrollTo({ left: playheadPosition - viewportW + margin, behavior: 'smooth' })
    }
  }, [playheadPosition, isDraggingPlayhead, scrollLeft])

  // Calculate time from mouse position
  const getTimeFromMouseEvent = useCallback(
    (e: MouseEvent | globalThis.MouseEvent): number => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || pixelsPerSecond === 0) return 0

      const mouseX = e.clientX - rect.left
      const time = (mouseX + scrollLeft) / pixelsPerSecond
      return Math.max(0, Math.min(time, duration))
    },
    [scrollLeft, pixelsPerSecond, duration],
  )

  // Timeline click handler
  const handleTimelineClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isDraggingPlayhead) return
      const rawTime = getTimeFromMouseEvent(e)
      const snappedTime = snapTime(rawTime, pixelsPerSecond)
      seek(snappedTime)
      onSeek?.(snappedTime)
    },
    [getTimeFromMouseEvent, pixelsPerSecond, seek, onSeek, snapTime, isDraggingPlayhead],
  )

  // Playhead drag handlers
  const handlePlayheadMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingPlayhead(true)
      setIsDragging(true, 'playhead')
    },
    [setIsDragging],
  )

  // Global mouse move/up for playhead dragging
  useEffect(() => {
    if (!isDraggingPlayhead) return

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const rawTime = getTimeFromMouseEvent(e)
      const snappedTime = snapTime(rawTime, pixelsPerSecond)
      seek(snappedTime)
      onSeek?.(snappedTime)
    }

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false)
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingPlayhead, getTimeFromMouseEvent, pixelsPerSecond, seek, onSeek, snapTime, setIsDragging])

  // Hover tracking
  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isDraggingPlayhead) return
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return

      const mouseX = e.clientX - rect.left
      const time = (mouseX + scrollLeft) / pixelsPerSecond
      setHoverTime(Math.max(0, Math.min(time, duration)))
    },
    [scrollLeft, pixelsPerSecond, duration, isDraggingPlayhead],
  )

  const handleMouseLeave = useCallback(() => setHoverTime(null), [])

  // Zoom with mouse wheel
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()

      const rect = scrollContainerRef.current?.getBoundingClientRect()
      if (!rect) return

      const delta = -e.deltaY * ZOOM_WHEEL_SENSITIVITY
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (1 + delta)))

      const cursorX = e.clientX - rect.left + scrollLeft
      const cursorTime = cursorX / pixelsPerSecond

      setZoom(newZoom)

      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return
        const newPPS = duration > 0 ? (trackAreaWidth * newZoom) / duration : 0
        const newCursorX = cursorTime * newPPS
        scrollContainerRef.current.scrollLeft = newCursorX - (e.clientX - rect.left)
      })
    },
    [zoom, scrollLeft, pixelsPerSecond, duration, trackAreaWidth, setZoom],
  )

  // Zoom controls
  const handleZoomIn = useCallback(() => setZoom(Math.min(MAX_ZOOM, zoom * 1.5)), [zoom, setZoom])
  const handleZoomOut = useCallback(() => setZoom(Math.max(MIN_ZOOM, zoom / 1.5)), [zoom, setZoom])
  const handleFitToView = useCallback(() => {
    setZoom(1)
    scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [setZoom])
  const handleZoomSlider = useCallback((value: number[]) => setZoom(value[0]), [setZoom])

  // Minimap handlers
  const handleMinimapClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!minimapRef.current || !scrollContainerRef.current) return
      const rect = minimapRef.current.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const targetScrollLeft = clickX / minimapScale - trackAreaWidth / 2
      scrollContainerRef.current.scrollTo({ left: Math.max(0, targetScrollLeft), behavior: 'smooth' })
    },
    [minimapScale, trackAreaWidth],
  )

  const handleMinimapMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault()
    setIsDraggingMinimap(true)
  }, [])

  useEffect(() => {
    if (!isDraggingMinimap) return

    const handleMove = (e: globalThis.MouseEvent) => {
      if (!minimapRef.current || !scrollContainerRef.current) return
      const rect = minimapRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      scrollContainerRef.current.scrollLeft = Math.max(0, mouseX / minimapScale - trackAreaWidth / 2)
    }

    const handleUp = () => setIsDraggingMinimap(false)

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [isDraggingMinimap, minimapScale, trackAreaWidth])

  // Time formatting
  const formatTimecode = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const frames = Math.floor((seconds % 1) * 30)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
  }

  const formatTimeShort = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Hover position in pixels relative to visible area
  const hoverPositionPx = useMemo(() => {
    if (hoverTime === null) return 0
    return hoverTime * pixelsPerSecond - scrollLeft
  }, [hoverTime, pixelsPerSecond, scrollLeft])

  // Icon button helper
  const IconButton = ({
    icon: Icon,
    onClick,
    disabled = false,
    active = false,
    color = 'default',
    tooltip,
    children,
  }: {
    icon?: React.ComponentType<{ className?: string }>
    onClick: () => void
    disabled?: boolean
    active?: boolean
    color?: 'default' | 'amber' | 'cyan' | 'blue' | 'red' | 'green'
    tooltip: string
    children?: React.ReactNode
  }) => {
    const colorClasses = {
      default: disabled ? 'text-zinc-600 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-700',
      amber: disabled
        ? 'text-zinc-600 cursor-not-allowed'
        : active
          ? 'text-amber-400 hover:text-amber-300 hover:bg-zinc-700'
          : 'text-amber-500/50 hover:text-amber-400 hover:bg-zinc-700',
      cyan: disabled
        ? 'text-zinc-600 cursor-not-allowed'
        : active
          ? 'text-cyan-400 hover:text-cyan-300 hover:bg-zinc-700 bg-cyan-500/10'
          : 'text-zinc-500 hover:text-cyan-400 hover:bg-zinc-700',
      blue: disabled ? 'text-zinc-600 cursor-not-allowed' : 'text-blue-400 hover:text-blue-300 hover:bg-zinc-700',
      red: disabled ? 'text-zinc-600 cursor-not-allowed' : 'text-red-400 hover:text-red-300 hover:bg-zinc-700',
      green: disabled
        ? 'text-zinc-600 cursor-not-allowed'
        : 'text-emerald-400 hover:text-emerald-300 hover:bg-zinc-700',
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7 transition-colors', colorClasses[color])}
            onClick={onClick}
            disabled={disabled}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div
        ref={containerRef}
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900 select-none',
          className,
        )}
      >
        {/* ═══════════════ TOOLBAR ═══════════════ */}
        <div className="flex h-10 flex-shrink-0 items-center gap-0.5 border-b border-zinc-800 bg-zinc-950/80 px-2">
          {/* Shortcuts + Timecode */}
          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Keyboard Shortcuts</DialogTitle>
              </DialogHeader>
              <div className="mt-4 grid grid-cols-2 gap-6">
                {KEYBOARD_SHORTCUTS.map(category => (
                  <div key={category.category}>
                    <h3 className="mb-2 text-sm font-semibold">{category.category}</h3>
                    <div className="space-y-1">
                      {category.shortcuts.map(shortcut => (
                        <div key={shortcut.key} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{shortcut.action}</span>
                          <kbd className="bg-muted rounded px-2 py-0.5 font-mono text-xs">{shortcut.key}</kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <div className="ml-1 flex items-center rounded border border-zinc-800/50 bg-black/40 px-2 py-0.5">
            <span className="font-mono text-sm font-semibold tracking-tight text-emerald-400 tabular-nums">
              {formatTimecode(currentTime)}
            </span>
            <span className="mx-1 text-zinc-600">/</span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums">{formatTimeShort(duration)}</span>
          </div>

          <div className="mx-1.5 h-4 w-px bg-zinc-700/50" />

          {/* Navigation */}
          <IconButton
            icon={ChevronFirst}
            onClick={jumpToStart}
            disabled={isAtStart}
            color="green"
            tooltip="Go to Start (Home)"
          />
          <IconButton icon={ChevronLeft} onClick={prevFrame} color="default" tooltip="Previous Frame (,)" />
          <IconButton icon={ChevronRight} onClick={nextFrame} color="default" tooltip="Next Frame (.)" />
          <IconButton
            icon={ChevronLast}
            onClick={jumpToEnd}
            disabled={isAtEnd}
            color="green"
            tooltip="Go to End (End)"
          />

          <div className="mx-1.5 h-4 w-px bg-zinc-700/50" />

          {/* Marker Navigation */}
          <IconButton
            icon={SkipBack}
            onClick={goToPrevMarker}
            disabled={!hasMarkers}
            color="amber"
            active={hasMarkers}
            tooltip="Prev Marker"
          />
          <IconButton
            icon={SkipForward}
            onClick={goToNextMarker}
            disabled={!hasMarkers}
            color="amber"
            active={hasMarkers}
            tooltip="Next Marker"
          />

          <div className="flex-1" />

          {/* Tools - no background, blend into toolbar */}
          <IconButton
            icon={Bookmark}
            onClick={() => addMarker(currentTime)}
            color="amber"
            active={true}
            tooltip="Add Marker (M)"
          />
          <IconButton
            icon={Magnet}
            onClick={toggleSnapping}
            color="cyan"
            active={snapConfig.enabled}
            tooltip={`Snap ${snapConfig.enabled ? 'ON' : 'OFF'} (S)`}
          />

          <div className="mx-1.5 h-4 w-px bg-zinc-700/50" />

          {/* Trim controls */}
          <IconButton
            icon={Scissors}
            onClick={goToTrimStart}
            disabled={!isTrimmed}
            color="blue"
            tooltip="In Point (I)"
          />
          <IconButton onClick={goToTrimEnd} disabled={!isTrimmed} color="blue" tooltip="Out Point (O)">
            <Scissors className="h-4 w-4 scale-x-[-1]" />
          </IconButton>
          <IconButton icon={RotateCcw} onClick={resetTrim} disabled={!isTrimmed} color="default" tooltip="Reset Trim" />

          <div className="flex-1" />

          {/* Zoom */}
          <div className="flex items-center gap-1">
            <IconButton
              icon={Minus}
              onClick={handleZoomOut}
              disabled={!canZoomOut}
              color="default"
              tooltip="Zoom Out (-)"
            />

            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.1}
              onValueChange={handleZoomSlider}
              className="mx-1 w-24"
            />

            <IconButton
              icon={Plus}
              onClick={handleZoomIn}
              disabled={!canZoomIn}
              color="default"
              tooltip="Zoom In (+)"
            />

            <button
              onClick={handleFitToView}
              className="min-w-[52px] rounded px-2 py-0.5 text-center font-mono text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
            >
              {Math.round(zoom * 100)}%
            </button>

            <IconButton icon={Focus} onClick={handleFitToView} color="default" tooltip="Fit to View (0)" />
          </div>
        </div>

        {/* ═══════════════ STATUS BAR ═══════════════ */}
        {(isTrimmed || hasMarkers || snapConfig.enabled) && (
          <div className="flex h-6 flex-shrink-0 items-center gap-4 border-b border-zinc-800/50 bg-zinc-950/50 px-3 text-[11px]">
            {isTrimmed && (
              <div className="flex items-center gap-1.5 text-blue-400">
                <Scissors className="h-3 w-3" />
                <span className="font-mono">
                  {formatTimeShort(trimStart)} → {formatTimeShort(trimEnd)}
                  <span className="ml-1.5 text-zinc-500">({formatTimeShort(trimEnd - trimStart)})</span>
                </span>
              </div>
            )}
            {hasMarkers && (
              <div className="flex items-center gap-1.5 text-amber-400">
                <Bookmark className="h-3 w-3" />
                <span>
                  {markers.length} marker{markers.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {snapConfig.enabled && (
              <div className="flex items-center gap-1.5 text-cyan-400">
                <Magnet className="h-3 w-3" />
                <span>Snap</span>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════ MINIMAP ═══════════════ */}
        {zoom > 1.1 && (
          <div className="h-7 flex-shrink-0 border-b border-zinc-800/50 bg-zinc-950/60 px-4 py-1.5">
            <div
              ref={minimapRef}
              className="relative h-full cursor-pointer overflow-hidden rounded border border-zinc-700/30 bg-zinc-800/40"
              onClick={handleMinimapClick}
              onMouseDown={handleMinimapMouseDown}
            >
              {/* Playhead on minimap */}
              <div
                className="absolute top-0 bottom-0 z-10 w-0.5 bg-red-500"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />

              {/* Trim region on minimap */}
              {isTrimmed && (
                <div
                  className="absolute top-0 bottom-0 border-x border-blue-400/50 bg-blue-500/20"
                  style={{
                    left: `${(trimStart / duration) * 100}%`,
                    width: `${((trimEnd - trimStart) / duration) * 100}%`,
                  }}
                />
              )}

              {/* Markers on minimap */}
              {markers.map(marker => (
                <div
                  key={marker.id}
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500/70"
                  style={{ left: `${(marker.time / duration) * 100}%` }}
                />
              ))}

              {/* Viewport indicator */}
              <div
                className="absolute top-0 bottom-0 rounded-sm border border-white/40 bg-white/10"
                style={{ left: viewportLeft, width: Math.max(viewportWidth, 24) }}
              />
            </div>
          </div>
        )}

        {/* ═══════════════ RULER ═══════════════ */}
        <div className="flex flex-shrink-0 border-b border-zinc-800">
          <div className="flex-shrink-0 bg-zinc-900" style={{ width: TRACK_LABEL_WIDTH }} />
          <div className="flex-1 overflow-hidden">
            <TimelineRuler
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              scrollPosition={scrollLeft}
              containerWidth={trackAreaWidth}
            />
          </div>
        </div>

        {/* ═══════════════ TRACKS ═══════════════ */}
        <div ref={trackContainerRef} className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Track Labels */}
          <div
            className="z-10 flex flex-shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/80"
            style={{ width: TRACK_LABEL_WIDTH }}
          >
            <div className="flex min-h-[50px] flex-1 items-center justify-center border-b border-zinc-800/50">
              <span className="text-[10px] font-semibold tracking-wider text-zinc-500">V1</span>
            </div>
            {showWaveform && (
              <div className="flex h-12 items-center justify-center border-b border-zinc-800/50">
                <span className="text-[10px] font-semibold tracking-wider text-zinc-500">A1</span>
              </div>
            )}
          </div>

          {/* Scrollable Track Content */}
          <div ref={scrollContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden" onWheel={handleWheel}>
            <div
              ref={trackRef}
              data-timeline-track
              className={cn('relative', isDraggingPlayhead ? 'cursor-ew-resize' : 'cursor-crosshair')}
              style={{ width: timelineWidth, height: '100%' }}
              onClick={handleTimelineClick}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {/* Video Track */}
              <div
                className="relative border-b border-zinc-800/50 bg-zinc-800/20"
                style={{ height: showWaveform ? 'calc(100% - 48px)' : '100%', minHeight: 50 }}
              >
                {showThumbnails && thumbnails.length > 0 ? (
                  <ThumbnailStrip
                    thumbnails={thumbnails}
                    duration={duration}
                    pixelsPerSecond={pixelsPerSecond}
                    timelineWidth={timelineWidth}
                    thumbnailInterval={thumbnailInterval}
                    className="h-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <span className="text-[10px] text-zinc-600">Video Track</span>
                  </div>
                )}
              </div>

              {/* Audio Track */}
              {showWaveform && (
                <div className="relative h-12 border-b border-zinc-800/50 bg-zinc-800/10">
                  <WaveformTrack
                    duration={duration}
                    pixelsPerSecond={pixelsPerSecond}
                    timelineWidth={timelineWidth}
                    className="h-full"
                  />
                </div>
              )}

              {/* Trim Overlays */}
              {isTrimmed && (
                <>
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 left-0 bg-black/60"
                    style={{ width: trimStart * pixelsPerSecond }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 bg-black/60"
                    style={{ left: trimEnd * pixelsPerSecond, right: 0 }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 border-y-2 border-blue-500/70"
                    style={{ left: trimStart * pixelsPerSecond, width: (trimEnd - trimStart) * pixelsPerSecond }}
                  />
                </>
              )}

              {/* Trim Handles */}
              <TrimHandles
                trimStart={trimStart}
                trimEnd={trimEnd}
                duration={duration}
                pixelsPerSecond={pixelsPerSecond}
                onSeek={onSeek}
              />

              {/* Timeline Markers */}
              <TimelineMarkers pixelsPerSecond={pixelsPerSecond} />

              {/* Hover Line */}
              {hoverTime !== null && !isDraggingPlayhead && (
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white/30"
                  style={{ left: hoverPositionPx }}
                >
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-zinc-600 bg-zinc-800 px-2 py-0.5 font-mono text-[10px] whitespace-nowrap text-zinc-200 shadow-lg">
                    {formatTimecode(hoverTime)}
                  </div>
                </div>
              )}

              {/* ═══════════════ PLAYHEAD ═══════════════ */}
              <div className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: playheadPosition }}>
                {/* Line */}
                <div className="absolute top-0 bottom-0 -ml-px w-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]" />

                {/* Handle */}
                <div
                  className={cn(
                    'pointer-events-auto absolute -top-1 left-1/2 -translate-x-1/2 cursor-ew-resize transition-transform',
                    isDraggingPlayhead && 'scale-125',
                  )}
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div
                    className="h-5 w-4 border border-red-400 bg-red-500 shadow-lg"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)' }}
                  />
                </div>

                {/* Time tooltip while dragging */}
                {isDraggingPlayhead && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 rounded border border-red-400 bg-red-500 px-2.5 py-1 font-mono text-[11px] whitespace-nowrap text-white shadow-xl">
                    {formatTimecode(currentTime)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div className="flex h-6 flex-shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950/80 px-3 text-[10px] text-zinc-500">
          <span>30 fps</span>
          <span className="text-zinc-600">Ctrl+Scroll to zoom • Click to seek</span>
          <span>{formatTimeShort(duration)}</span>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default Timeline
