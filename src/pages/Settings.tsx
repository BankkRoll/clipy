/**
 * Settings page: every backend setting grouped into tabs, plus maintenance
 * actions (binaries, cache, reset) and the update check.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useSettings, useCacheStats, useBinaryStatus, useAppVersion } from "@/hooks";
import { useThemeStore } from "@/stores/settingsStore";
import { useUpdaterStore } from "@/stores/updaterStore";
import { logger } from "@/lib/logger";
import {
  SETTINGS_TABS,
  GeneralTab,
  DownloadsTab,
  QualityTab,
  SubtitlesTab,
  SponsorBlockTab,
  NetworkTab,
  AdvancedTab,
  AboutTab,
} from "@/components/settings";

function useSystemPrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  return dark;
}

/** Settings page component. */
export function Settings() {
  const checkingUpdates = useUpdaterStore((state) => state.status === "checking");
  const checkForUpdate = useUpdaterStore((state) => state.checkForUpdate);
  const [activeTab, setActiveTab] = useState("general");
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
  const [installingYtdlp, setInstallingYtdlp] = useState(false);

  const theme = useThemeStore((state) => state.theme);
  const systemIsDark = useSystemPrefersDark();
  const isDark = theme === "dark" || (theme === "system" && systemIsDark);
  const appVersion = useAppVersion();

  const { settings, loading, error, refresh, updateSetting, resetSettings } = useSettings();
  const { stats: cacheStats, clearCache, refresh: refreshCache } = useCacheStats();
  const {
    status: binaryStatus,
    loading: binaryLoading,
    installFfmpeg,
    installYtdlp,
    updateYtdlp,
    refresh: refreshBinaries,
    ytdlpUpdate,
    checkingYtdlpUpdate,
    checkYtdlpUpdate,
  } = useBinaryStatus();

  // Check for a newer yt-dlp once, the first time the tools are on screen.
  const ytdlpCheckedRef = useRef(false);
  useEffect(() => {
    if (activeTab !== "advanced" || !binaryStatus?.ytdlpInstalled || ytdlpCheckedRef.current)
      return;
    ytdlpCheckedRef.current = true;
    void checkYtdlpUpdate();
  }, [activeTab, binaryStatus?.ytdlpInstalled, checkYtdlpUpdate]);

  const runBinaryTask = useCallback(
    async (
      setBusy: (busy: boolean) => void,
      task: () => Promise<void>,
      success: string,
      failure: string
    ) => {
      setBusy(true);
      try {
        await task();
        toast.success(success);
      } catch (err) {
        logger.error("Settings", failure, err);
        // useBinaryStatus rethrows backend failures as Error.
        toast.error(failure, { description: (err as Error).message });
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleUpdateYtdlp = useCallback(
    () =>
      runBinaryTask(
        setUpdatingYtdlp,
        updateYtdlp,
        "yt-dlp updated successfully",
        "Failed to update yt-dlp"
      ),
    [runBinaryTask, updateYtdlp]
  );
  const handleInstallFfmpeg = useCallback(
    () =>
      runBinaryTask(
        setInstallingFfmpeg,
        installFfmpeg,
        "FFmpeg installed successfully",
        "Failed to install FFmpeg"
      ),
    [runBinaryTask, installFfmpeg]
  );
  const handleInstallYtdlp = useCallback(
    () =>
      runBinaryTask(
        setInstallingYtdlp,
        installYtdlp,
        "yt-dlp installed successfully",
        "Failed to install yt-dlp"
      ),
    [runBinaryTask, installYtdlp]
  );

  // A found update opens the app-wide update dialog (AppUpdater), so only the
  // "nothing new" and failure outcomes need a toast here.
  const handleCheckForUpdates = useCallback(async () => {
    const outcome = await checkForUpdate({ manual: true });
    if (outcome === "up-to-date") {
      toast.success("You're up to date!", {
        description: `Clipy ${appVersion} is the latest version.`,
      });
    } else if (outcome === "error") {
      toast.error("Failed to check for updates", {
        description: "Could not reach the update server. Try again later.",
      });
    }
  }, [appVersion, checkForUpdate]);

  const handleUpdateSetting = useCallback(
    async (path: string, value: unknown) => {
      try {
        await updateSetting(path, value);
      } catch (err) {
        logger.error("Settings", `Failed to save ${path}`, err);
        toast.error("Failed to save setting", { description: String(err) });
        return;
      }
      // Concurrency is read by the live queue, not just on next launch.
      if (path === "download.maxConcurrentDownloads") {
        try {
          await invoke("set_max_concurrent_downloads", { max: Number(value) });
        } catch (err) {
          logger.error("Settings", "Failed to apply concurrency live", err);
        }
      }
    },
    [updateSetting]
  );

  const handleBrowseDownloadPath = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Download Folder",
      });
      if (selected && typeof selected === "string") {
        await updateSetting("download.downloadPath", selected);
        toast.success("Download location updated");
      }
    } catch (err) {
      logger.error("Settings", "Failed to select folder:", err);
      toast.error("Failed to update download location");
    }
  }, [updateSetting]);

  const handleClearCache = useCallback(async () => {
    const confirmed = await ask("This will remove all cached thumbnails and temporary files.", {
      title: "Clear Cache",
      kind: "warning",
    });
    if (!confirmed) return;
    try {
      await clearCache();
      toast.success("Cache cleared successfully");
    } catch (err) {
      logger.error("Settings", "Failed to clear cache:", err);
      toast.error("Failed to clear cache");
    }
  }, [clearCache]);

  const handleResetSettings = useCallback(async () => {
    const confirmed = await ask(
      "This will reset all settings to their default values. This action cannot be undone.",
      { title: "Reset All Settings", kind: "warning" }
    );
    if (!confirmed) return;
    try {
      await resetSettings();
      toast.success("Settings reset to defaults");
    } catch (err) {
      logger.error("Settings", "Failed to reset settings:", err);
      toast.error("Failed to reset settings");
    }
  }, [resetSettings]);

  const handleFactoryReset = useCallback(async () => {
    const confirmed = await ask(
      "This will reset every setting to its default, clear cached thumbnails and temporary files, and restart the setup wizard. Your library and downloaded files are not affected.\n\nContinue?",
      { title: "Factory Reset", kind: "warning" }
    );
    if (!confirmed) return;

    const doubleConfirmed = await ask("This cannot be undone. Reset Clipy now?", {
      title: "Confirm Factory Reset",
      kind: "warning",
    });
    if (!doubleConfirmed) return;

    try {
      await resetSettings();
      await clearCache();
      // Clears the onboarding flag and local caches so the wizard runs again.
      localStorage.clear();
      sessionStorage.clear();
      toast.success("Factory reset complete. Restarting...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      logger.error("Settings", "Failed to factory reset:", err);
      toast.error("Failed to complete factory reset");
    }
  }, [resetSettings, clearCache]);

  if (loading && !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (error || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-4 text-sm text-destructive">Failed to load settings</p>
          {error && <p className="mt-1 text-xs text-muted-foreground">{error}</p>}
          <Button onClick={refresh} className="mt-4" variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Settings</h1>
          <Badge variant="secondary" className="text-[10px]">
            v{appVersion}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label="Reload settings"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetSettings}>
            Reset All
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full">
          <div className="w-48 flex-shrink-0 border-r border-border bg-muted/30 p-3">
            <TabsList className="flex h-auto w-full flex-col gap-1 bg-transparent">
              {SETTINGS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="w-full justify-start px-3 py-2 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
                >
                  {tab.label}
                  <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl p-6">
              <TabsContent value="general" className="mt-0">
                <GeneralTab settings={settings} onUpdateSetting={handleUpdateSetting} />
              </TabsContent>

              <TabsContent value="downloads" className="mt-0">
                <DownloadsTab
                  settings={settings}
                  onUpdateSetting={handleUpdateSetting}
                  onBrowseDownloadPath={handleBrowseDownloadPath}
                />
              </TabsContent>

              <TabsContent value="quality" className="mt-0">
                <QualityTab settings={settings} onUpdateSetting={handleUpdateSetting} />
              </TabsContent>

              <TabsContent value="subtitles" className="mt-0">
                <SubtitlesTab settings={settings} onUpdateSetting={handleUpdateSetting} />
              </TabsContent>

              <TabsContent value="sponsorblock" className="mt-0">
                <SponsorBlockTab settings={settings} onUpdateSetting={handleUpdateSetting} />
              </TabsContent>

              <TabsContent value="network" className="mt-0">
                <NetworkTab settings={settings} onUpdateSetting={handleUpdateSetting} />
              </TabsContent>

              <TabsContent value="advanced" className="mt-0">
                <AdvancedTab
                  settings={settings}
                  onUpdateSetting={handleUpdateSetting}
                  cacheStats={cacheStats}
                  onClearCache={handleClearCache}
                  onRefreshCache={refreshCache}
                  binaryStatus={binaryStatus}
                  binaryLoading={binaryLoading}
                  onRefreshBinaries={refreshBinaries}
                  onInstallFfmpeg={handleInstallFfmpeg}
                  onInstallYtdlp={handleInstallYtdlp}
                  onUpdateYtdlp={handleUpdateYtdlp}
                  installingFfmpeg={installingFfmpeg}
                  installingYtdlp={installingYtdlp}
                  updatingYtdlp={updatingYtdlp}
                  ytdlpUpdate={ytdlpUpdate}
                  checkingYtdlpUpdate={checkingYtdlpUpdate}
                  onCheckYtdlpUpdate={() => void checkYtdlpUpdate()}
                  onFactoryReset={handleFactoryReset}
                />
              </TabsContent>

              <TabsContent value="about" className="mt-0">
                <AboutTab
                  isDark={isDark}
                  version={appVersion}
                  checkingUpdates={checkingUpdates}
                  onCheckForUpdates={handleCheckForUpdates}
                />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
