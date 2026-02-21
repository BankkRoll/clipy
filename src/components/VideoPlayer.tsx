import { useRef, useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Volume1,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  Settings,
  X,
  PictureInPicture,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn, formatDuration } from "@/lib/utils";
import { convertFileSrc } from "@tauri-apps/api/core";
import { logger } from "@/lib/logger";

interface VideoPlayerProps {
  src: string;
  title?: string;
  subtitle?: string;
  poster?: string;
  autoPlay?: boolean;
  onClose?: () => void;
  className?: string;
  isFullscreen?: boolean;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function VideoPlayer({
  src,
  title,
  subtitle,
  poster,
  autoPlay = true,
  onClose,
  className,
  isFullscreen = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<number | null>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if path is a URL (http, https, blob, data)
  const isUrl = (path: string) => {
    return path.startsWith("http") || path.startsWith("blob:") || path.startsWith("data:");
  };

  // Convert file path to asset URL for Tauri
  const videoSrc = isUrl(src) ? src : convertFileSrc(src);

  // Convert poster if it's a local file
  const posterSrc = poster && !isUrl(poster) ? convertFileSrc(poster) : poster;

  // Debug logging
  useEffect(() => {
    logger.debug("VideoPlayer", "Original source:", src);
    logger.debug("VideoPlayer", "Converted video URL:", videoSrc);
    logger.debug("VideoPlayer", "Original poster:", poster);
    logger.debug("VideoPlayer", "Converted poster URL:", posterSrc);
  }, [src, videoSrc, poster, posterSrc]);

  // Auto-play on mount
  useEffect(() => {
    if (autoPlay && videoRef.current) {
      logger.debug("VideoPlayer", "Attempting autoplay...");
      videoRef.current.play().catch((e) => {
        logger.warn("VideoPlayer", "Auto-play prevented:", e);
        setIsPlaying(false);
      });
    }
  }, [autoPlay]);

  // Hide controls after inactivity
  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Handle mouse move
  const handleMouseMove = useCallback(() => {
    resetControlsTimeout();
  }, [resetControlsTimeout]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (isPlaying) {
      setShowControls(false);
    }
  }, [isPlaying]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Handle volume change
  const handleVolumeChange = useCallback((value: number[]) => {
    if (videoRef.current && value[0] !== undefined) {
      const newVolume = value[0] / 100;
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);

  // Skip forward/backward
  const skip = useCallback(
    (seconds: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(
          0,
          Math.min(videoRef.current.currentTime + seconds, duration)
        );
      }
    },
    [duration]
  );

  // Handle progress bar hover
  const handleProgressHover = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (progressRef.current && duration > 0) {
        const rect = progressRef.current.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        setHoverTime(Math.max(0, Math.min(position * duration, duration)));
        setHoverPosition(e.clientX - rect.left);
      }
    },
    [duration]
  );

  // Handle progress bar click
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (progressRef.current && duration > 0 && videoRef.current) {
        const rect = progressRef.current.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const newTime = Math.max(0, Math.min(position * duration, duration));
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    },
    [duration]
  );

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreenMode(false);
      } else {
        await containerRef.current.requestFullscreen();
        setIsFullscreenMode(true);
      }
    } catch (err) {
      logger.error("VideoPlayer", "Fullscreen error:", err);
    }
  }, []);

  // Toggle Picture-in-Picture
  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      logger.error("VideoPlayer", "PiP error:", err);
    }
  }, []);

  // Set playback speed
  const handlePlaybackSpeed = useCallback((speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackSpeed(speed);
    }
  }, []);

  // Video event handlers
  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
    }
  }, []);

  const handleProgress = useCallback(() => {
    if (videoRef.current && videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      setBuffered(bufferedEnd);
    }
  }, []);

  const handlePlay = useCallback(() => setIsPlaying(true), []);
  const handlePause = useCallback(() => setIsPlaying(false), []);
  const handleEnded = useCallback(() => setIsPlaying(false), []);
  const handleWaiting = useCallback(() => setIsLoading(true), []);
  const handleCanPlay = useCallback(() => setIsLoading(false), []);
  const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const mediaError = video.error;
    let errorMessage = "Failed to load video";

    if (mediaError) {
      logger.error("VideoPlayer", "Media error code:", mediaError.code);
      logger.error("VideoPlayer", "Media error message:", mediaError.message);

      switch (mediaError.code) {
        case MediaError.MEDIA_ERR_ABORTED:
          errorMessage = "Video playback was aborted";
          break;
        case MediaError.MEDIA_ERR_NETWORK:
          errorMessage = "Network error while loading video";
          break;
        case MediaError.MEDIA_ERR_DECODE:
          errorMessage = "Video decoding failed";
          break;
        case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          errorMessage = "Video format not supported or file not found";
          break;
      }
    }

    logger.error("VideoPlayer", "Error loading video:", errorMessage, "URL:", videoSrc);
    setError(errorMessage);
  }, [videoSrc]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          skip(e.shiftKey ? -10 : -5);
          break;
        case "ArrowRight":
          e.preventDefault();
          skip(e.shiftKey ? 10 : 5);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleVolumeChange([Math.min((volume + 0.1) * 100, 100)]);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleVolumeChange([Math.max((volume - 0.1) * 100, 0)]);
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "f":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "Escape":
          if (onClose && !document.fullscreenElement) {
            onClose();
          }
          break;
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          if (videoRef.current && duration > 0) {
            e.preventDefault();
            const percent = parseInt(e.key) / 10;
            videoRef.current.currentTime = duration * percent;
          }
          break;
        case "<": {
          e.preventDefault();
          const currentIdx = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
          const slowerIdx = Math.max(0, currentIdx - 1);
          const slowerSpeed = PLAYBACK_SPEEDS[slowerIdx];
          if (slowerSpeed !== undefined) handlePlaybackSpeed(slowerSpeed);
          break;
        }
        case ">": {
          e.preventDefault();
          const currentIdx2 = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
          const fasterIdx = Math.min(PLAYBACK_SPEEDS.length - 1, currentIdx2 + 1);
          const fasterSpeed = PLAYBACK_SPEEDS[fasterIdx];
          if (fasterSpeed !== undefined) handlePlaybackSpeed(fasterSpeed);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    togglePlay,
    skip,
    volume,
    handleVolumeChange,
    toggleMute,
    toggleFullscreen,
    onClose,
    duration,
    playbackSpeed,
    handlePlaybackSpeed,
  ]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreenMode(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Volume icon based on level
  const VolumeIcon = isMuted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Progress percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative select-none bg-black",
        isFullscreen && "fixed inset-0 z-50",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc}
        className="h-full w-full object-contain"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onProgress={handleProgress}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onError={handleError}
        playsInline
        preload="metadata"
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center text-white">
            <p className="text-lg font-medium">Unable to play video</p>
            <p className="mt-1 text-sm text-white/60">{error}</p>
          </div>
        </div>
      )}

      {/* Play button overlay when paused */}
      {!isPlaying && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            onClick={togglePlay}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110"
          >
            <Play className="ml-1 h-10 w-10 text-black" fill="black" />
          </button>
        </div>
      )}

      {/* Top Gradient & Title */}
      <div
        className={cn(
          "absolute left-0 right-0 top-0 bg-gradient-to-b from-black/70 to-transparent p-4 transition-opacity duration-300",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            {title && <h2 className="truncate text-lg font-medium text-white">{title}</h2>}
            {subtitle && <p className="truncate text-sm text-white/70">{subtitle}</p>}
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="ml-4 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-300",
          showControls ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        {/* Progress Bar */}
        <div
          ref={progressRef}
          className="group relative mx-4 mb-2 h-1 cursor-pointer"
          onMouseMove={handleProgressHover}
          onMouseLeave={() => setHoverTime(null)}
          onClick={handleProgressClick}
        >
          {/* Background */}
          <div className="absolute inset-0 rounded-full bg-white/30" />

          {/* Buffered */}
          <div
            className="absolute bottom-0 left-0 top-0 rounded-full bg-white/50"
            style={{ width: `${bufferedProgress}%` }}
          />

          {/* Progress */}
          <div
            className="absolute bottom-0 left-0 top-0 rounded-full bg-red-500 transition-all"
            style={{ width: `${progress}%` }}
          >
            {/* Scrubber */}
            <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-red-500 opacity-0 shadow-lg transition-opacity group-hover:opacity-100" />
          </div>

          {/* Hover preview */}
          {hoverTime !== null && (
            <div
              className="pointer-events-none absolute bottom-4 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-xs text-white"
              style={{ left: hoverPosition }}
            >
              {formatDuration(hoverTime)}
            </div>
          )}

          {/* Expanded hit area */}
          <div className="absolute -bottom-2 -top-2 left-0 right-0" />
        </div>

        {/* Control Buttons */}
        <div className="flex items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-1">
            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="text-white hover:bg-white/20"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" fill="white" />
              ) : (
                <Play className="ml-0.5 h-6 w-6" fill="white" />
              )}
            </Button>

            {/* Skip Back */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(-10)}
              className="text-white hover:bg-white/20"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            {/* Skip Forward */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => skip(10)}
              className="text-white hover:bg-white/20"
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            {/* Volume */}
            <div className="group/volume flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="text-white hover:bg-white/20"
              >
                <VolumeIcon className="h-5 w-5" />
              </Button>
              <div className="w-0 overflow-hidden transition-all duration-200 group-hover/volume:w-20">
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={handleVolumeChange}
                  max={100}
                  step={1}
                  className="w-20"
                />
              </div>
            </div>

            {/* Time Display */}
            <div className="ml-3 font-mono text-sm text-white">
              <span>{formatDuration(currentTime)}</span>
              <span className="mx-1 text-white/50">/</span>
              <span className="text-white/70">{formatDuration(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Settings (Playback Speed) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Playback Speed</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {PLAYBACK_SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={() => handlePlaybackSpeed(speed)}
                    className={cn(playbackSpeed === speed && "bg-accent")}
                  >
                    {speed === 1 ? "Normal" : `${speed}x`}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Picture-in-Picture */}
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePiP}
              className="text-white hover:bg-white/20"
            >
              <PictureInPicture className="h-5 w-5" />
            </Button>

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              className="text-white hover:bg-white/20"
            >
              {isFullscreenMode ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
