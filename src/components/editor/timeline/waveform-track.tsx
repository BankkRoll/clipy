/**
 * WaveformTrack - Audio waveform visualization
 */

import { useCallback, useEffect, useRef } from 'react'

import { cn } from '@/utils/tailwind'
import { useTimelineStore } from '@/stores/timeline-store'

interface WaveformTrackProps {
  duration: number
  pixelsPerSecond: number
  timelineWidth: number
  className?: string
}

export function WaveformTrack({ duration, pixelsPerSecond, timelineWidth, className }: WaveformTrackProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const { waveformData, waveformLoaded, currentTime } = useTimelineStore()

  // Use full timeline width since labels are now outside the scrollable area
  const waveformWidth = Math.max(100, timelineWidth)

  const renderWaveform = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const height = container.getBoundingClientRect().height

    // Use calculated waveform width instead of container width
    canvas.width = waveformWidth * dpr
    canvas.height = height * dpr
    canvas.style.width = `${waveformWidth}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const width = waveformWidth
    const centerY = height / 2

    // Clear
    ctx.clearRect(0, 0, width, height)

    // Center line
    ctx.strokeStyle = 'hsl(var(--border))'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()
    ctx.setLineDash([])

    const data = waveformLoaded && waveformData.length > 0 ? waveformData : null
    const progressRatio = duration > 0 ? currentTime / duration : 0
    const progressX = width * progressRatio

    const barWidth = 2
    const barGap = 1
    const totalBarWidth = barWidth + barGap
    const barCount = Math.floor(width / totalBarWidth)
    const maxAmplitude = (height / 2) * 0.8

    for (let i = 0; i < barCount; i++) {
      let amplitude: number

      if (data) {
        const dataPos = (i / barCount) * data.length
        const dataIndex = Math.floor(dataPos)
        amplitude = data[dataIndex] || 0
      } else {
        const x = i * 0.05
        amplitude = (Math.sin(x * 2.3) * 0.3 + Math.sin(x * 5.7) * 0.2 + 0.4) * 0.6
        amplitude = Math.max(0.1, Math.min(1, amplitude))
      }

      const barHeight = Math.max(2, amplitude * maxAmplitude)
      const x = i * totalBarWidth
      const isPlayed = x < progressX

      // Use primary color for played, muted for unplayed
      if (data) {
        ctx.fillStyle = isPlayed ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.4)'
      } else {
        ctx.fillStyle = 'hsl(var(--muted-foreground) / 0.2)'
      }

      // Top bar
      ctx.beginPath()
      ctx.roundRect(x, centerY - barHeight, barWidth, barHeight, 1)
      ctx.fill()

      // Bottom bar
      ctx.beginPath()
      ctx.roundRect(x, centerY, barWidth, barHeight, 1)
      ctx.fill()
    }
  }, [waveformData, waveformLoaded, duration, currentTime, waveformWidth])

  useEffect(() => {
    renderWaveform()

    const observer = new ResizeObserver(() => renderWaveform())
    if (containerRef.current) observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [renderWaveform])

  useEffect(() => {
    renderWaveform()
  }, [currentTime, renderWaveform])

  return (
    <div ref={containerRef} className={cn('relative overflow-hidden', className)}>
      <canvas ref={canvasRef} className="absolute inset-0" />
      {!waveformLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-muted-foreground text-xs">Audio waveform</span>
        </div>
      )}
    </div>
  )
}

export default WaveformTrack
