import { useCallback, useMemo, useRef } from "react";
import { Layers, Music, Plus, Type, Video, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useEditorStore } from "@/stores/editorStore";
import { buildRulerMarkers, pixelToTime, timelineWidth } from "@/lib/editor/timeline";
import { TimelineRuler } from "@/components/editor/timeline-ruler";
import { TimelineTrack, TRACK_HEADER_WIDTH } from "@/components/editor/timeline-track";
import type { ClipMenuActions } from "@/components/editor/timeline-clip";
import { useTimelineDrag, type SnapPreferences } from "@/components/editor/use-timeline-drag";

/** Props for {@link Timeline}. */
export interface TimelineProps {
  actions: ClipMenuActions;
  canPaste: boolean;
  snap: SnapPreferences;
}

/**
 * Bottom editor panel: add-track menu, zoom, a ruler and all tracks.
 *
 * Ruler and lanes live in ONE scroll container (ruler sticky at the top,
 * track headers sticky at the left), so horizontal scrolling keeps them
 * aligned. The ruler's left edge is time 0 for playhead scrubbing; clicks on
 * a lane use that lane's own rect.
 */
export function Timeline({ actions, canPaste, snap }: TimelineProps) {
  const tracks = useEditorStore((s) => s.project?.tracks);
  const zoom = useEditorStore((s) => s.zoom);
  const duration = useEditorStore((s) => s.duration);
  const currentTime = useEditorStore((s) => s.currentTime);
  const selectedTrackId = useEditorStore((s) => s.selectedTrackId);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const { addTrack, zoomIn, zoomOut, seek } = useEditorStore.getState();

  const rulerRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLElement>());
  const drag = useTimelineDrag(laneRefs, rulerRef, snap);

  const width = timelineWidth(duration, zoom);
  const markers = useMemo(() => buildRulerMarkers(pixelToTime(width, zoom), zoom), [width, zoom]);
  const gridMarkers = useMemo(() => markers.filter((m) => m.major), [markers]);

  const laneRef = useCallback(
    (trackId: string) => (el: HTMLDivElement | null) => {
      if (el) laneRefs.current.set(trackId, el);
      else laneRefs.current.delete(trackId);
    },
    []
  );

  return (
    <div className="flex h-full flex-col border-t border-border bg-card">
      <div className="flex h-8 flex-shrink-0 items-center justify-between border-b border-border px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
              <Plus className="h-3 w-3" />
              Add Track
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => addTrack("video")}>
              <Video className="mr-2 h-4 w-4" />
              Video Track
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("audio")}>
              <Music className="mr-2 h-4 w-4" />
              Audio Track
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => addTrack("text")}>
              <Type className="mr-2 h-4 w-4" />
              Text Track
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Zoom out"
            onClick={zoomOut}
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground" data-testid="zoom-level">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label="Zoom in"
            onClick={zoomIn}
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto" data-testid="timeline-scroll">
        <div style={{ width: TRACK_HEADER_WIDTH + width, minWidth: "100%" }}>
          <div className="sticky top-0 z-30 flex h-6 border-b border-border bg-card">
            <div className="sticky left-0 z-40 w-40 flex-shrink-0 bg-card" />
            <TimelineRuler
              ref={rulerRef}
              markers={markers}
              width={width}
              zoom={zoom}
              duration={duration}
              currentTime={currentTime}
              onSeek={seek}
              onPlayheadMouseDown={drag.startPlayheadDrag}
            />
          </div>

          {!tracks || tracks.length === 0 ? (
            <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Layers />
                </EmptyMedia>
                <EmptyTitle>No tracks</EmptyTitle>
                <EmptyDescription>Add a track or import media to get started</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            tracks.map((track, index) => (
              <TimelineTrack
                key={track.id}
                track={track}
                index={index}
                trackCount={tracks.length}
                width={width}
                zoom={zoom}
                duration={duration}
                currentTime={currentTime}
                gridMarkers={gridMarkers}
                selected={selectedTrackId === track.id}
                selectedClipIds={selectedClipIds}
                canPaste={canPaste}
                actions={actions}
                drag={drag}
                laneRef={laneRef(track.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
