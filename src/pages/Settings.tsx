import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { APP_VERSION } from "@/lib/constants";
import { useSettings, useCacheStats, useBinaryStatus } from "@/hooks";
import { useThemeStore } from "@/stores/settingsStore";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
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

export function Settings() {
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false);
  const [installingYtdlp, setInstallingYtdlp] = useState(false);

  const theme = useThemeStore((state) => state.theme);

  // Track system theme changes when theme is set to "system"
  const [systemIsDark, setSystemIsDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemIsDark);

  const {
    settings,
    loading,
    error,
    refresh,
    updateSetting,
    resetSettings: resetToDefaults
  } = useSettings();

  const { stats: cacheStats, clearCache, refresh: refreshCache } = useCacheStats();
  const { status: binaryStatus, loading: binaryLoading, installFfmpeg, installYtdlp, updateYtdlp, refresh: refreshBinaries } = useBinaryStatus();

  const handleUpdateYtdlp = useCallback(async () => {
    setUpdatingYtdlp(true);
    try {
      await updateYtdlp();
      toast.success("yt-dlp updated successfully");
      await refreshBinaries();
    } catch {
      toast.error("Failed to update yt-dlp");
    } finally {
      setUpdatingYtdlp(false);
    }
  }, [updateYtdlp, refreshBinaries]);

  const handleInstallFfmpeg = useCallback(async () => {
    setInstallingFfmpeg(true);
    try {
      await installFfmpeg();
      toast.success("FFmpeg installed successfully");
      await refreshBinaries();
    } catch {
      toast.error("Failed to install FFmpeg");
    } finally {
      setInstallingFfmpeg(false);
    }
  }, [installFfmpeg, refreshBinaries]);

  const handleInstallYtdlp = useCallback(async () => {
    setInstallingYtdlp(true);
    try {
      await installYtdlp();
      toast.success("yt-dlp installed successfully");
      await refreshBinaries();
    } catch {
      toast.error("Failed to install yt-dlp");
    } finally {
      setInstallingYtdlp(false);
    }
  }, [installYtdlp, refreshBinaries]);

  const handleCheckForUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      toast.success("You're up to date!", {
        description: `Clipy ${APP_VERSION} is the latest version.`,
      });
    } catch {
      toast.error("Failed to check for updates");
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

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
    }
  }, [updateSetting]);

  const handleClearCache = useCallback(async () => {
    const confirmed = await ask("This will remove all cached thumbnails and temporary files.", {
      title: "Clear Cache",
      kind: "warning",
    });
    if (confirmed) {
      try {
        await clearCache();
        await refreshCache();
        toast.success("Cache cleared successfully");
      } catch (err) {
        logger.error("Settings", "Failed to clear cache:", err);
        toast.error("Failed to clear cache");
      }
    }
  }, [clearCache, refreshCache]);

  const handleResetSettings = useCallback(async () => {
    const confirmed = await ask("This will reset all settings to their default values. This action cannot be undone.", {
      title: "Reset All Settings",
      kind: "warning",
    });
    if (confirmed) {
      try {
        await resetToDefaults();
        toast.success("Settings reset to defaults");
      } catch (err) {
        logger.error("Settings", "Failed to reset settings:", err);
        toast.error("Failed to reset settings");
      }
    }
  }, [resetToDefaults]);

  const handleFactoryReset = useCallback(async () => {
    const confirmed = await ask(
      "This will completely reset the application to its original state. All settings, download history, library data, and cached files will be permanently deleted. This action cannot be undone.\n\nAre you absolutely sure you want to continue?",
      {
        title: "Factory Reset",
        kind: "warning",
      }
    );
    if (confirmed) {
      // Double confirmation for destructive action
      const doubleConfirmed = await ask(
        "This is your last chance to cancel. All your data will be permanently deleted.",
        {
          title: "Confirm Factory Reset",
          kind: "warning",
        }
      );
      if (doubleConfirmed) {
        try {
          // Clear all local storage
          localStorage.clear();
          sessionStorage.clear();

          // Reset settings to defaults
          await resetToDefaults();

          // Clear cache
          await clearCache();

          toast.success("Factory reset complete. Restarting...");

          // Reload the app after a short delay
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } catch (err) {
          logger.error("Settings", "Failed to factory reset:", err);
          toast.error("Failed to complete factory reset");
        }
      }
    }
  }, [resetToDefaults, clearCache]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Theme is applied globally in App.tsx - no need for duplicate effect here

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

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
          <p className="mt-4 text-sm text-destructive">Failed to load settings</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <Button onClick={refresh} className="mt-4" variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-6 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Settings</h1>
          <Badge variant="secondary" className="text-[10px]">v{APP_VERSION}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetSettings}>
            Reset All
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full">
          {/* Sidebar Navigation */}
          <div className="w-48 flex-shrink-0 border-r border-border bg-muted/30 p-3">
            <TabsList className="flex flex-col h-auto w-full bg-transparent gap-1">
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

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">
            <div className="max-w-2xl p-6">
              <TabsContent value="general" className="mt-0">
                <GeneralTab settings={settings} onUpdateSetting={updateSetting} />
              </TabsContent>

              <TabsContent value="downloads" className="mt-0">
                <DownloadsTab
                  settings={settings}
                  onUpdateSetting={updateSetting}
                  onBrowseDownloadPath={handleBrowseDownloadPath}
                />
              </TabsContent>

              <TabsContent value="quality" className="mt-0">
                <QualityTab settings={settings} onUpdateSetting={updateSetting} />
              </TabsContent>

              <TabsContent value="subtitles" className="mt-0">
                <SubtitlesTab settings={settings} onUpdateSetting={updateSetting} />
              </TabsContent>

              <TabsContent value="sponsorblock" className="mt-0">
                <SponsorBlockTab settings={settings} onUpdateSetting={updateSetting} />
              </TabsContent>

              <TabsContent value="network" className="mt-0">
                <NetworkTab settings={settings} onUpdateSetting={updateSetting} />
              </TabsContent>

              <TabsContent value="advanced" className="mt-0">
                <AdvancedTab
                  settings={settings}
                  onUpdateSetting={updateSetting}
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
                  onFactoryReset={handleFactoryReset}
                />
              </TabsContent>

              <TabsContent value="about" className="mt-0">
                <AboutTab
                  isDark={isDark}
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
