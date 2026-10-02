import { memo, useState } from "react";
import {
  Download as DownloadIcon,
  Pause,
  Play,
  X,
  RotateCcw,
  FolderOpen,
  Trash2,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDuration, formatRelativeTime, thumbnailSrc } from "@/lib/utils";
import type { Download } from "@/types/download";
import { STATUS_CONFIG } from "../constants";
import { DownloadProgress } from "./download-progress";

/** Props for {@link DownloadItem}. */
export interface DownloadItemProps {
  download: Download;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
  onOpenFolder: () => void;
  onViewLibrary: () => void;
}

/** One row in the downloads list: thumbnail, progress, status and actions. */
export const DownloadItem = memo(function DownloadItem({
  download,
  onPlay,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRemove,
  onOpenFolder,
  onViewLibrary,
}: DownloadItemProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const status = STATUS_CONFIG[download.status];
  const StatusIcon = status.icon;
  const isAnimated =
    download.status === "downloading" ||
    download.status === "fetching" ||
    download.status === "processing";
  const isActive = isAnimated || download.status === "pending" || download.status === "paused";
  const thumbnail = thumbFailed ? null : thumbnailSrc(download.thumbnail);
  const canPlay = Boolean(download.filePath);

  return (
    <div
      data-testid={`download-${download.id}`}
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 transition-colors",
        isActive ? "border-border bg-card" : "border-border/50 bg-card/50"
      )}
    >
      <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={download.title}
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            data-testid="thumbnail-placeholder"
          >
            <DownloadIcon className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        <div
          className={cn(
            "absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5",
            status.bgColor
          )}
        >
          <StatusIcon className={cn("h-3 w-3", status.color, isAnimated && "animate-spin")} />
          <span className={cn("text-xs font-medium", status.color)}>{status.label}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-medium">{download.title}</h3>

        <DownloadProgress
          status={download.status}
          progress={download.progress}
          downloadedBytes={download.downloadedBytes}
          totalBytes={download.totalBytes}
          speed={download.speed}
          eta={download.eta}
          phase={download.phase}
          message={download.message}
        />

        {download.status === "failed" && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {download.error || "Download failed"}
          </p>
        )}

        {download.status === "completed" && (
          <p className="mt-2 text-sm text-green-600">Download completed successfully!</p>
        )}

        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{download.quality}</span>
          <span>•</span>
          <span>{download.format.toUpperCase()}</span>
          {download.channel && (
            <>
              <span>•</span>
              <span>{download.channel}</span>
            </>
          )}
          {download.duration > 0 && (
            <>
              <span>•</span>
              <span>{formatDuration(download.duration)}</span>
            </>
          )}
          {download.completedAt && (
            <>
              <span>•</span>
              <span>{formatRelativeTime(download.completedAt)}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {download.status === "completed" && (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={onPlay}
              disabled={!canPlay}
              title={canPlay ? "Play" : "Waiting for the file location"}
              aria-label="Play"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onOpenFolder}
              title="Show in folder"
              aria-label="Show in folder"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onViewLibrary}
              title="View in Library"
              aria-label="View in Library"
            >
              <Library className="h-4 w-4" />
            </Button>
          </>
        )}

        {download.status === "downloading" && (
          <Button size="icon" variant="ghost" onClick={onPause} title="Pause" aria-label="Pause">
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {download.status === "paused" && (
          <Button size="icon" variant="ghost" onClick={onResume} title="Resume" aria-label="Resume">
            <Play className="h-4 w-4" />
          </Button>
        )}

        {(download.status === "failed" || download.status === "cancelled") && (
          <Button size="icon" variant="ghost" onClick={onRetry} title="Retry" aria-label="Retry">
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}

        {isActive ? (
          <Button size="icon" variant="ghost" onClick={onCancel} title="Cancel" aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="icon" variant="ghost" onClick={onRemove} title="Remove" aria-label="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
});
