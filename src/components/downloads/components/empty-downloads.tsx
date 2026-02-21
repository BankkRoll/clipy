import { Download as DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyDownloadsProps {
  onStartDownloading: () => void;
}

export function EmptyDownloads({ onStartDownloading }: EmptyDownloadsProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <DownloadIcon className="mx-auto h-16 w-16 text-muted-foreground/30" />
        <h2 className="mt-4 text-lg font-medium">No downloads</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Downloads you start will appear here
        </p>
        <Button variant="outline" className="mt-4" onClick={onStartDownloading}>
          Start Downloading
        </Button>
      </div>
    </div>
  );
}
