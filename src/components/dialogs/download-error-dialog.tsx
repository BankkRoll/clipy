import { useState } from "react";
import {
  WifiOff,
  RefreshCw,
  Copy,
  ChevronDown,
  ChevronUp,
  Globe,
  Shield,
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

interface DownloadErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
  videoTitle?: string;
  errorType: "network" | "unavailable" | "geo_blocked" | "private" | "age_restricted" | "unknown";
  errorMessage?: string;
  onRetry: () => void;
  onCancel: () => void;
  isRetrying?: boolean;
}

const ERROR_CONFIG = {
  network: {
    title: "Network Error",
    description: "Could not connect to download the video.",
    icon: WifiOff,
    suggestions: [
      "Check your internet connection",
      "Try disabling your VPN",
      "The site might be temporarily down",
    ],
  },
  unavailable: {
    title: "Video Unavailable",
    description: "This video is no longer available.",
    icon: Globe,
    suggestions: [
      "The video may have been deleted",
      "The video may have been made private",
      "Check if the URL is correct",
    ],
  },
  geo_blocked: {
    title: "Video Geo-Blocked",
    description: "This video is not available in your region.",
    icon: Globe,
    suggestions: [
      "Try using a VPN to change your location",
      "Enable geo-bypass in settings",
      "The uploader restricted access to certain countries",
    ],
  },
  private: {
    title: "Private Video",
    description: "This video requires authentication to access.",
    icon: Shield,
    suggestions: [
      "Configure browser cookies in settings",
      "Make sure you're logged in to the site",
      "The video may require a subscription",
    ],
  },
  age_restricted: {
    title: "Age-Restricted Content",
    description: "This video requires age verification.",
    icon: Shield,
    suggestions: [
      "Configure browser cookies in settings",
      "Log in to your account in the browser first",
      "Your account must have age verification completed",
    ],
  },
  unknown: {
    title: "Download Failed",
    description: "An error occurred while downloading.",
    icon: WifiOff,
    suggestions: [
      "Try downloading again",
      "Check if the URL is valid",
      "Update yt-dlp in settings",
    ],
  },
};

export function DownloadErrorDialog({
  open,
  onOpenChange,
  videoUrl,
  videoTitle,
  errorType,
  errorMessage,
  onRetry,
  onCancel,
  isRetrying = false,
}: DownloadErrorDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = ERROR_CONFIG[errorType];
  const Icon = config.icon;

  const handleCopyError = async () => {
    const text = `URL: ${videoUrl}\nError: ${errorMessage || config.description}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <Icon className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <DialogTitle>{config.title}</DialogTitle>
              <DialogDescription>{config.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video Info */}
          <div className="rounded-lg border bg-muted/30 p-3">
            {videoTitle && (
              <p className="font-medium text-sm truncate mb-1">{videoTitle}</p>
            )}
            <p className="text-xs text-muted-foreground font-mono truncate">
              {videoUrl}
            </p>
          </div>

          {/* Suggestions */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Possible solutions:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {config.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>

          {/* Error Details */}
          {errorMessage && (
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
                {showDetails ? "Hide" : "Show"} error details
              </button>
              {showDetails && (
                <div className="relative rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-7 px-2"
                    onClick={handleCopyError}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all pr-16 max-h-32 overflow-y-auto text-destructive/80">
                    {errorMessage}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
