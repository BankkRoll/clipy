import type { ReactNode } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorStore } from "@/stores/editorStore";
import { formatDuration } from "@/lib/utils";

function Transport({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Transport bar under the preview: seek buttons, play/pause, timecode and
 * master volume. Must be rendered inside a `TooltipProvider`.
 */
export function PlaybackControls() {
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const currentTime = useEditorStore((s) => s.currentTime);
  const duration = useEditorStore((s) => s.duration);
  const volume = useEditorStore((s) => s.volume);
  const isMuted = useEditorStore((s) => s.isMuted);
  const { togglePlay, seek, seekRelative, setVolume, toggleMute } = useEditorStore.getState();

  return (
    <div className="flex h-16 items-center justify-center gap-4 border-t border-border bg-card px-4">
      <Transport label="Go to start" hint="Go to Start (Home)" onClick={() => seek(0)}>
        <SkipBack className="h-4 w-4" />
      </Transport>
      <Transport label="Back 5 seconds" hint="Back 5s (Shift+←)" onClick={() => seekRelative(-5)}>
        <SkipBack className="h-4 w-4" />
      </Transport>
      <Button
        variant="default"
        size="icon"
        className="h-10 w-10 rounded-full"
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={togglePlay}
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
      </Button>
      <Transport
        label="Forward 5 seconds"
        hint="Forward 5s (Shift+→)"
        onClick={() => seekRelative(5)}
      >
        <SkipForward className="h-4 w-4" />
      </Transport>
      <Transport
        label="Go to end"
        hint="Go to End (End)"
        onClick={() => seek(useEditorStore.getState().duration)}
      >
        <SkipForward className="h-4 w-4" />
      </Transport>

      <Separator orientation="vertical" className="h-6" />

      <div
        className="flex items-center gap-2 font-mono text-sm text-muted-foreground"
        data-testid="timecode"
      >
        <span>{formatDuration(currentTime)}</span>
        <span>/</span>
        <span>{formatDuration(duration)}</span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={isMuted ? "Unmute" : "Mute"}
          onClick={toggleMute}
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <Slider
          aria-label="Master volume"
          value={[isMuted ? 0 : volume * 100]}
          onValueChange={([v]) => v !== undefined && setVolume(v / 100)}
          max={100}
          step={1}
          className="w-24"
        />
      </div>
    </div>
  );
}
