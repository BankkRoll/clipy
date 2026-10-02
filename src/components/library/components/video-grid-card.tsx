import { memo } from "react";
import { Play, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import { VideoActionsMenu } from "./video-actions-menu";
import { VideoThumbnail } from "./video-thumbnail";
import type { LibraryVideo } from "@/hooks/useLibrary";

/** Props shared by the library grid card and list row. */
export interface VideoItemProps {
  video: LibraryVideo;
  onPlay: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
  /** Whether any video is selected (shows checkboxes on every item). */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

/** Library grid card. */
export const VideoGridCard = memo(function VideoGridCard({
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
        "group relative overflow-hidden rounded-lg border bg-card transition-all hover:border-primary/50 hover:shadow-lg",
        selected ? "border-primary ring-2 ring-primary" : "border-border"
      )}
    >
      {(selectionMode || selected) && (
        <button
          type="button"
          aria-label={selected ? "Deselect video" : "Select video"}
          aria-pressed={selected}
          onClick={onToggleSelect}
          className={cn(
            "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border bg-background/80 backdrop-blur transition-colors",
            selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
          )}
        >
          {selected && <Check className="h-4 w-4" />}
        </button>
      )}

      <div className="relative aspect-video bg-muted">
        <VideoThumbnail src={video.thumbnail} alt={video.title} />
        <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.duration)}
        </div>
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="secondary" onClick={onPlay} aria-label="Play">
            <Play className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={onEdit} aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">{video.title}</h3>
        <p className="mt-1 truncate text-xs text-muted-foreground">{video.channel}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatBytes(video.fileSize)}</span>
          <span>{video.resolution}</span>
        </div>
      </div>

      <VideoActionsMenu
        onPlay={onPlay}
        onEdit={onEdit}
        onOpenFolder={onOpenFolder}
        onDelete={onDelete}
        onRename={onRename}
        onSelect={selected ? undefined : onToggleSelect}
        triggerClassName="absolute right-1 top-1 h-7 w-7 bg-black/50 text-white opacity-0 group-hover:opacity-100"
      />
    </div>
  );
});
