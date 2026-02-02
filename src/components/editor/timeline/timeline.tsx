/**
 * Timeline - Professional video timeline with waveform, thumbnails, and trim handles
 * Fully themable with CSS variables
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
import { useTranslation } from 'react-i18next'

interface TimelineProps {
  className?: string
  showWaveform?: boolean
  showThumbnails?: boolean
  thumbnails?: string[]
  onSeek?: (time: number) => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 20
const ZOOM_WHEEL_SENSITIVITY = 0.002
const TRACK_LABEL_WIDTH = 40

export function Timeline({
  className,
  showWaveform = true,
  showThumbnails = true,
  thumbnails = [],
  onSeek,
}: TimelineProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const trackContainerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)
  const [isDraggingMinimap, setIsDraggingMinimap] = useState(false)
  const [hoverTime, setHoverTime] = useState<number | null>(null)

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

  const trackAreaWidth = Math.max(0, containerWidth - TRACK_LABEL_WIDTH)
  const timelineWidth = Math.max(trackAreaWidth, trackAreaWidth * zoom)
  const pixelsPerSecond = duration > 0 ? timelineWidth / duration : 0
  const playheadPosition = currentTime * pixelsPerSecond

  const minimapScale = (containerWidth - 32) / (timelineWidth || 1)
  const viewportWidth = trackAreaWidth * minimapScale
  const viewportLeft = scrollLeft * minimapScale

  const hasMarkers = markers.length > 0
  const canZoomOut = zoom > MIN_ZOOM
  const canZoomIn = zoom < MAX_ZOOM
  const isAtStart = currentTime <= 0.01
  const isAtEnd = currentTime >= duration - 0.01

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

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => setScrollLeft(scrollContainer.scrollLeft)
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [])

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

  const handlePlayheadMouseDown = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDraggingPlayhead(true)
      setIsDragging(true, 'playhead')
    },
    [setIsDragging],
  )

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

  const handleZoomIn = useCallback(() => setZoom(Math.min(MAX_ZOOM, zoom * 1.5)), [zoom, setZoom])
  const handleZoomOut = useCallback(() => setZoom(Math.max(MIN_ZOOM, zoom / 1.5)), [zoom, setZoom])
  const handleFitToView = useCallback(() => {
    setZoom(1)
    scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }, [setZoom])
  const handleZoomSlider = useCallback((value: number[]) => setZoom(value[0]), [setZoom])

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

  const hoverPositionPx = useMemo(() => {
    if (hoverTime === null) return 0
    return hoverTime * pixelsPerSecond - scrollLeft
  }, [hoverTime, pixelsPerSecond, scrollLeft])

  const IconButton = ({
    icon: Icon,
    onClick,
    disabled = false,
    active = false,
    tooltip,
    children,
  }: {
    icon?: React.ComponentType<{ className?: string }>
    onClick: () => void
    disabled?: boolean
    active?: boolean
    tooltip: string
    children?: React.ReactNode
  }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 transition-colors',
            disabled && 'text-muted-foreground/50 cursor-not-allowed',
            !disabled && !active && 'text-muted-foreground hover:text-foreground hover:bg-muted',
            active && 'text-foreground bg-muted',
          )}
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

  return (
    <TooltipProvider delayDuration={100}>
      <div
        ref={containerRef}
        className={cn('bg-background flex flex-col overflow-hidden border select-none', className)}
      >
        {/* Toolbar */}
        <div className="bg-muted/50 flex h-9 flex-shrink-0 items-center gap-0.5 border-b px-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-7 w-7">
                <Keyboard className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{t('timelineKeyboardShortcuts')}</DialogTitle>
              </DialogHeader>
              <div className="mt-4 grid grid-cols-2 gap-6">
                {KEYBOARD_SHORTCUTS.map(category => (
                  <div key={category.category}>
                    <h3 className="mb-2 text-sm font-semibold">{category.category}</h3>
                    <div className="space-y-1">
                      {category.shortcuts.map(shortcut => (
                        <div key={shortcut.key} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{shortcut.action}</span>
                          <kbd className="bg-muted px-2 py-0.5 font-mono text-xs">{shortcut.key}</kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <div className="bg-background/50 ml-1 flex items-center border px-2 py-0.5">
            <span className="text-foreground font-mono text-sm font-semibold tabular-nums">
              {formatTimecode(currentTime)}
            </span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-muted-foreground font-mono text-xs tabular-nums">{formatTimeShort(duration)}</span>
          </div>

          <div className="bg-border mx-1.5 h-4 w-px" />

          <IconButton icon={ChevronFirst} onClick={jumpToStart} disabled={isAtStart} tooltip={t('timelineGoToStart')} />
          <IconButton icon={ChevronLeft} onClick={prevFrame} tooltip={t('timelinePrevFrame')} />
          <IconButton icon={ChevronRight} onClick={nextFrame} tooltip={t('timelineNextFrame')} />
          <IconButton icon={ChevronLast} onClick={jumpToEnd} disabled={isAtEnd} tooltip={t('timelineGoToEnd')} />

          <div className="bg-border mx-1.5 h-4 w-px" />

          <IconButton
            icon={SkipBack}
            onClick={goToPrevMarker}
            disabled={!hasMarkers}
            active={hasMarkers}
            tooltip={t('timelinePrevMarker')}
          />
          <IconButton
            icon={SkipForward}
            onClick={goToNextMarker}
            disabled={!hasMarkers}
            active={hasMarkers}
            tooltip={t('timelineNextMarker')}
          />

          <div className="flex-1" />

          <IconButton
            icon={Bookmark}
            onClick={() => addMarker(currentTime)}
            active={true}
            tooltip={t('timelineAddMarker')}
          />
          <IconButton
            icon={Magnet}
            onClick={toggleSnapping}
            active={snapConfig.enabled}
            tooltip={snapConfig.enabled ? t('timelineSnapOn') : t('timelineSnapOff')}
          />

          <div className="bg-border mx-1.5 h-4 w-px" />

          <IconButton icon={Scissors} onClick={goToTrimStart} disabled={!isTrimmed} tooltip={t('timelineInPoint')} />
          <IconButton onClick={goToTrimEnd} disabled={!isTrimmed} tooltip={t('timelineOutPoint')}>
            <Scissors className="h-4 w-4 scale-x-[-1]" />
          </IconButton>
          <IconButton icon={RotateCcw} onClick={resetTrim} disabled={!isTrimmed} tooltip={t('timelineResetTrim')} />

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <IconButton icon={Minus} onClick={handleZoomOut} disabled={!canZoomOut} tooltip={t('timelineZoomOut')} />
            <Slider
              value={[zoom]}
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.1}
              onValueChange={handleZoomSlider}
              className="mx-1 w-20"
            />
            <IconButton icon={Plus} onClick={handleZoomIn} disabled={!canZoomIn} tooltip={t('timelineZoomIn')} />
            <button
              onClick={handleFitToView}
              className="text-muted-foreground hover:text-foreground hover:bg-muted min-w-[48px] px-2 py-0.5 text-center font-mono text-[11px] transition-colors"
            >
              {Math.round(zoom * 100)}%
            </button>
            <IconButton icon={Focus} onClick={handleFitToView} tooltip={t('timelineFitToView')} />
          </div>
        </div>

        {/* Status Bar */}
        {(isTrimmed || hasMarkers || snapConfig.enabled) && (
          <div className="text-muted-foreground flex h-6 flex-shrink-0 items-center gap-4 border-b px-3 text-[11px]">
            {isTrimmed && (
              <div className="flex items-center gap-1.5">
                <Scissors className="h-3 w-3" />
                <span className="font-mono">
                  {formatTimeShort(trimStart)} → {formatTimeShort(trimEnd)}
                  <span className="ml-1.5 opacity-50">({formatTimeShort(trimEnd - trimStart)})</span>
                </span>
              </div>
            )}
            {hasMarkers && (
              <div className="flex items-center gap-1.5">
                <Bookmark className="h-3 w-3" />
                <span>
                  {markers.length} {markers.length !== 1 ? t('timelineMarkers') : t('timelineMarker')}
                </span>
              </div>
            )}
            {snapConfig.enabled && (
              <div className="flex items-center gap-1.5">
                <Magnet className="h-3 w-3" />
                <span>{t('timelineSnapEnabled')}</span>
              </div>
            )}
          </div>
        )}

        {/* Minimap - always visible */}
        <div className="h-6 flex-shrink-0 border-b px-4 py-1">
          <div
            ref={minimapRef}
            className="bg-muted/50 relative h-full cursor-pointer overflow-hidden border"
            onClick={handleMinimapClick}
            onMouseDown={handleMinimapMouseDown}
          >
            <div
              className="bg-primary absolute top-0 bottom-0 z-10 w-px"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            />
            {isTrimmed && (
              <div
                className="bg-primary/20 border-primary/50 absolute top-0 bottom-0 border-x"
                style={{
                  left: `${(trimStart / duration) * 100}%`,
                  width: `${((trimEnd - trimStart) / duration) * 100}%`,
                }}
              />
            )}
            {markers.map(marker => (
              <div
                key={marker.id}
                className="bg-foreground/50 absolute top-0 bottom-0 w-px"
                style={{ left: `${(marker.time / duration) * 100}%` }}
              />
            ))}
            {zoom > 1 && (
              <div
                className="bg-foreground/10 border-foreground/30 absolute top-0 bottom-0 border"
                style={{ left: viewportLeft, width: Math.max(viewportWidth, 24) }}
              />
            )}
          </div>
        </div>

        {/* Ruler */}
        <div className="flex flex-shrink-0 border-b">
          <div className="bg-background flex-shrink-0" style={{ width: TRACK_LABEL_WIDTH }} />
          <div className="flex-1 overflow-hidden">
            <TimelineRuler
              duration={duration}
              pixelsPerSecond={pixelsPerSecond}
              scrollPosition={scrollLeft}
              containerWidth={trackAreaWidth}
            />
          </div>
        </div>

        {/* Tracks */}
        <div ref={trackContainerRef} className="relative flex min-h-[120px] flex-1 overflow-hidden">
          <div className="bg-muted/30 z-10 flex flex-shrink-0 flex-col border-r" style={{ width: TRACK_LABEL_WIDTH }}>
            <div className="flex min-h-[60px] flex-1 items-center justify-center border-b">
              <span className="text-muted-foreground text-[10px] font-medium">V1</span>
            </div>
            {showWaveform && (
              <div className="flex h-14 items-center justify-center border-b">
                <span className="text-muted-foreground text-[10px] font-medium">A1</span>
              </div>
            )}
          </div>

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
              <div
                className="bg-muted/20 relative border-b"
                style={{ height: showWaveform ? 'calc(100% - 56px)' : '100%', minHeight: 60 }}
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
                    <span className="text-muted-foreground text-[10px]">{t('timelineVideoTrack')}</span>
                  </div>
                )}
              </div>

              {showWaveform && (
                <div className="bg-muted/10 relative h-14 border-b">
                  <WaveformTrack
                    duration={duration}
                    pixelsPerSecond={pixelsPerSecond}
                    timelineWidth={timelineWidth}
                    className="h-full"
                  />
                </div>
              )}

              {isTrimmed && (
                <>
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 left-0 bg-black/50"
                    style={{ width: trimStart * pixelsPerSecond }}
                  />
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 bg-black/50"
                    style={{ left: trimEnd * pixelsPerSecond, right: 0 }}
                  />
                  <div
                    className="border-primary/50 pointer-events-none absolute top-0 bottom-0 border-y"
                    style={{ left: trimStart * pixelsPerSecond, width: (trimEnd - trimStart) * pixelsPerSecond }}
                  />
                </>
              )}

              <TrimHandles
                trimStart={trimStart}
                trimEnd={trimEnd}
                duration={duration}
                pixelsPerSecond={pixelsPerSecond}
                onSeek={onSeek}
              />
              <TimelineMarkers pixelsPerSecond={pixelsPerSecond} />

              {hoverTime !== null && !isDraggingPlayhead && (
                <div
                  className="bg-foreground/30 pointer-events-none absolute top-0 bottom-0 z-20 w-px"
                  style={{ left: hoverPositionPx }}
                >
                  <div className="bg-popover text-popover-foreground absolute -top-6 left-1/2 -translate-x-1/2 border px-2 py-0.5 font-mono text-[10px] whitespace-nowrap shadow">
                    {formatTimecode(hoverTime)}
                  </div>
                </div>
              )}

              {/* Playhead */}
              <div className="pointer-events-none absolute top-0 bottom-0 z-30" style={{ left: playheadPosition }}>
                <div className="bg-primary absolute top-0 bottom-0 -ml-px w-0.5" />
                <div
                  className={cn(
                    'pointer-events-auto absolute -top-1 left-1/2 -translate-x-1/2 cursor-ew-resize transition-transform',
                    isDraggingPlayhead && 'scale-125',
                  )}
                  onMouseDown={handlePlayheadMouseDown}
                >
                  <div
                    className="bg-primary border-primary h-4 w-3 border"
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%)' }}
                  />
                </div>
                {isDraggingPlayhead && (
                  <div className="bg-primary text-primary-foreground absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 font-mono text-[11px] whitespace-nowrap shadow">
                    {formatTimecode(currentTime)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-muted-foreground flex h-5 flex-shrink-0 items-center justify-between border-t px-3 text-[10px]">
          <span>30 fps</span>
          <span className="opacity-50">{t('timelineCtrlScrollZoom')}</span>
          <span>{formatTimeShort(duration)}</span>
        </div>
      </div>
    </TooltipProvider>
  )
}

export default Timeline
