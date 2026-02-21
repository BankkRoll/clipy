import { memo } from "react";
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
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";
import type { Download } from "@/types/download";
import { STATUS_CONFIG } from "../constants";
import { DownloadProgress } from "./download-progress";

interface DownloadItemProps {
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
  const status = STATUS_CONFIG[download.status];
  const StatusIcon = status.icon;
  const isAnimated =
    download.status === "downloading" ||
    download.status === "fetching" ||
    download.status === "processing";
  const isActive =
    download.status === "downloading" ||
    download.status === "fetching" ||
    download.status === "processing" ||
    download.status === "pending" ||
    download.status === "paused";

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border p-4 transition-colors",
        isActive ? "border-border bg-card" : "border-border/50 bg-card/50"
      )}
    >
      {/* Thumbnail */}
      <div className="relative h-20 w-36 flex-shrink-0 overflow-hidden rounded-md bg-muted">
        {download.thumbnail ? (
          <img
            src={download.thumbnail}
            alt={download.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <DownloadIcon className="h-8 w-8 text-muted-foreground/30" />
          </div>
        )}
        {/* Status badge overlay */}
        <div
          className={cn(
            "absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5",
            status.bgColor
          )}
        >
          <StatusIcon
            className={cn("h-3 w-3", status.color, isAnimated && "animate-spin")}
          />
          <span className={cn("text-xs font-medium", status.color)}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
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

        {/* Error message */}
        {download.error && (
          <p className="mt-2 text-sm text-destructive">{download.error}</p>
        )}

        {/* Success message */}
        {download.status === "completed" && (
          <p className="mt-2 text-sm text-green-600">
            Download completed successfully!
          </p>
        )}

        {/* Meta info */}
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

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Completed actions */}
        {download.status === "completed" && (
          <>
            <Button
              size="icon"
              variant="ghost"
              onClick={onPlay}
              title="Play"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onOpenFolder}
              title="Show in folder"
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onViewLibrary}
              title="View in Library"
            >
              <Library className="h-4 w-4" />
            </Button>
          </>
        )}

        {/* Pause/Resume */}
        {download.status === "downloading" && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onPause}
            title="Pause"
          >
            <Pause className="h-4 w-4" />
          </Button>
        )}
        {download.status === "paused" && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onResume}
            title="Resume"
          >
            <Play className="h-4 w-4" />
          </Button>
        )}

        {/* Retry failed */}
        {(download.status === "failed" || download.status === "cancelled") && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onRetry}
            title="Retry"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}

        {/* Cancel/Remove */}
        {isActive ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={onCancel}
            title="Cancel"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            onClick={onRemove}
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
});
