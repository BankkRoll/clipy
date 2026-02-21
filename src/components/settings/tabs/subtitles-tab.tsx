import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import { SUBTITLE_FORMATS } from "@/lib/constants";
import { SUBTITLE_LANGUAGES } from "@/types/download";
import type { AppSettings } from "@/hooks/useSettings";

// Consistent width for all select triggers
const SELECT_WIDTH = "w-[180px]";

interface SubtitlesTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
}

export function SubtitlesTab({ settings, onUpdateSetting }: SubtitlesTabProps) {
  const currentLanguage = SUBTITLE_LANGUAGES.find(
    l => l.value === (settings.download.subtitleLanguage || "en")
  );
  const currentFormat = SUBTITLE_FORMATS.find(
    f => f.value === (settings.download.subtitleFormat || "srt")
  );

  return (
    <div className="space-y-6">
      <SettingGroup title="Subtitle Downloads" description="Configure automatic subtitle downloading">
        <SettingItem label="Download subtitles" description="Automatically download subtitles with videos">
          <Switch
            checked={settings.download.downloadSubtitles || false}
            onCheckedChange={(v) => onUpdateSetting("download.downloadSubtitles", v)}
          />
        </SettingItem>
      </SettingGroup>

      {settings.download.downloadSubtitles && (
        <>
          <SettingGroup title="Subtitle Preferences" description="Language and format options">
            <SettingItem label="Preferred language">
              <Select
                value={settings.download.subtitleLanguage || "en"}
                onValueChange={(v) => onUpdateSetting("download.subtitleLanguage", v)}
              >
                <SelectTrigger className={SELECT_WIDTH}>
                  <SelectValue>
                    {currentLanguage?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUBTITLE_LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingItem>
            <SettingItem label="Subtitle format">
              <Select
                value={settings.download.subtitleFormat || "srt"}
                onValueChange={(v) => onUpdateSetting("download.subtitleFormat", v)}
              >
                <SelectTrigger className={SELECT_WIDTH}>
                  <SelectValue>
                    {currentFormat && (
                      <span className="flex flex-col items-start">
                        <span className="truncate">{currentFormat.label}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {currentFormat.description}
                        </span>
                      </span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SUBTITLE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      <span className="flex flex-col py-0.5">
                        <span className="font-medium">{f.label}</span>
                        <span className="text-xs text-muted-foreground">{f.description}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingItem>
          </SettingGroup>

          <SettingGroup title="Subtitle Options" description="Additional subtitle settings">
            <SettingItem
              label="Embed in video file"
              description="Include subtitles as a track in the video"
            >
              <Switch
                checked={settings.download.embedSubtitles || false}
                onCheckedChange={(v) => onUpdateSetting("download.embedSubtitles", v)}
              />
            </SettingItem>
            <SettingItem
              label="Include auto-generated"
              description="Download YouTube's auto-generated captions"
            >
              <Switch
                checked={settings.download.autoSubtitles || false}
                onCheckedChange={(v) => onUpdateSetting("download.autoSubtitles", v)}
              />
            </SettingItem>
          </SettingGroup>
        </>
      )}
    </div>
  );
}
