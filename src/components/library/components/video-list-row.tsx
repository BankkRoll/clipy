import { memo } from "react";
import { Play, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDuration, formatRelativeTime, cn } from "@/lib/utils";
import { VideoActionsMenu } from "./video-actions-menu";
import type { LibraryVideo } from "@/hooks/useLibrary";

interface VideoListRowProps {
  video: LibraryVideo;
  onPlay: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
}

export const VideoListRow = memo(function VideoListRow({
  video,
  onPlay,
  onEdit,
  onOpenFolder,
  onDelete,
}: VideoListRowProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-4 rounded-lg border border-border bg-card p-3",
        "transition-colors hover:bg-accent/50 hover:border-primary/50"
      )}
    >
      {/* Thumbnail */}
      <div
        className="relative h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted cursor-pointer"
        onClick={onPlay}
      >
        <img
          src={video.thumbnail}
          alt={video.title}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "";
            (e.target as HTMLImageElement).classList.add("hidden");
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
          <Play className="h-6 w-6 text-white" />
        </div>
        <div className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 py-0.5 text-[10px] font-medium text-white">
          {formatDuration(video.duration)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="truncate font-medium">{video.title}</h3>
        <p className="text-sm text-muted-foreground truncate">{video.channel}</p>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        <span className="w-20 text-right">{formatBytes(video.fileSize)}</span>
        <span className="w-16">{video.resolution}</span>
        <span className="w-24">{formatRelativeTime(video.downloadedAt)}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" onClick={onPlay}>
          <Play className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <VideoActionsMenu
          onPlay={onPlay}
          onEdit={onEdit}
          onOpenFolder={onOpenFolder}
          onDelete={onDelete}
          showPlayEdit={false}
        />
      </div>
    </div>
  );
});
