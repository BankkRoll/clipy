import { Loader2, Download, Music, FileVideo, Subtitles, Merge, Settings2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { formatBytes, formatDuration } from "@/lib/utils";
import type { DownloadStatus, DownloadPhase } from "@/types/download";

interface DownloadProgressProps {
  status: DownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  phase?: DownloadPhase | undefined;
  message?: string | undefined;
}

const PHASE_CONFIG: Record<DownloadPhase, { icon: typeof Download; label: string }> = {
  fetching: { icon: Download, label: "Fetching video info..." },
  downloading_video: { icon: FileVideo, label: "Downloading video..." },
  downloading_audio: { icon: Music, label: "Downloading audio..." },
  downloading_subtitles: { icon: Subtitles, label: "Downloading subtitles..." },
  merging: { icon: Merge, label: "Merging video and audio..." },
  processing: { icon: Settings2, label: "Processing..." },
  embedding_metadata: { icon: Settings2, label: "Embedding metadata..." },
  complete: { icon: Download, label: "Complete" },
};

export function DownloadProgress({
  status,
  progress,
  downloadedBytes,
  totalBytes,
  speed,
  eta,
  phase,
  message,
}: DownloadProgressProps) {
  // Processing state (merging, embedding, etc.)
  if (status === "processing" || phase === "merging" || phase === "embedding_metadata" || phase === "processing") {
    const config = phase ? PHASE_CONFIG[phase] : { icon: Loader2, label: "Processing video..." };
    const Icon = config.icon;

    return (
      <div className="mt-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4 animate-spin" />
          <span>{message || config.label}</span>
        </div>
        <Progress value={100} className="h-1.5 mt-2" />
      </div>
    );
  }

  // Fetching state
  if (status === "fetching" || phase === "fetching") {
    return (
      <div className="mt-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{message || "Fetching video information..."}</span>
        </div>
      </div>
    );
  }

  // Not in a download state
  if (status !== "downloading") {
    return null;
  }

  // Get phase info
  const phaseConfig = phase ? PHASE_CONFIG[phase] : null;
  const PhaseIcon = phaseConfig?.icon || Download;
  const phaseLabel = message || phaseConfig?.label || "Downloading...";

  return (
    <div className="mt-2">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
        <PhaseIcon className="h-3.5 w-3.5" />
        <span>{phaseLabel}</span>
      </div>

      {/* Progress stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>
          {totalBytes > 0
            ? `${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
            : downloadedBytes > 0
            ? `${formatBytes(downloadedBytes)} downloaded`
            : "Starting..."}
        </span>
        <span className="flex items-center gap-2">
          {speed > 0 && <span>{formatBytes(speed)}/s</span>}
          {eta > 0 && eta < 86400 && <span>{formatDuration(eta)} left</span>}
        </span>
      </div>

      {/* Progress bar */}
      <Progress value={Math.min(progress, 100)} className="h-1.5" />

      {/* Percentage */}
      <div className="text-xs text-muted-foreground mt-1">
        {Math.round(Math.min(progress, 100))}% complete
      </div>
    </div>
  );
}
