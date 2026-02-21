import { ReactNode } from "react";
import {
  AlertTriangle,
  XCircle,
  RefreshCw,
  ExternalLink,
  Copy,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorSeverity = "error" | "warning" | "info";

interface ErrorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  severity?: ErrorSeverity;
  errorDetails?: string;
  errorCode?: string;
  suggestions?: string[];
  primaryAction?: {
    label: string;
    onClick: () => void;
    loading?: boolean;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  tertiaryAction?: {
    label: string;
    onClick: () => void;
  };
  learnMoreUrl?: string;
  children?: ReactNode;
}

const SEVERITY_CONFIG = {
  error: {
    icon: XCircle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    borderColor: "border-destructive/30",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  info: {
    icon: AlertTriangle,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
};

export function ErrorDialog({
  open,
  onOpenChange,
  title,
  description,
  severity = "error",
  errorDetails,
  errorCode,
  suggestions,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  learnMoreUrl,
  children,
}: ErrorDialogProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;

  const handleCopyError = async () => {
    if (errorDetails) {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                config.bgColor
              )}
            >
              <Icon className={cn("h-6 w-6", config.color)} />
            </div>
            <div className="space-y-1">
              <DialogTitle className="text-lg">{title}</DialogTitle>
              <DialogDescription className="text-sm">
                {description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Suggestions */}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Possible solutions:</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Custom content */}
          {children}

          {/* Error Details */}
          {errorDetails && (
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
                {showDetails ? "Hide" : "Show"} technical details
              </button>
              {showDetails && (
                <div
                  className={cn(
                    "relative rounded-lg border p-3",
                    config.borderColor,
                    config.bgColor
                  )}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-7 px-2"
                    onClick={handleCopyError}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" />
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                  {errorCode && (
                    <p className="text-xs font-mono text-muted-foreground mb-1">
                      Error Code: {errorCode}
                    </p>
                  )}
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all pr-16 max-h-32 overflow-y-auto">
                    {errorDetails}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {learnMoreUrl && (
            <Button variant="link" className="gap-1 px-0" asChild>
              <a href={learnMoreUrl} target="_blank" rel="noopener noreferrer">
                Learn more
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            {tertiaryAction && (
              <Button variant="ghost" onClick={tertiaryAction.onClick}>
                {tertiaryAction.label}
              </Button>
            )}
            {secondaryAction && (
              <Button variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                onClick={primaryAction.onClick}
                disabled={primaryAction.loading}
              >
                {primaryAction.loading && (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                )}
                {primaryAction.label}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
