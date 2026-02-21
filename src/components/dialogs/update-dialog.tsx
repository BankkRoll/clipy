import {
  Download,
  RefreshCw,
  Sparkles,
  Clock,
  XCircle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "app" | "ytdlp";
  currentVersion: string;
  newVersion: string;
  releaseNotes?: string[];
  downloadProgress?: number;
  downloadStatus?: "idle" | "downloading" | "ready" | "error";
  errorMessage?: string;
  onUpdate: () => void;
  onLater: () => void;
  onSkip?: () => void;
  onRestart?: () => void;
}

export function UpdateDialog({
  open,
  onOpenChange,
  type,
  currentVersion,
  newVersion,
  releaseNotes,
  downloadProgress = 0,
  downloadStatus = "idle",
  errorMessage,
  onUpdate,
  onLater,
  onSkip,
  onRestart,
}: UpdateDialogProps) {
  const isApp = type === "app";
  const title = isApp ? "Update Available" : "Component Update";
  const description = isApp
    ? `Clipy ${newVersion} is available`
    : `yt-dlp ${newVersion} is available`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Version info */}
          <div className="flex items-center justify-center gap-4 py-2">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Current</p>
              <Badge variant="outline" className="font-mono">
                v{currentVersion}
              </Badge>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground">New</p>
              <Badge variant="secondary" className="font-mono">
                v{newVersion}
              </Badge>
            </div>
          </div>

          {/* Release notes */}
          {releaseNotes && releaseNotes.length > 0 && downloadStatus === "idle" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">What's new:</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground max-h-32 overflow-y-auto">
                {releaseNotes.map((note, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Download Progress */}
          {downloadStatus === "downloading" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Downloading update...</span>
                <span className="font-mono">{Math.round(downloadProgress)}%</span>
              </div>
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          {/* Ready to install */}
          {downloadStatus === "ready" && (
            <div className="flex items-center gap-3 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
              <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="font-medium text-green-500">Ready to install!</p>
                <p className="text-sm text-muted-foreground">
                  {isApp
                    ? "Clipy will restart to complete the update."
                    : "The update will be applied in the background."}
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {downloadStatus === "error" && (
            <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium text-destructive">Update failed</p>
                <p className="text-sm text-muted-foreground">
                  {errorMessage || "Please try again later."}
                </p>
              </div>
            </div>
          )}

          {/* yt-dlp specific note */}
          {!isApp && downloadStatus === "idle" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>Updates in background, no restart needed</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {downloadStatus === "idle" && (
            <>
              {onSkip && (
                <Button variant="ghost" onClick={onSkip}>
                  Skip this version
                </Button>
              )}
              <Button variant="outline" onClick={onLater}>
                {isApp ? "Remind Me Later" : "Later"}
              </Button>
              <Button onClick={onUpdate}>
                <Download className="mr-2 h-4 w-4" />
                Update Now
              </Button>
            </>
          )}

          {downloadStatus === "downloading" && (
            <Button variant="outline" onClick={onLater}>
              Download in Background
            </Button>
          )}

          {downloadStatus === "ready" && (
            <>
              <Button variant="outline" onClick={onLater}>
                Later
              </Button>
              <Button onClick={onRestart}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {isApp ? "Restart Now" : "Apply Update"}
              </Button>
            </>
          )}

          {downloadStatus === "error" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={onUpdate}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
