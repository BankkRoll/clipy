import { Download, ExternalLink, Globe, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BinaryErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binaryName: "FFmpeg" | "yt-dlp";
  errorType: "download_failed" | "missing" | "corrupted";
  errorMessage?: string;
  onRetry: () => void;
  onSkip?: () => void;
  isRetrying?: boolean;
}

const BINARY_INFO = {
  FFmpeg: {
    description: "Video encoding & processing",
    downloadUrl: "https://ffmpeg.org/download.html",
    size: "~85 MB",
  },
  "yt-dlp": {
    description: "Video downloading engine",
    downloadUrl: "https://github.com/yt-dlp/yt-dlp/releases",
    size: "~12 MB",
  },
};

const ERROR_MESSAGES = {
  download_failed: {
    title: "Download Failed",
    description: (name: string) => `Could not download ${name}. Please check your internet connection and try again.`,
    suggestions: [
      "Check your internet connection",
      "Disable your firewall temporarily",
      "Try using a VPN if the download is blocked",
      "Download manually from the official website",
    ],
  },
  missing: {
    title: "Component Missing",
    description: (name: string) => `${name} is missing from your system. This component is required for Clipy to work properly.`,
    suggestions: [
      "Click 'Re-download' to install it automatically",
      "Download manually from the official website",
      "Check if your antivirus removed it",
    ],
  },
  corrupted: {
    title: "Component Corrupted",
    description: (name: string) => `${name} appears to be corrupted or damaged. This may cause unexpected behavior.`,
    suggestions: [
      "Click 'Re-download' to reinstall it",
      "Check if your disk has errors",
      "Temporarily disable your antivirus",
    ],
  },
};

export function BinaryErrorDialog({
  open,
  onOpenChange,
  binaryName,
  errorType,
  errorMessage,
  onRetry,
  onSkip,
  isRetrying = false,
}: BinaryErrorDialogProps) {
  const info = BINARY_INFO[binaryName];
  const errorConfig = ERROR_MESSAGES[errorType];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <Download className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{errorConfig.title}</DialogTitle>
              <DialogDescription>
                {errorConfig.description(binaryName)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Component Info */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
            <div>
              <p className="font-medium">{binaryName}</p>
              <p className="text-sm text-muted-foreground">{info.description}</p>
            </div>
            <span className="text-sm text-muted-foreground">{info.size}</span>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Possible solutions:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {errorConfig.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>

          {/* Error details */}
          {errorMessage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-mono text-destructive break-all">
                {errorMessage}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" className="gap-1" asChild>
            <a
              href={info.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe className="h-3.5 w-3.5" />
              Download Manually
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
          <div className="flex gap-2">
            {onSkip && (
              <Button variant="ghost" onClick={onSkip}>
                Skip for Now
              </Button>
            )}
            <Button onClick={onRetry} disabled={isRetrying}>
              {isRetrying ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Re-download
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
