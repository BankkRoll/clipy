import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import { FILENAME_PLACEHOLDERS } from "@/lib/constants";
import type { AppSettings } from "@/hooks/useSettings";

// Consistent width for all select triggers and number inputs
const SELECT_WIDTH = "w-[180px]";
const INPUT_WIDTH = "w-[180px]";

interface DownloadsTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
  onBrowseDownloadPath: () => void;
}

export function DownloadsTab({
  settings,
  onUpdateSetting,
  onBrowseDownloadPath,
}: DownloadsTabProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="Download Location" description="Where your files are saved">
        <SettingItem label="Default folder" vertical>
          <div className="flex gap-2">
            <Input
              value={settings.download.downloadPath}
              onChange={(e) => onUpdateSetting("download.downloadPath", e.target.value)}
              placeholder="Choose a folder..."
              className="flex-1 font-mono text-sm"
            />
            <Button variant="outline" onClick={onBrowseDownloadPath}>
              <FolderOpen className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
        </SettingItem>
        <SettingItem
          label="Organize by channel"
          description="Create subfolders for each YouTube channel"
        >
          <Switch
            checked={settings.download.createChannelSubfolder}
            onCheckedChange={(v) => onUpdateSetting("download.createChannelSubfolder", v)}
          />
        </SettingItem>
        <SettingItem
          label="Include date in filename"
          description="Add upload date to downloaded file names"
        >
          <Switch
            checked={settings.download.includeDateInFilename}
            onCheckedChange={(v) => onUpdateSetting("download.includeDateInFilename", v)}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Filename Template" description="Customize how files are named using yt-dlp placeholders">
        <SettingItem
          label="Template"
          description="Use placeholders to customize filenames"
          vertical
        >
          <div className="space-y-3">
            <Input
              value={settings.download.filenameTemplate || "%(title)s.%(ext)s"}
              onChange={(e) => onUpdateSetting("download.filenameTemplate", e.target.value)}
              placeholder="%(title)s.%(ext)s"
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              <TooltipProvider delayDuration={300}>
                {FILENAME_PLACEHOLDERS.map((p) => (
                  <Tooltip key={p.value}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          const current = settings.download.filenameTemplate || "%(title)s.%(ext)s";
                          const newValue = current.includes(p.value)
                            ? current
                            : current.replace(".%(ext)s", ` - ${p.value}.%(ext)s`);
                          onUpdateSetting("download.filenameTemplate", newValue);
                        }}
                      >
                        {p.label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-mono text-xs">{p.value}</p>
                      <p className="text-muted-foreground text-xs">{p.description}</p>
                    </TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
            </div>
          </div>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Concurrent Downloads" description="Control download speed and resources">
        <SettingItem
          label="Simultaneous downloads"
          description="Number of videos to download at once"
        >
          <Select
            value={String(settings.download.maxConcurrentDownloads)}
            onValueChange={(v) => onUpdateSetting("download.maxConcurrentDownloads", parseInt(v))}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{n} {n === 1 ? "download" : "downloads"}</span>
                    <span className="text-xs text-muted-foreground">
                      {n === 1 ? "Most stable" : n <= 3 ? "Balanced" : "Faster, uses more resources"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Metadata & Embedding" description="What gets included in downloaded files">
        <SettingItem label="Embed thumbnail" description="Add video thumbnail as album art">
          <Switch
            checked={settings.download.embedThumbnail}
            onCheckedChange={(v) => onUpdateSetting("download.embedThumbnail", v)}
          />
        </SettingItem>
        <SettingItem label="Embed metadata" description="Include title, description, channel info">
          <Switch
            checked={settings.download.embedMetadata}
            onCheckedChange={(v) => onUpdateSetting("download.embedMetadata", v)}
          />
        </SettingItem>
        <SettingItem label="Embed chapters" description="Include chapter markers in file">
          <Switch
            checked={settings.download.downloadChapters || false}
            onCheckedChange={(v) => onUpdateSetting("download.downloadChapters", v)}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Error Handling" description="What happens when downloads fail">
        <SettingItem label="Auto-retry failed downloads" description="Automatically retry on network errors">
          <Switch
            checked={settings.download.autoRetry}
            onCheckedChange={(v) => onUpdateSetting("download.autoRetry", v)}
          />
        </SettingItem>
        {settings.download.autoRetry && (
          <SettingItem label="Max retry attempts">
            <Select
              value={String(settings.download.retryAttempts)}
              onValueChange={(v) => onUpdateSetting("download.retryAttempts", parseInt(v))}
            >
              <SelectTrigger className={SELECT_WIDTH}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 5, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="flex flex-col py-0.5">
                      <span className="font-medium">{n} {n === 1 ? "attempt" : "attempts"}</span>
                      <span className="text-xs text-muted-foreground">
                        {n <= 2 ? "Quick failure" : n <= 5 ? "Balanced" : "Persistent"}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingItem>
        )}
      </SettingGroup>

      <SettingGroup title="Playlist Downloads" description="Control how playlists are downloaded">
        <SettingItem
          label="Start index"
          description="Start downloading from this position (0 = beginning)"
        >
          <Input
            type="number"
            min={0}
            value={settings.download.playlistStart || 0}
            onChange={(e) => onUpdateSetting("download.playlistStart", parseInt(e.target.value) || 0)}
            className={INPUT_WIDTH}
          />
        </SettingItem>
        <SettingItem
          label="End index"
          description="Stop downloading at this position (0 = download all)"
        >
          <Input
            type="number"
            min={0}
            value={settings.download.playlistEnd || 0}
            onChange={(e) => onUpdateSetting("download.playlistEnd", parseInt(e.target.value) || 0)}
            className={INPUT_WIDTH}
          />
        </SettingItem>
        <SettingItem
          label="Specific items"
          description="Download specific items only"
          vertical
        >
          <Input
            value={settings.download.playlistItems || ""}
            onChange={(e) => onUpdateSetting("download.playlistItems", e.target.value)}
            placeholder="e.g., 1,3,5-7"
            className="font-mono text-sm"
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Write Metadata Files" description="Save additional information alongside downloads">
        <SettingItem
          label="Write info JSON"
          description="Save video metadata as a .info.json file"
        >
          <Switch
            checked={settings.download.writeInfoJson || false}
            onCheckedChange={(v) => onUpdateSetting("download.writeInfoJson", v)}
          />
        </SettingItem>
        <SettingItem
          label="Write description"
          description="Save video description as a .description file"
        >
          <Switch
            checked={settings.download.writeDescription || false}
            onCheckedChange={(v) => onUpdateSetting("download.writeDescription", v)}
          />
        </SettingItem>
        <SettingItem
          label="Write thumbnail"
          description="Save video thumbnail as a separate image file"
        >
          <Switch
            checked={settings.download.writeThumbnail || false}
            onCheckedChange={(v) => onUpdateSetting("download.writeThumbnail", v)}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="File Management" description="Advanced file handling options">
        <SettingItem
          label="Restrict filenames"
          description="Use only ASCII characters in file names"
        >
          <Switch
            checked={settings.download.restrictFilenames || false}
            onCheckedChange={(v) => onUpdateSetting("download.restrictFilenames", v)}
          />
        </SettingItem>
        <SettingItem
          label="Download archive"
          description="Track downloads to prevent duplicates"
        >
          <Switch
            checked={settings.download.useDownloadArchive || false}
            onCheckedChange={(v) => onUpdateSetting("download.useDownloadArchive", v)}
          />
        </SettingItem>
      </SettingGroup>
    </div>
  );
}
