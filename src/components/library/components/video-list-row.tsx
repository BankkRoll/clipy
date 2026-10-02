import { memo } from "react";
import { Play, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatRelativeTime, cn } from "@/lib/utils";
import { VideoActionsMenu } from "./video-actions-menu";
import { VideoThumbnail } from "./video-thumbnail";
import type { VideoItemProps } from "./video-grid-card";

/** Library list row. */
export const VideoListRow = memo(function VideoListRow({
  video,
  onPlay,
  onEdit,
  onOpenFolder,
  onDelete,
  onRename,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: VideoItemProps) {
  return (
    <div
      data-testid={`video-${video.id}`}
      className={cn(
        "group flex items-center gap-4 rounded-lg border bg-card p-3",
        "transition-colors hover:border-primary/50 hover:bg-accent/50",
        selected ? "border-primary ring-1 ring-primary" : "border-border"
      )}
    >
      {(selectionMode || selected) && (
        <button
          type="button"
          aria-label={selected ? "Deselect video" : "Select video"}
          aria-pressed={selected}
          onClick={onToggleSelect}
          className={cn(
            "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </button>
      )}
      <div
        className="relative h-16 w-28 flex-shrink-0 cursor-pointer overflow-hidden rounded bg-muted"
        onClick={onPlay}
      >
        <VideoThumbnail src={video.thumbnail} alt={video.title} />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
          <Play className="h-6 w-6 text-white" />
        </div>
        <div className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(video.duration)}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{video.title}</h3>
        <p className="truncate text-sm text-muted-foreground">{video.channel}</p>
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span className="w-20 text-right">{formatBytes(video.fileSize)}</span>
        <span className="w-16">{video.resolution}</span>
        <span className="w-24">{formatRelativeTime(video.downloadedAt)}</span>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" onClick={onPlay} aria-label="Play">
          <Play className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onEdit} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        <VideoActionsMenu
          onPlay={onPlay}
          onEdit={onEdit}
          onOpenFolder={onOpenFolder}
          onDelete={onDelete}
          onRename={onRename}
          onSelect={selected ? undefined : onToggleSelect}
          showPlayEdit={false}
        />
      </div>
    </div>
  );
});
