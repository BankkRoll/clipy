import { Download, Loader2, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { YtdlpUpdateStatus } from "@/hooks/useTauri";

/** Update state for a tool that Clipy can update. */
export interface BinaryUpdateState {
  /** Comparison with the latest release; null until checked or if the check failed. */
  status: YtdlpUpdateStatus | null;
  checking: boolean;
  onCheck: () => void;
}

/** Props for {@link BinaryCard}. */
export interface BinaryCardProps {
  name: string;
  version?: string | null | undefined;
  installed: boolean;
  loading: boolean;
  installing: boolean;
  onInstall: () => void;
  onUpdate?: () => void;
  /** Present for tools Clipy can update; omitted for tools it only installs. */
  update?: BinaryUpdateState;
}

/** Second line under the tool name, e.g. "Version 1.2 · up to date". */
function statusLine(version: string | null | undefined, update?: BinaryUpdateState): string {
  const base = `Version ${version}`;
  if (!update) return base;
  if (update.checking) return `${base} · checking for updates…`;
  const { status } = update;
  if (!status) return base;
  if (!status.managed) return `${base} · managed outside Clipy`;
  return status.updateAvailable ? `${base} · ${status.latest} available` : `${base} · up to date`;
}

/** Install status of one external tool, with Install / Update actions. */
export function BinaryCard({
  name,
  version,
  installed,
  loading,
  installing,
  onInstall,
  onUpdate,
  update,
}: BinaryCardProps) {
  const status = update?.status;
  const updateTo = status?.managed && status.updateAvailable && onUpdate ? status.latest : null;
  // Offer a manual re-check when the automatic one couldn't reach GitHub.
  const recheck = update && !update.checking && !status ? update.onCheck : null;

  return (
    <div
      role="group"
      aria-label={name}
      className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            loading ? "bg-muted" : installed ? "bg-green-500/10" : "bg-destructive/10"
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : installed ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {loading
              ? "Checking status..."
              : installed
                ? statusLine(version, update)
                : "Not installed"}
          </p>
        </div>
      </div>
      {!loading && (
        <div className="flex gap-2">
          {!installed ? (
            <Button size="sm" onClick={onInstall} disabled={installing}>
              {installing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Install
            </Button>
          ) : updateTo ? (
            <Button variant="outline" size="sm" onClick={onUpdate} disabled={installing}>
              {installing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Update to {updateTo}
            </Button>
          ) : recheck ? (
            <Button variant="ghost" size="sm" onClick={recheck}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Check for updates
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
