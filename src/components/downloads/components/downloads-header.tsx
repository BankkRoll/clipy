import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DownloadsHeaderProps {
  activeCount: number;
  completedCount: number;
  onClearCompleted: () => void;
  onViewLibrary: () => void;
}

export function DownloadsHeader({
  activeCount,
  completedCount,
  onClearCompleted,
  onViewLibrary,
}: DownloadsHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Downloads</h1>
        {activeCount > 0 && (
          <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-medium text-white">
            {activeCount} active
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {completedCount > 0 && (
          <Button variant="outline" size="sm" onClick={onClearCompleted}>
            Clear finished
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onViewLibrary}>
          <Library className="mr-2 h-4 w-4" />
          View Library
        </Button>
      </div>
    </header>
  );
}
