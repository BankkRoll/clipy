import { FolderX, FolderOpen, RefreshCw, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface FolderErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderPath: string;
  errorType: "inaccessible" | "not_found" | "permission_denied" | "disk_full";
  requiredSpace?: number;
  availableSpace?: number;
  onChooseNewFolder: () => void;
  onRetry: () => void;
  isRetrying?: boolean;
}

const ERROR_CONFIG = {
  inaccessible: {
    title: "Cannot Access Folder",
    description: "The download folder is not accessible.",
    icon: FolderX,
    suggestions: [
      "The drive may be disconnected",
      "The network share may be unavailable",
      "The folder may have been moved or deleted",
    ],
  },
  not_found: {
    title: "Folder Not Found",
    description: "The download folder does not exist.",
    icon: FolderX,
    suggestions: [
      "The folder may have been deleted",
      "Choose a new download location",
      "Create the folder manually and retry",
    ],
  },
  permission_denied: {
    title: "Permission Denied",
    description: "Clipy doesn't have permission to write to this folder.",
    icon: FolderX,
    suggestions: [
      "Run Clipy as administrator",
      "Check folder permissions",
      "Choose a different folder",
    ],
  },
  disk_full: {
    title: "Low Disk Space",
    description: "There isn't enough space to save this file.",
    icon: HardDrive,
    suggestions: [
      "Free up disk space",
      "Choose a folder on a different drive",
      "Delete unnecessary files",
    ],
  },
};

export function FolderErrorDialog({
  open,
  onOpenChange,
  folderPath,
  errorType,
  requiredSpace,
  availableSpace,
  onChooseNewFolder,
  onRetry,
  isRetrying = false,
}: FolderErrorDialogProps) {
  const config = ERROR_CONFIG[errorType];
  const Icon = config.icon;
  const isDiskError = errorType === "disk_full";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              isDiskError ? "bg-amber-500/10" : "bg-destructive/10"
            }`}>
              <Icon className={`h-6 w-6 ${isDiskError ? "text-amber-500" : "text-destructive"}`} />
            </div>
            <div className="space-y-1">
              <DialogTitle>{config.title}</DialogTitle>
              <DialogDescription>{config.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Folder path */}
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground mb-1">Current folder:</p>
            <p className="font-mono text-sm break-all">{folderPath}</p>
          </div>

          {/* Disk space info for disk_full error */}
          {isDiskError && (requiredSpace || availableSpace) && (
            <div className="grid grid-cols-2 gap-3">
              {availableSpace !== undefined && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="text-lg font-semibold text-amber-500">
                    {formatBytes(availableSpace)}
                  </p>
                </div>
              )}
              {requiredSpace !== undefined && (
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">Required</p>
                  <p className="text-lg font-semibold">
                    ~{formatBytes(requiredSpace)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What you can do:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {config.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onChooseNewFolder} className="gap-1">
            <FolderOpen className="h-4 w-4" />
            Choose New Folder
          </Button>
          <Button onClick={onRetry} disabled={isRetrying}>
            {isRetrying ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              "Retry"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
