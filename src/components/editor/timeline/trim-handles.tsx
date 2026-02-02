/**
 * TrimHandles - Draggable trim in/out point handles
 */

import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/utils/tailwind'
import { useTimelineStore } from '@/stores/timeline-store'

interface TrimHandlesProps {
  trimStart: number
  trimEnd: number
  duration: number
  pixelsPerSecond: number
  className?: string
  onSeek?: (time: number) => void
}

export function TrimHandles({ trimStart, trimEnd, duration, pixelsPerSecond, onSeek }: TrimHandlesProps) {
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const { setTrimStart, setTrimEnd, setIsDragging, seek } = useTimelineStore()

  const startX = trimStart * pixelsPerSecond
  const endX = trimEnd * pixelsPerSecond

  const pixelToTime = useCallback(
    (pixelX: number): number => {
      if (pixelsPerSecond === 0) return 0
      return Math.max(0, Math.min(pixelX / pixelsPerSecond, duration))
    },
    [pixelsPerSecond, duration],
  )

  const handleMouseDown = useCallback(
    (handle: 'start' | 'end') => (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDraggingHandle(handle)
      setIsDragging(true, handle === 'start' ? 'trim-start' : 'trim-end')

      const timelineTrack = (e.target as HTMLElement).closest('[data-timeline-track]')
      if (timelineTrack) {
        containerRef.current = timelineTrack as HTMLDivElement
      }
    },
    [setIsDragging],
  )

  useEffect(() => {
    if (!draggingHandle) return

    const handleDocumentMouseMove = (e: globalThis.MouseEvent) => {
      if (!draggingHandle || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const scrollLeft = containerRef.current.parentElement?.scrollLeft || 0
      const relativeX = e.clientX - containerRect.left + scrollLeft
      const time = pixelToTime(relativeX)

      if (draggingHandle === 'start') {
        const newStart = Math.max(0, Math.min(time, trimEnd - 0.1))
        setTrimStart(newStart)
        seek(newStart)
        onSeek?.(newStart)
      } else {
        const newEnd = Math.min(duration, Math.max(time, trimStart + 0.1))
        setTrimEnd(newEnd)
        seek(newEnd)
        onSeek?.(newEnd)
      }
    }

    const handleDocumentMouseUp = () => {
      setDraggingHandle(null)
      setIsDragging(false)
      containerRef.current = null
    }

    document.addEventListener('mousemove', handleDocumentMouseMove)
    document.addEventListener('mouseup', handleDocumentMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }, [draggingHandle, pixelToTime, trimStart, trimEnd, duration, setTrimStart, setTrimEnd, setIsDragging, seek, onSeek])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <>
      {/* Start handle */}
      <div
        className={cn('group absolute top-0 bottom-0 z-20 w-4 cursor-ew-resize', draggingHandle === 'start' && 'z-30')}
        style={{ left: startX - 8 }}
        onMouseDown={handleMouseDown('start')}
      >
        <div
          className={cn(
            'bg-primary absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2',
            draggingHandle === 'start' && 'bg-primary',
          )}
        />
        <div
          className={cn(
            'bg-primary absolute top-0 left-1/2 flex h-5 w-3 -translate-x-1/2 items-center justify-center rounded-b',
          )}
        >
          <div className="border-primary-foreground/50 h-2 w-1 border-x" />
        </div>
        <span className="text-primary absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-medium">I</span>
        {draggingHandle === 'start' && (
          <div className="bg-primary text-primary-foreground absolute -top-8 left-1/2 -translate-x-1/2 rounded px-2 py-0.5 font-mono text-xs whitespace-nowrap">
            {formatTime(trimStart)}
          </div>
        )}
      </div>

      {/* End handle */}
      <div
        className={cn('group absolute top-0 bottom-0 z-20 w-4 cursor-ew-resize', draggingHandle === 'end' && 'z-30')}
        style={{ left: endX - 8 }}
        onMouseDown={handleMouseDown('end')}
      >
        <div
          className={cn(
            'bg-primary absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2',
            draggingHandle === 'end' && 'bg-primary',
          )}
        />
        <div
          className={cn(
            'bg-primary absolute top-0 left-1/2 flex h-5 w-3 -translate-x-1/2 items-center justify-center rounded-b',
          )}
        >
          <div className="border-primary-foreground/50 h-2 w-1 border-x" />
        </div>
        <span className="text-primary absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-medium">O</span>
        {draggingHandle === 'end' && (
          <div className="bg-primary text-primary-foreground absolute -top-8 left-1/2 -translate-x-1/2 rounded px-2 py-0.5 font-mono text-xs whitespace-nowrap">
            {formatTime(trimEnd)}
          </div>
        )}
      </div>
    </>
  )
}

export default TrimHandles
