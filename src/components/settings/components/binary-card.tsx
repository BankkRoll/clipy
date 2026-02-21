import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BinaryCardProps {
  name: string;
  version?: string | null | undefined;
  installed: boolean;
  loading: boolean;
  installing: boolean;
  onInstall: () => void;
  onUpdate?: () => void;
  canUpdate?: boolean;
}

export function BinaryCard({
  name,
  version,
  installed,
  loading,
  installing,
  onInstall,
  onUpdate,
  canUpdate = false,
}: BinaryCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full",
          loading ? "bg-muted" : installed ? "bg-green-500/10" : "bg-destructive/10"
        )}>
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
            {loading ? "Checking status..." : installed ? `Version ${version}` : "Not installed"}
          </p>
        </div>
      </div>
      {!loading && (
        <div className="flex gap-2">
          {installed ? (
            canUpdate && onUpdate && (
              <Button variant="outline" size="sm" onClick={onUpdate} disabled={installing}>
                {installing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Update
              </Button>
            )
          ) : (
            <Button size="sm" onClick={onInstall} disabled={installing}>
              {installing && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Install
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
