import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import {
  VIDEO_QUALITIES,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  AUDIO_BITRATES,
  VIDEO_CODECS,
  AUDIO_CODECS,
  ENCODING_PRESETS,
} from "@/lib/constants";
import type { AppSettings } from "@/hooks/useSettings";

// Consistent width for all select triggers
const SELECT_WIDTH = "w-[180px]";

interface QualityTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
}

export function QualityTab({ settings, onUpdateSetting }: QualityTabProps) {
  // Get current values for display
  const currentFormat = AUDIO_FORMATS.find(f => f.value === (settings.download.audioFormat || "m4a"));
  const currentPreset = ENCODING_PRESETS.find(p => p.value === (settings.download.encodingPreset || "medium"));
  const currentVideoCodec = VIDEO_CODECS.find(c => c.value === (settings.download.videoCodec || "auto"));
  const currentAudioCodec = AUDIO_CODECS.find(c => c.value === (settings.download.audioCodec || "auto"));

  return (
    <div className="space-y-6">
      <SettingGroup title="Video Quality" description="Default settings for video downloads">
        <SettingItem label="Preferred resolution">
          <Select
            value={settings.download.defaultQuality}
            onValueChange={(v) => onUpdateSetting("download.defaultQuality", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_QUALITIES.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  <span className="flex items-center justify-between w-full gap-2">
                    <span>{q.label}</span>
                    {q.badge && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 shrink-0">
                        {q.badge}
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Container format">
          <Select
            value={settings.download.defaultFormat}
            onValueChange={(v) => onUpdateSetting("download.defaultFormat", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_FORMATS.map((f) => (
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

        <SettingItem label="Video codec">
          <Select
            value={settings.download.videoCodec || "auto"}
            onValueChange={(v) => onUpdateSetting("download.videoCodec", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue>
                {currentVideoCodec && (
                  <span className="flex flex-col items-start">
                    <span className="truncate">{currentVideoCodec.label}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {currentVideoCodec.description}
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VIDEO_CODECS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Encoding Settings" description="Advanced video encoding options">
        <SettingItem
          label="CRF Quality"
          description="Lower = better quality, larger file"
          vertical
        >
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <Slider
                value={[settings.download.crfQuality ?? 23]}
                onValueChange={([v]) => onUpdateSetting("download.crfQuality", v)}
                min={0}
                max={51}
                step={1}
                className="flex-1"
              />
              <span className="w-10 text-center font-mono text-sm tabular-nums bg-muted rounded px-2 py-1">
                {settings.download.crfQuality ?? 23}
              </span>
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground px-1">
              <span>Lossless (0)</span>
              <span>Typical (18-28)</span>
              <span>Worst (51)</span>
            </div>
          </div>
        </SettingItem>

        <SettingItem label="Encoding preset">
          <Select
            value={settings.download.encodingPreset || "medium"}
            onValueChange={(v) => onUpdateSetting("download.encodingPreset", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue>
                {currentPreset && (
                  <span className="flex flex-col items-start">
                    <span className="truncate">{currentPreset.label}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {currentPreset.description}
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENCODING_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-xs text-muted-foreground">{p.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Audio Quality" description="Default settings for audio extraction">
        <SettingItem label="Audio format">
          <Select
            value={settings.download.audioFormat || "m4a"}
            onValueChange={(v) => onUpdateSetting("download.audioFormat", v)}
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
              {AUDIO_FORMATS.map((f) => (
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

        <SettingItem label="Audio bitrate">
          <Select
            value={settings.download.audioBitrate || "192"}
            onValueChange={(v) => onUpdateSetting("download.audioBitrate", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIO_BITRATES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-xs text-muted-foreground">{b.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>

        <SettingItem label="Audio codec">
          <Select
            value={settings.download.audioCodec || "auto"}
            onValueChange={(v) => onUpdateSetting("download.audioCodec", v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue>
                {currentAudioCodec && (
                  <span className="flex flex-col items-start">
                    <span className="truncate">{currentAudioCodec.label}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {currentAudioCodec.description}
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUDIO_CODECS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs text-muted-foreground">{c.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>
    </div>
  );
}
