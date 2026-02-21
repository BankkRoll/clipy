import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { BinaryCard } from "../components/binary-card";
import { HW_ACCEL_TYPES } from "@/lib/constants";
import { formatBytes, cn } from "@/lib/utils";
import type { AppSettings } from "@/hooks/useSettings";

// Consistent width for all select triggers
const SELECT_WIDTH = "w-[180px]";

interface BinaryStatus {
  ffmpegInstalled: boolean;
  ffmpegVersion?: string | null;
  ytdlpInstalled: boolean;
  ytdlpVersion?: string | null;
}

interface CacheStats {
  totalSize: number;
}

interface AdvancedTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
  cacheStats: CacheStats | null;
  onClearCache: () => void;
  onRefreshCache: () => void;
  binaryStatus: BinaryStatus | null;
  binaryLoading: boolean;
  onRefreshBinaries: () => void;
  onInstallFfmpeg: () => void;
  onInstallYtdlp: () => void;
  onUpdateYtdlp: () => void;
  installingFfmpeg: boolean;
  installingYtdlp: boolean;
  updatingYtdlp: boolean;
  onFactoryReset?: () => void;
}

export function AdvancedTab({
  settings,
  onUpdateSetting,
  cacheStats,
  onClearCache,
  onRefreshCache,
  binaryStatus,
  binaryLoading,
  onRefreshBinaries,
  onInstallFfmpeg,
  onInstallYtdlp,
  onUpdateYtdlp,
  installingFfmpeg,
  installingYtdlp,
  updatingYtdlp,
  onFactoryReset,
}: AdvancedTabProps) {
  const currentHwAccel = HW_ACCEL_TYPES.find(
    t => t.value === (settings.advanced.hardwareAccelerationType || "auto")
  );

  return (
    <div className="space-y-6">
      <SettingGroup title="Performance" description="Video processing and encoding">
        <SettingItem
          label="Hardware acceleration"
          description="Use GPU for video encoding when available"
        >
          <Switch
            checked={settings.advanced.hardwareAcceleration}
            onCheckedChange={(v) => onUpdateSetting("advanced.hardwareAcceleration", v)}
          />
        </SettingItem>
        {settings.advanced.hardwareAcceleration && (
          <SettingItem
            label="Acceleration type"
            description="Select your GPU encoder"
          >
            <Select
              value={settings.advanced.hardwareAccelerationType || "auto"}
              onValueChange={(v) => onUpdateSetting("advanced.hardwareAccelerationType", v)}
            >
              <SelectTrigger className={SELECT_WIDTH}>
                <SelectValue>
                  {currentHwAccel && (
                    <span className="flex flex-col items-start">
                      <span className="truncate">{currentHwAccel.label}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {currentHwAccel.description}
                      </span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {HW_ACCEL_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex flex-col py-0.5">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingItem>
        )}
        <SettingItem label="Debug mode" description="Show detailed logs and diagnostics">
          <Switch
            checked={settings.advanced.debugMode}
            onCheckedChange={(v) => onUpdateSetting("advanced.debugMode", v)}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Storage" description="Manage cached data">
        <SettingItem
          label="Cache"
          description={`${cacheStats ? formatBytes(cacheStats.totalSize) : "0 MB"} used`}
        >
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClearCache}>
              Clear Cache
            </Button>
            <Button variant="ghost" size="icon" onClick={onRefreshCache}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Required Components" description="External tools needed for downloads">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-muted-foreground">
            These tools are required for downloading and processing videos
          </p>
          <Button variant="ghost" size="sm" onClick={onRefreshBinaries} disabled={binaryLoading}>
            <RefreshCw className={cn("h-3.5 w-3.5", binaryLoading && "animate-spin")} />
          </Button>
        </div>
        <div className="space-y-2">
          <BinaryCard
            name="FFmpeg"
            version={binaryStatus?.ffmpegVersion}
            installed={binaryStatus?.ffmpegInstalled || false}
            loading={binaryLoading}
            installing={installingFfmpeg}
            onInstall={onInstallFfmpeg}
          />
          <BinaryCard
            name="yt-dlp"
            version={binaryStatus?.ytdlpVersion}
            installed={binaryStatus?.ytdlpInstalled || false}
            loading={binaryLoading}
            installing={installingYtdlp || updatingYtdlp}
            onInstall={onInstallYtdlp}
            onUpdate={onUpdateYtdlp}
            canUpdate={true}
          />
        </div>
      </SettingGroup>

      <SettingGroup title="Danger Zone" description="Destructive actions">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 space-y-3">
              <div>
                <h4 className="font-medium text-destructive">Factory Reset</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Reset the application to its original state. This will delete all settings,
                  download history, library data, and cached files. You will need to go through
                  the onboarding process again.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={onFactoryReset}
                disabled={!onFactoryReset}
              >
                Reset Everything
              </Button>
            </div>
          </div>
        </div>
      </SettingGroup>
    </div>
  );
}
