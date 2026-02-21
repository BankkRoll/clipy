import { Switch } from "@/components/ui/switch";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import { cn } from "@/lib/utils";
import type { AppSettings } from "@/hooks/useSettings";
import { useThemeStore } from "@/stores/settingsStore";
import type { Theme } from "@/types/settings";

interface GeneralTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
}

export function GeneralTab({ settings, onUpdateSetting }: GeneralTabProps) {
  const setTheme = useThemeStore((state) => state.setTheme);

  const handleThemeChange = (theme: string) => {
    // Update both stores to keep them in sync
    onUpdateSetting("appearance.theme", theme);
    setTheme(theme as Theme);
  };

  return (
    <div className="space-y-6">
      <SettingGroup title="Appearance" description="Customize the look and feel">
        <SettingItem label="Theme" description="Choose your preferred color scheme">
          <div className="flex gap-1 p-1 rounded-lg bg-muted/50">
            {["light", "dark", "system"].map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                  settings.appearance.theme === t
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Startup Behavior" description="Control how the app launches">
        <SettingItem label="Launch on startup" description="Start app when you log into your computer">
          <Switch
            checked={settings.general.launchOnStartup}
            onCheckedChange={(v) => onUpdateSetting("general.launchOnStartup", v)}
          />
        </SettingItem>
        <SettingItem label="Start minimized" description="Minimize to system tray on launch">
          <Switch
            checked={settings.general.minimizeToTray}
            onCheckedChange={(v) => onUpdateSetting("general.minimizeToTray", v)}
          />
        </SettingItem>
        <SettingItem label="Close to tray" description="Keep running in background when closed">
          <Switch
            checked={settings.general.closeToTray}
            onCheckedChange={(v) => onUpdateSetting("general.closeToTray", v)}
          />
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Updates" description="Keep the app and tools up to date">
        <SettingItem label="Auto-check for updates" description="Periodically check for new versions">
          <Switch
            checked={settings.general.checkForUpdates}
            onCheckedChange={(v) => onUpdateSetting("general.checkForUpdates", v)}
          />
        </SettingItem>
        <SettingItem label="Auto-update binaries" description="Automatically update FFmpeg and yt-dlp">
          <Switch
            checked={settings.general.autoUpdateBinaries}
            onCheckedChange={(v) => onUpdateSetting("general.autoUpdateBinaries", v)}
          />
        </SettingItem>
      </SettingGroup>
    </div>
  );
}
