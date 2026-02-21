import {
  Download as DownloadIcon,
  Pause,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import type { DownloadStatus } from "@/types/download";

export const STATUS_CONFIG: Record<
  DownloadStatus,
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  pending: { label: "Queued", icon: Clock, color: "text-muted-foreground", bgColor: "bg-muted" },
  fetching: { label: "Fetching", icon: Loader2, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  downloading: { label: "Downloading", icon: DownloadIcon, color: "text-blue-500", bgColor: "bg-blue-500/10" },
  processing: { label: "Processing", icon: Loader2, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
  completed: { label: "Completed", icon: CheckCircle, color: "text-green-500", bgColor: "bg-green-500/10" },
  failed: { label: "Failed", icon: AlertCircle, color: "text-destructive", bgColor: "bg-destructive/10" },
  cancelled: { label: "Cancelled", icon: X, color: "text-muted-foreground", bgColor: "bg-muted" },
  paused: { label: "Paused", icon: Pause, color: "text-yellow-500", bgColor: "bg-yellow-500/10" },
} as const;

export const STATUS_PRIORITY: Record<DownloadStatus, number> = {
  downloading: 0,
  fetching: 1,
  processing: 2,
  pending: 3,
  paused: 4,
  completed: 5,
  failed: 6,
  cancelled: 7,
} as const;
