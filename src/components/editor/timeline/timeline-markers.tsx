/**
 * TimelineMarkers - Display and interact with timeline markers
 */

import { MouseEvent, useCallback, useState } from 'react'

import { cn } from '@/utils/tailwind'
import { useTimelineStore, TimelineMarker } from '@/stores/timeline-store'

interface TimelineMarkersProps {
  pixelsPerSecond: number
  className?: string
}

export function TimelineMarkers({ pixelsPerSecond, className }: TimelineMarkersProps) {
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null)
  const [editingMarker, setEditingMarker] = useState<string | null>(null)

  const { markers, removeMarker, updateMarker, goToMarker } = useTimelineStore()

  const handleMarkerClick = useCallback(
    (e: MouseEvent, marker: TimelineMarker) => {
      e.stopPropagation()
      goToMarker(marker.id)
    },
    [goToMarker],
  )

  const handleMarkerDoubleClick = useCallback((e: MouseEvent, marker: TimelineMarker) => {
    e.stopPropagation()
    setEditingMarker(marker.id)
  }, [])

  const handleMarkerContextMenu = useCallback(
    (e: MouseEvent, marker: TimelineMarker) => {
      e.preventDefault()
      e.stopPropagation()
      removeMarker(marker.id)
    },
    [removeMarker],
  )

  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      updateMarker(id, { label })
      setEditingMarker(null)
    },
    [updateMarker],
  )

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  if (markers.length === 0) return null

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {markers.map(marker => {
        const x = marker.time * pixelsPerSecond
        const isHovered = hoveredMarker === marker.id
        const isEditing = editingMarker === marker.id

        return (
          <div key={marker.id} className="pointer-events-auto absolute top-0 bottom-0 z-25" style={{ left: x }}>
            {/* Marker line */}
            <div
              className={cn(
                'absolute top-0 bottom-0 w-0.5 -translate-x-1/2 transition-all',
                isHovered ? 'opacity-100' : 'opacity-70',
              )}
              style={{ backgroundColor: marker.color }}
            />

            {/* Marker handle */}
            <div
              className={cn(
                'absolute -top-1 left-1/2 -translate-x-1/2 cursor-pointer transition-transform',
                isHovered && 'scale-125',
              )}
              onClick={e => handleMarkerClick(e, marker)}
              onDoubleClick={e => handleMarkerDoubleClick(e, marker)}
              onContextMenu={e => handleMarkerContextMenu(e, marker)}
              onMouseEnter={() => setHoveredMarker(marker.id)}
              onMouseLeave={() => setHoveredMarker(null)}
            >
              <div
                className="h-3 w-2.5 shadow-md"
                style={{
                  backgroundColor: marker.color,
                  clipPath: 'polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%)',
                }}
              />
            </div>

            {/* Marker tooltip/label */}
            {(isHovered || isEditing) && (
              <div className="absolute -top-9 left-1/2 z-50 -translate-x-1/2">
                {isEditing ? (
                  <input
                    type="text"
                    defaultValue={marker.label}
                    autoFocus
                    className="bg-popover border-border text-foreground w-24 rounded border px-2 py-0.5 text-xs shadow-lg"
                    onBlur={e => handleLabelChange(marker.id, e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        handleLabelChange(marker.id, (e.target as HTMLInputElement).value)
                      } else if (e.key === 'Escape') {
                        setEditingMarker(null)
                      }
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div
                    className="px-2 py-0.5 text-xs font-medium whitespace-nowrap shadow-lg"
                    style={{ backgroundColor: marker.color, color: 'hsl(var(--primary-foreground))' }}
                  >
                    <div>{marker.label}</div>
                    <div className="font-mono text-[10px] opacity-70">{formatTime(marker.time)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default TimelineMarkers
