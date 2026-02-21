import { memo } from "react";
import { Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration } from "@/lib/utils";
import { VideoActionsMenu } from "./video-actions-menu";
import type { LibraryVideo } from "@/hooks/useLibrary";

interface VideoGridCardProps {
  video: LibraryVideo;
  onPlay: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}

export const VideoGridCard = memo(function VideoGridCard({
  video,
  onPlay,
  onEdit,
  onOpenFolder,
  onDelete,
}: VideoGridCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card transition-all hover:shadow-lg hover:border-primary/50">
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
        triggerClassName="absolute right-1 top-1 h-7 w-7 bg-black/50 text-white opacity-0 group-hover:opacity-100"
      />
    </div>
  );
});
