import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ChapterOptionsProps {
  downloadChapters: boolean;
  splitByChapters: boolean;
  onDownloadChaptersChange: (value: boolean) => void;
  onSplitByChaptersChange: (value: boolean) => void;
}

export function ChapterOptions({
  downloadChapters,
  splitByChapters,
  onDownloadChaptersChange,
  onSplitByChaptersChange,
}: ChapterOptionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Chapters</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="download-chapters" className="text-sm">Embed Chapters</Label>
          <Switch
            id="download-chapters"
            checked={downloadChapters}
            onCheckedChange={onDownloadChaptersChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="split-chapters" className="text-sm">Split by Chapters</Label>
          <Switch
            id="split-chapters"
            checked={splitByChapters}
            onCheckedChange={onSplitByChaptersChange}
          />
        </div>
      </div>
    </div>
  );
}
