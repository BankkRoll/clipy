import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { clampTime, pixelToTime, timeToPixel, type RulerMarker } from "@/lib/editor/timeline";

/** Props for {@link TimelineRuler}. */
export interface TimelineRulerProps {
  markers: RulerMarker[];
  width: number;
  zoom: number;
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
  onPlayheadMouseDown: (e: React.MouseEvent) => void;
}

/**
 * Time ruler above the tracks. Clicking seeks (clamped to the timeline);
 * the playhead handle starts a scrub. Its left edge is the timeline's time
 * origin, so the parent also uses it as the reference for pointer math.
 */
export const TimelineRuler = forwardRef<HTMLDivElement, TimelineRulerProps>(function TimelineRuler(
  { markers, width, zoom, duration, currentTime, onSeek, onPlayheadMouseDown },
  ref
) {
  return (
    <div
      ref={ref}
      data-testid="timeline-ruler"
      className="relative h-full flex-shrink-0 cursor-pointer bg-muted/20"
      style={{ width }}
      onClick={(e) => {
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
        onSeek(clampTime(pixelToTime(x, zoom), duration));
      }}
    >
      {markers.map((marker) => (
        <div
          key={marker.time}
          className="absolute bottom-0 top-0 flex flex-col items-center"
          style={{ left: timeToPixel(marker.time, zoom) }}
        >
          <div className={cn("w-px bg-border", marker.major ? "h-full" : "h-2")} />
          {marker.major && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">{marker.label}</span>
          )}
        </div>
      ))}
      <div
        data-testid="ruler-playhead"
        className="absolute bottom-0 top-0 z-10 -ml-1.5 w-3 cursor-ew-resize"
        style={{ left: timeToPixel(currentTime, zoom) }}
        onMouseDown={onPlayheadMouseDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto h-full w-0.5 bg-red-500" />
        <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-red-500" />
      </div>
    </div>
  );
});
