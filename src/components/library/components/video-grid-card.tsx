import { memo } from "react";
import { Play, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import { VideoActionsMenu } from "./video-actions-menu";
import type { LibraryVideo } from "@/hooks/useLibrary";

interface VideoGridCardProps {
  video: LibraryVideo;
  onPlay: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

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
}: VideoGridCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-lg hover:border-primary/50",
        selected ? "border-primary ring-2 ring-primary" : "border-border"
      )}
    >
      {/* Selection checkbox */}
      {(selectionMode || selected) && (
        <button
          type="button"
          aria-label={selected ? "Deselect video" : "Select video"}
          aria-pressed={selected}
          onClick={onToggleSelect}
          className={cn(
            "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded border bg-background/80 backdrop-blur transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border"
          )}
        >
          {selected && <Check className="h-4 w-4" />}
        </button>
      )}

      {/* Thumbnail */}
      <div className="relative aspect-video bg-muted">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "";
            (e.target as HTMLImageElement).classList.add("hidden");
          }}
        />
        <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
          {formatDuration(video.duration)}
        </div>
        {/* Hover Overlay */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="secondary" onClick={onPlay}>
            <Play className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="secondary" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">
          {video.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground truncate">
          {video.channel}
        </p>
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatBytes(video.fileSize)}</span>
          <span>{video.resolution}</span>
        </div>
      </div>

      {/* Menu */}
      <VideoActionsMenu
        onPlay={onPlay}
        onEdit={onEdit}
        onOpenFolder={onOpenFolder}
        onDelete={onDelete}
        onRename={onRename}
        triggerClassName="absolute right-1 top-1 h-7 w-7 bg-black/50 text-white opacity-0 group-hover:opacity-100"
      />
    </div>
  );
});
