import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  Trash2,
  Unlock,
} from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";
import type { Track } from "@/types/editor";
import { clampTime, pixelToTime, timeToPixel, type RulerMarker } from "@/lib/editor/timeline";
import { TimelineClip, type ClipMenuActions } from "@/components/editor/timeline-clip";
import type { TimelineDrag } from "@/components/editor/use-timeline-drag";

/** Width of the track header column, in pixels (matches `w-40`). */
export const TRACK_HEADER_WIDTH = 160;

/** Props for {@link TimelineTrack}. */
export interface TimelineTrackProps {
  track: Track;
  index: number;
  trackCount: number;
  width: number;
  zoom: number;
  duration: number;
  currentTime: number;
  gridMarkers: RulerMarker[];
  selected: boolean;
  selectedClipIds: string[];
  canPaste: boolean;
  actions: ClipMenuActions;
  drag: TimelineDrag;
  /** Registers this track's lane element for cross-track drop hit-testing. */
  laneRef: (el: HTMLDivElement | null) => void;
}

const TRACK_DOT: Record<Track["type"], string> = {
  video: "bg-blue-500",
  audio: "bg-green-500",
  text: "bg-purple-500",
  effect: "bg-orange-500",
};

/**
 * One timeline row: a sticky header (reorder, visibility, lock, context
 * menu) and the lane holding the track's clips.
 */
export function TimelineTrack({
  track,
  index,
  trackCount,
  width,
  zoom,
  duration,
  currentTime,
  gridMarkers,
  selected,
  selectedClipIds,
  canPaste,
  actions,
  drag,
  laneRef,
}: TimelineTrackProps) {
  const {
    updateTrack,
    reorderTracks,
    duplicateTrack,
    removeTrack,
    selectTrack,
    seek,
    clearSelection,
  } = useEditorStore.getState();

  const toggleMuted = () => updateTrack(track.id, { muted: !track.muted });
  const toggleLocked = () => updateTrack(track.id, { locked: !track.locked });

  const handleDelete = async () => {
    if (trackCount <= 1) {
      toast.error("Cannot delete the last track");
      return;
    }
    const confirmed = await ask("Delete this track and all its clips?", {
      title: "Delete Track",
      kind: "warning",
    });
    if (confirmed) {
      removeTrack(track.id);
      toast.success("Track deleted");
    }
  };

  return (
    <div
      data-testid={`track-${track.id}`}
      className={cn(
        "flex border-b border-border transition-colors duration-150",
        index % 2 === 0 ? "bg-muted/30" : "bg-background",
        selected && "bg-primary/10 ring-1 ring-inset ring-primary",
        !selected && "hover:bg-muted/50"
      )}
      style={{ height: track.height }}
      onClick={() => selectTrack(track.id)}
    >
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-testid={`track-header-${track.id}`}
            className={cn(
              "sticky left-0 z-20 flex w-40 flex-shrink-0 items-center gap-2 border-r bg-card px-3 transition-colors",
              selected ? "border-primary" : "border-border"
            )}
          >
            <div className="flex flex-col">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex h-2.5 w-4 items-center justify-center text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                    disabled={index === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderTracks(index, index - 1);
                    }}
                    aria-label="Move track up"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Move track up</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex h-2.5 w-4 items-center justify-center text-muted-foreground/60 hover:text-foreground disabled:opacity-30"
                    disabled={index === trackCount - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      reorderTracks(index, index + 1);
                    }}
                    aria-label="Move track down"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Move track down</TooltipContent>
              </Tooltip>
            </div>
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
            <div className={cn("h-2 w-2 rounded-full", TRACK_DOT[track.type])} />
            <span className="flex-1 truncate text-xs font-medium">{track.name}</span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                aria-label={track.muted ? "Show track" : "Hide track"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMuted();
                }}
              >
                {track.muted ? (
                  <EyeOff className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                aria-label={track.locked ? "Unlock track" : "Lock track"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLocked();
                }}
              >
                {track.locked ? (
                  <Lock className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <Unlock className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={toggleMuted}>
            {track.muted ? <Eye className="mr-2 h-4 w-4" /> : <EyeOff className="mr-2 h-4 w-4" />}
            {track.muted ? "Show Track" : "Hide Track"}
          </ContextMenuItem>
          <ContextMenuItem onClick={toggleLocked}>
            {track.locked ? <Unlock className="mr-2 h-4 w-4" /> : <Lock className="mr-2 h-4 w-4" />}
            {track.locked ? "Unlock Track" : "Lock Track"}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => {
              duplicateTrack(track.id);
              toast.success("Track duplicated");
            }}
          >
            <Layers className="mr-2 h-4 w-4" />
            Duplicate Track
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => void handleDelete()}
            disabled={trackCount <= 1}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Track
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div
        ref={laneRef}
        data-testid={`lane-${track.id}`}
        className="relative flex-shrink-0"
        style={{ width }}
        onClick={(e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          seek(clampTime(pixelToTime(x, zoom), duration));
          clearSelection();
        }}
      >
        {gridMarkers.map((marker) => (
          <div
            key={marker.time}
            className="absolute bottom-0 top-0 w-px bg-border/30"
            style={{ left: timeToPixel(marker.time, zoom) }}
          />
        ))}

        <div
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-red-500"
          style={{ left: timeToPixel(currentTime, zoom) }}
        />
        <div
          data-testid={`lane-playhead-${track.id}`}
          className="absolute bottom-0 top-0 z-30 -ml-1.5 w-3 cursor-ew-resize hover:bg-red-500/10"
          style={{ left: timeToPixel(currentTime, zoom) }}
          onMouseDown={drag.startPlayheadDrag}
          onClick={(e) => e.stopPropagation()}
        />

        {track.clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            track={track}
            zoom={zoom}
            selected={selectedClipIds.includes(clip.id)}
            currentTime={currentTime}
            canPaste={canPaste}
            actions={actions}
            drag={drag}
          />
        ))}
      </div>
    </div>
  );
}
