import { Subtitles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SUBTITLE_LANGUAGES } from "@/types/download";

interface SubtitleOptionsProps {
  downloadSubtitles: boolean;
  subtitleLanguage: string;
  embedSubtitles: boolean;
  autoSubtitles: boolean;
  onDownloadSubtitlesChange: (value: boolean) => void;
  onSubtitleLanguageChange: (value: string) => void;
  onEmbedSubtitlesChange: (value: boolean) => void;
  onAutoSubtitlesChange: (value: boolean) => void;
}

export function SubtitleOptions({
  downloadSubtitles,
  subtitleLanguage,
  embedSubtitles,
  autoSubtitles,
  onDownloadSubtitlesChange,
  onSubtitleLanguageChange,
  onEmbedSubtitlesChange,
  onAutoSubtitlesChange,
}: SubtitleOptionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Subtitles className="h-4 w-4" />
        Subtitles
      </h4>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="download-subtitles" className="text-sm">Download Subtitles</Label>
          <Switch
            id="download-subtitles"
            checked={downloadSubtitles}
            onCheckedChange={onDownloadSubtitlesChange}
          />
        </div>
        {downloadSubtitles && (
          <>
            <div className="flex items-center gap-3">
              <Label className="text-sm min-w-[100px]">Language</Label>
              <Select value={subtitleLanguage} onValueChange={onSubtitleLanguageChange}>
                <SelectTrigger className="h-8 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBTITLE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="embed-subtitles" className="text-sm">Embed in Video</Label>
              <Switch
                id="embed-subtitles"
                checked={embedSubtitles}
                onCheckedChange={onEmbedSubtitlesChange}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="auto-subtitles" className="text-sm">Include Auto-Generated</Label>
              <Switch
                id="auto-subtitles"
                checked={autoSubtitles}
                onCheckedChange={onAutoSubtitlesChange}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
