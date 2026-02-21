import { useState } from "react";
import {
  XCircle,
  Copy,
  RefreshCw,
  FileText,
  ChevronDown,
  ChevronUp,
  FolderOpen,
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

interface ExportErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errorMessage: string;
  errorCode?: string;
  ffmpegOutput?: string;
  projectName?: string;
  outputPath?: string;
  onRetry: () => void;
  onViewLogs?: () => void;
  onOpenFolder?: () => void;
  isRetrying?: boolean;
}

export function ExportErrorDialog({
  open,
  onOpenChange,
  errorMessage,
  errorCode,
  ffmpegOutput,
  projectName,
  outputPath,
  onRetry,
  onViewLogs,
  onOpenFolder,
  isRetrying = false,
}: ExportErrorDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyError = async () => {
    const fullError = [
      `Error: ${errorMessage}`,
      errorCode ? `Code: ${errorCode}` : "",
      ffmpegOutput ? `\nFFmpeg Output:\n${ffmpegOutput}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await navigator.clipboard.writeText(fullError);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Parse common FFmpeg errors for user-friendly suggestions
  const getSuggestions = (): string[] => {
    const suggestions: string[] = [];

    if (errorMessage.toLowerCase().includes("disk") || errorMessage.toLowerCase().includes("space")) {
      suggestions.push("Free up disk space and try again");
    }
    if (errorMessage.toLowerCase().includes("permission") || errorMessage.toLowerCase().includes("access")) {
      suggestions.push("Check if the output folder is writable");
      suggestions.push("Run Clipy as administrator");
    }
    if (errorMessage.toLowerCase().includes("codec") || errorMessage.toLowerCase().includes("encoder")) {
      suggestions.push("Try a different video codec in settings");
      suggestions.push("Disable hardware acceleration");
    }
    if (errorMessage.toLowerCase().includes("memory") || errorMessage.toLowerCase().includes("ram")) {
      suggestions.push("Close other applications to free up memory");
      suggestions.push("Try exporting at a lower resolution");
    }

    // Default suggestions
    if (suggestions.length === 0) {
      suggestions.push("Try exporting again");
      suggestions.push("Check the log file for more details");
      suggestions.push("Try with different export settings");
    }

    return suggestions;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <DialogTitle>Export Failed</DialogTitle>
              <DialogDescription>
                An error occurred while exporting
                {projectName ? ` "${projectName}"` : " your video"}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error message */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-destructive font-medium">{errorMessage}</p>
            {errorCode && (
              <p className="text-xs text-destructive/70 mt-1 font-mono">
                Error code: {errorCode}
              </p>
            )}
          </div>

          {/* Output path info */}
          {outputPath && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderOpen className="h-4 w-4 shrink-0" />
              <span className="truncate font-mono text-xs">{outputPath}</span>
            </div>
          )}

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Suggestions:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {getSuggestions().map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>

          {/* FFmpeg Output */}
          {ffmpegOutput && (
            <div className="space-y-2">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {showDetails ? "Hide" : "Show"} FFmpeg output
              </button>
              {showDetails && (
                <div className="relative rounded-lg border border-border bg-muted/50 p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-7 px-2"
                    onClick={handleCopyError}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all pr-16 max-h-40 overflow-y-auto text-muted-foreground">
                    {ffmpegOutput}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <div className="flex gap-2">
            {onViewLogs && (
              <Button variant="outline" size="sm" onClick={onViewLogs} className="gap-1">
                <FileText className="h-3.5 w-3.5" />
                View Logs
              </Button>
            )}
            {onOpenFolder && outputPath && (
              <Button variant="outline" size="sm" onClick={onOpenFolder} className="gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                Open Folder
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Try Again
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
