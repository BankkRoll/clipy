import { Clipboard, Copy, Image, Layers, Music, Scissors, Trash2, Type, Video } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Clip, Track } from "@/types/editor";
import { timeToPixel } from "@/lib/editor/timeline";
import type { EditorActions } from "@/components/editor/use-editor-actions";
import type { TimelineDrag } from "@/components/editor/use-timeline-drag";

/** Clip commands the timeline context menus invoke. */
export type ClipMenuActions = Pick<
  EditorActions,
  "copyClip" | "cutClip" | "pasteClip" | "duplicateClip" | "splitClip" | "deleteClips"
>;

/** Props for {@link TimelineClip}. */
export interface TimelineClipProps {
  clip: Clip;
  track: Track;
  zoom: number;
  selected: boolean;
  currentTime: number;
  canPaste: boolean;
  actions: ClipMenuActions;
  drag: Pick<TimelineDrag, "startClipDrag" | "startTrim">;
}

const CLIP_COLORS: Record<Clip["type"], string> = {
  video: "bg-blue-500/80 hover:bg-blue-500",
  audio: "bg-green-500/80 hover:bg-green-500",
  text: "bg-purple-500/80 hover:bg-purple-500",
  image: "bg-orange-500/80 hover:bg-orange-500",
};

const CLIP_ICONS = { video: Video, audio: Music, text: Type, image: Image };

/**
 * One clip block on a track lane, with trim handles and a context menu.
 * Every menu command receives this clip's id directly.
 */
export function TimelineClip({
  clip,
  track,
  zoom,
  selected,
  currentTime,
  canPaste,
  actions,
  drag,
}: TimelineClipProps) {
  const Icon = CLIP_ICONS[clip.type];
  const playheadInside = currentTime > clip.startTime && currentTime < clip.endTime;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-testid={`clip-${clip.id}`}
          data-selected={selected ? "true" : undefined}
          aria-label={clip.name}
          className={cn(
            "group absolute bottom-1 top-1 rounded transition-colors duration-150",
            "flex items-center overflow-hidden",
            CLIP_COLORS[clip.type],
            selected &&
              "shadow-[0_0_10px_rgba(255,255,255,0.3)] ring-2 ring-white ring-offset-1 ring-offset-black/50",
            !selected && "hover:ring-1 hover:ring-white/50",
            track.locked && "cursor-not-allowed opacity-50",
            !track.locked && "cursor-grab active:cursor-grabbing"
          )}
          style={{
            left: timeToPixel(clip.startTime, zoom),
            width: Math.max(timeToPixel(clip.endTime - clip.startTime, zoom), 20),
          }}
          onMouseDown={(e) => drag.startClipDrag(e, clip, track)}
          onClick={(e) => e.stopPropagation()}
        >
          {selected && (
            <div className="absolute -left-1 -top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-md">
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
          )}

          {!track.locked && (
            <div
              data-testid={`trim-start-${clip.id}`}
              className="absolute bottom-0 left-0 top-0 z-10 flex w-3 cursor-ew-resize items-center justify-start bg-gradient-to-r from-white/20 to-transparent pl-0.5 transition-colors hover:from-white/40"
              onMouseDown={(e) => drag.startTrim(e, clip, "start")}
            >
              <div className="h-6 w-1 rounded-full bg-white/60 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-1 px-4">
            <Icon className="h-3 w-3 flex-shrink-0 text-white" />
            <span className="truncate text-xs font-medium text-white">{clip.name}</span>
          </div>

          {!track.locked && (
            <div
              data-testid={`trim-end-${clip.id}`}
              className="absolute bottom-0 right-0 top-0 z-10 flex w-3 cursor-ew-resize items-center justify-end bg-gradient-to-l from-white/20 to-transparent pr-0.5 transition-colors hover:from-white/40"
              onMouseDown={(e) => drag.startTrim(e, clip, "end")}
            >
              <div className="h-6 w-1 rounded-full bg-white/60 opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => actions.cutClip(clip.id)} disabled={track.locked}>
          <Scissors className="mr-2 h-4 w-4" />
          Cut
          <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.copyClip(clip.id)}>
          <Copy className="mr-2 h-4 w-4" />
          Copy
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => actions.pasteClip(track.id)}
          disabled={!canPaste || track.locked}
        >
          <Clipboard className="mr-2 h-4 w-4" />
          Paste
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.duplicateClip(clip.id)} disabled={track.locked}>
          <Layers className="mr-2 h-4 w-4" />
          Duplicate
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => actions.splitClip(clip.id)}
          disabled={track.locked || !playheadInside}
        >
          <Scissors className="mr-2 h-4 w-4" />
          Split at Playhead
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => void actions.deleteClips([clip.id])}
          disabled={track.locked}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
