/**
 * TimelineRuler - Time ruler with tick marks and labels
 */

import { cn } from '@/utils/tailwind'
import { useMemo } from 'react'

interface TimelineRulerProps {
  duration: number
  pixelsPerSecond: number
  scrollPosition: number
  containerWidth: number
  className?: string
}

export function TimelineRuler({
  duration,
  pixelsPerSecond,
  scrollPosition,
  containerWidth,
  className,
}: TimelineRulerProps) {
  const tickConfig = useMemo(() => {
    if (pixelsPerSecond > 100) {
      return { major: 1, minor: 0.1, format: 'precise' }
    } else if (pixelsPerSecond > 50) {
      return { major: 1, minor: 0.5, format: 'precise' }
    } else if (pixelsPerSecond > 20) {
      return { major: 5, minor: 1, format: 'seconds' }
    } else if (pixelsPerSecond > 5) {
      return { major: 30, minor: 5, format: 'minutes' }
    } else if (pixelsPerSecond > 1) {
      return { major: 60, minor: 10, format: 'minutes' }
    } else {
      return { major: 300, minor: 60, format: 'minutes' }
    }
  }, [pixelsPerSecond])

  const ticks = useMemo(() => {
    const result: Array<{ time: number; x: number; isMajor: boolean; label: string | null }> = []

    const startTime = Math.max(0, scrollPosition / pixelsPerSecond)
    const endTime = Math.min(duration, (scrollPosition + containerWidth) / pixelsPerSecond)
    const firstTick = Math.floor(startTime / tickConfig.minor) * tickConfig.minor

    for (let time = firstTick; time <= endTime + tickConfig.minor; time += tickConfig.minor) {
      if (time < 0 || time > duration) continue

      const x = time * pixelsPerSecond - scrollPosition
      const isMajor = Math.abs(time % tickConfig.major) < 0.001 || time === 0

      let label: string | null = null
      if (isMajor) {
        label = formatTime(time, tickConfig.format)
      }

      result.push({ time, x, isMajor, label })
    }

    return result
  }, [duration, pixelsPerSecond, scrollPosition, containerWidth, tickConfig])

  return (
    <div className={cn('border-border bg-muted/50 relative h-6 overflow-hidden border-b select-none', className)}>
      <svg className="absolute inset-0 h-full w-full">
        {ticks.map(({ time, x, isMajor, label }) => (
          <g key={time}>
            <line
              x1={x}
              y1={isMajor ? 4 : 14}
              x2={x}
              y2={24}
              stroke="currentColor"
              strokeWidth={isMajor ? 1 : 0.5}
              className={isMajor ? 'text-foreground/50' : 'text-foreground/20'}
            />
            {label && (
              <text x={x + 3} y={12} className="fill-muted-foreground text-[10px]" style={{ userSelect: 'none' }}>
                {label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  )
}

function formatTime(seconds: number, format: string): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.round((seconds % 1) * 10)

  switch (format) {
    case 'precise':
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms}`
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}.${ms}`

    case 'seconds':
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`

    case 'minutes':
    default:
      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      }
      return `${minutes}:${secs.toString().padStart(2, '0')}`
  }
}

export default TimelineRuler
