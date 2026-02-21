import { HardDrive, Trash2, FolderOpen, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";

interface DiskSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivePath: string;
  totalSpace: number;
  usedSpace: number;
  requiredSpace: number;
  onChooseDifferentFolder: () => void;
  onOpenDiskCleanup?: () => void;
  onContinueAnyway?: () => void;
}

export function DiskSpaceDialog({
  open,
  onOpenChange,
  drivePath,
  totalSpace,
  usedSpace,
  requiredSpace,
  onChooseDifferentFolder,
  onOpenDiskCleanup,
  onContinueAnyway,
}: DiskSpaceDialogProps) {
  const availableSpace = totalSpace - usedSpace;
  const usagePercent = Math.round((usedSpace / totalSpace) * 100);
  const isLow = availableSpace < requiredSpace;
  const isCritical = usagePercent > 95;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              isCritical ? "bg-destructive/10" : "bg-amber-500/10"
            }`}>
              <HardDrive className={`h-6 w-6 ${isCritical ? "text-destructive" : "text-amber-500"}`} />
            </div>
            <div className="space-y-1">
              <DialogTitle>
                {isCritical ? "Critical: Disk Almost Full" : "Low Disk Space"}
              </DialogTitle>
              <DialogDescription>
                {isLow
                  ? "Not enough space to complete this download."
                  : "Your disk is running low on space."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drive Info */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium font-mono">{drivePath}</span>
              <span className={`text-sm font-medium ${
                isCritical ? "text-destructive" : isLow ? "text-amber-500" : "text-muted-foreground"
              }`}>
                {usagePercent}% used
              </span>
            </div>
            <Progress
              value={usagePercent}
              className={`h-2 ${isCritical ? "[&>div]:bg-destructive" : isLow ? "[&>div]:bg-amber-500" : ""}`}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatBytes(usedSpace)} used</span>
              <span>{formatBytes(availableSpace)} free</span>
            </div>
          </div>

          {/* Space Comparison */}
          {isLow && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-muted-foreground">Available</p>
                <p className="text-lg font-semibold text-amber-500">
                  {formatBytes(availableSpace)}
                </p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Required</p>
                <p className="text-lg font-semibold">
                  ~{formatBytes(requiredSpace)}
                </p>
              </div>
            </div>
          )}

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What you can do:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Choose a folder on a different drive
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Delete unused files to free up space
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">•</span>
                Empty your recycle bin
              </li>
              {!isLow && (
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Continue anyway (not recommended)
                </li>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onOpenDiskCleanup && (
            <Button variant="outline" size="sm" onClick={onOpenDiskCleanup} className="gap-1">
              <Trash2 className="h-3.5 w-3.5" />
              Disk Cleanup
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          <div className="flex gap-2">
            {onContinueAnyway && !isLow && (
              <Button variant="ghost" onClick={onContinueAnyway}>
                Continue Anyway
              </Button>
            )}
            <Button onClick={onChooseDifferentFolder}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Choose Different Folder
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
