/**
 * PlayerControls - Playback control bar
 */

import { useCallback, useRef, useState } from 'react'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useTimelineStore } from '@/stores/timeline-store'
import { cn } from '@/utils/tailwind'

interface PlayerControlsProps {
  className?: string
  onFullscreen?: () => void
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

export function PlayerControls({ className, onFullscreen }: PlayerControlsProps) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    trimStart,
    trimEnd,
    isTrimmed,
    qualities,
    selectedQuality,
    isBuffering,
    togglePlay,
    nextFrame,
    prevFrame,
    jumpToStart,
    jumpToEnd,
    setPlaybackRate,
    setVolume,
    toggleMute,
    goToTrimStart,
    goToTrimEnd,
    setSelectedQuality,
  } = useTimelineStore()

  const handleVolumeMouseEnter = useCallback(() => {
    if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current)
    setShowVolumeSlider(true)
  }, [])

  const handleVolumeMouseLeave = useCallback(() => {
    volumeTimeoutRef.current = setTimeout(() => setShowVolumeSlider(false), 300)
  }, [])

  const handleVolumeChange = useCallback((value: number[]) => setVolume(value[0]), [setVolume])

  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn('bg-card border-border flex items-center gap-2 border-t px-4 py-2', className)}>
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={isTrimmed ? goToTrimStart : jumpToStart}>
                <SkipBack className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTrimmed ? 'Go to In (I)' : 'Start (Home)'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevFrame}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous frame (←)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10" onClick={togglePlay}>
                {isBuffering ? (
                  <RotateCcw className="h-5 w-5 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="h-5 w-5" />
                ) : (
                  <Play className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPlaying ? 'Pause (Space)' : 'Play (Space)'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextFrame}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next frame (→)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={isTrimmed ? goToTrimEnd : jumpToEnd}>
                <SkipForward className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isTrimmed ? 'Go to Out (O)' : 'End (End)'}</TooltipContent>
          </Tooltip>
        </div>

        {/* Time display */}
        <div className="flex flex-1 items-center justify-center gap-2">
          <span className="font-mono text-sm tabular-nums">
            {formatTime(currentTime)}
            <span className="text-muted-foreground mx-1">/</span>
            {formatTime(duration)}
          </span>

          {isTrimmed && <span className="text-primary text-xs">Clip: {formatTime(trimEnd - trimStart)}</span>}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {/* Volume */}
          <div
            className="relative flex items-center"
            onMouseEnter={handleVolumeMouseEnter}
            onMouseLeave={handleVolumeMouseLeave}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleMute}>
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isMuted ? 'Unmute (M)' : 'Mute (M)'}</TooltipContent>
            </Tooltip>

            <div
              className={cn(
                'absolute bottom-full left-1/2 mb-2 -translate-x-1/2 transition-opacity',
                showVolumeSlider ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
            >
              <div className="border-border bg-popover rounded-lg border p-3">
                <Slider
                  orientation="vertical"
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="h-24"
                />
              </div>
            </div>
          </div>

          {/* Playback speed */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 font-mono text-xs">
                    {playbackRate}x
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Speed</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PLAYBACK_RATES.map(rate => (
                <DropdownMenuItem
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={cn(rate === playbackRate && 'bg-accent')}
                >
                  {rate}x {rate === 1 && '(Normal)'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quality */}
          {qualities.length > 0 && (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Quality</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Quality</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {qualities.map(quality => (
                  <DropdownMenuItem
                    key={quality.label}
                    onClick={() => setSelectedQuality(quality.label)}
                    className={cn(quality.label === selectedQuality && 'bg-accent')}
                  >
                    {quality.label}
                    {quality.bitrate && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {Math.round(quality.bitrate / 1000)}kbps
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Fullscreen */}
          {onFullscreen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onFullscreen}>
                  <Maximize className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fullscreen (F)</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default PlayerControls
