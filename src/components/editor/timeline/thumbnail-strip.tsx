/**
 * ThumbnailStrip - Video thumbnail strip for timeline preview
 */

import { cn } from '@/utils/tailwind'
import { useMemo } from 'react'

interface ThumbnailStripProps {
  thumbnails: string[]
  duration: number
  pixelsPerSecond: number
  timelineWidth: number
  className?: string
  thumbnailInterval?: number
}

export function ThumbnailStrip({
  thumbnails,
  duration,
  pixelsPerSecond,
  timelineWidth,
  className,
  thumbnailInterval = 10,
}: ThumbnailStripProps) {
  // Use full timeline width since labels are now outside the scrollable area
  const stripWidth = Math.max(100, timelineWidth)
  const thumbnailItems = useMemo(() => {
    if (thumbnails.length === 0 || duration === 0) return []

    const items: Array<{
      src: string
      x: number
      width: number
      time: number
    }> = []

    const thumbnailWidth = thumbnailInterval * pixelsPerSecond

    thumbnails.forEach((src, index) => {
      const time = index * thumbnailInterval
      if (time > duration) return

      items.push({
        src,
        x: time * pixelsPerSecond,
        width: Math.min(thumbnailWidth, (duration - time) * pixelsPerSecond),
        time,
      })
    })

    return items
  }, [thumbnails, duration, pixelsPerSecond, thumbnailInterval])

  if (thumbnails.length === 0) {
    return (
      <div className={cn('bg-muted/30 flex items-center justify-center', className)}>
        <span className="text-muted-foreground text-xs">Video thumbnails</span>
      </div>
    )
  }

  return (
    <div className={cn('relative overflow-hidden', className)} style={{ width: stripWidth }}>
      {thumbnailItems.map(({ src, x, width, time }) => (
        <div key={time} className="absolute top-0 bottom-0 overflow-hidden" style={{ left: x, width }}>
          <img
            src={src}
            alt={`Frame at ${formatTime(time)}`}
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
          <div className="bg-border absolute inset-y-0 right-0 w-px" />
        </div>
      ))}
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default ThumbnailStrip
