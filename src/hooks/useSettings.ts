/**
 * Settings hooks. The backend (`get_settings` / `update_setting`) is the single
 * source of truth for settings.
 *
 * Responsibilities:
 * - load and update backend settings ({@link useSettings})
 * - push values with app-wide side effects (theme, debug logging) to their
 *   consumers whenever settings load ({@link applyBackendSettings})
 * - change the theme from anywhere ({@link useTheme})
 */

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { useThemeStore } from "@/stores/settingsStore";
import type { Theme } from "@/types/settings";

// ============================================================================
// Types
// ============================================================================

/** Backend settings; mirrors `AppSettings` in `src-tauri/src/models/settings.rs`. */
export interface AppSettings {
  general: GeneralSettings;
  download: DownloadSettings;
  editor: EditorSettings;
  appearance: AppearanceSettings;
  advanced: AdvancedSettings;
}

/** `general.*` settings. */
export interface GeneralSettings {
  language: string;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  checkForUpdates: boolean;
  autoUpdateBinaries: boolean;
}

/** `download.*` settings. Optional fields have backend serde defaults. */
export interface DownloadSettings {
  downloadPath: string;
  defaultQuality: string;
  defaultFormat: string;
  maxConcurrentDownloads: number;
  createChannelSubfolder: boolean;
  includeDateInFilename: boolean;
  embedThumbnail: boolean;
  embedMetadata: boolean;
  autoRetry: boolean;
  retryAttempts: number;
  filenameTemplate?: string;
  audioFormat?: string;
  audioBitrate?: string;
  audioCodec?: string;
  videoCodec?: string;
  crfQuality?: number;
  encodingPreset?: string;
  downloadSubtitles?: boolean;
  autoSubtitles?: boolean;
  embedSubtitles?: boolean;
  subtitleFormat?: string;
  subtitleLanguage?: string;
  sponsorBlock?: boolean;
  sponsorBlockCategories?: string[];
  downloadChapters?: boolean;
  splitByChapters?: boolean;
  playlistStart?: number;
  playlistEnd?: number;
  playlistItems?: string;
  rateLimit?: string;
  concurrentFragments?: number;
  cookiesFromBrowser?: string;
  restrictFilenames?: boolean;
  useDownloadArchive?: boolean;
  writeInfoJson?: boolean;
  writeDescription?: boolean;
  writeThumbnail?: boolean;
  geoBypass?: boolean;
}

/** `editor.*` settings. */
export interface EditorSettings {
  defaultProjectWidth: number;
  defaultProjectHeight: number;
  defaultProjectFps: number;
  autoSave: boolean;
  autoSaveInterval: number;
  showWaveforms: boolean;
  snapToClips: boolean;
  snapToPlayhead: boolean;
  defaultTransitionDuration: number;
}

/** `appearance.*` settings. */
export interface AppearanceSettings {
  theme: Theme;
  accentColor: string;
  fontSize: "small" | "medium" | "large";
  reducedMotion: boolean;
}

/** `advanced.*` settings. */
export interface AdvancedSettings {
  ffmpegPath: string;
  ytdlpPath: string;
  tempPath: string;
  cachePath: string;
  maxCacheSize: number;
  hardwareAcceleration: boolean;
  hardwareAccelerationType?: string;
  debugMode: boolean;
  proxyUrl: string;
}

// ============================================================================
// Side effects
// ============================================================================

/**
 * Push the parts of freshly loaded backend settings that other modules cache:
 * the logger's debug flag and the theme store (kept for first-paint only).
 *
 * @param settings - Settings as returned by the backend.
 */
export function applyBackendSettings(settings: AppSettings): void {
  logger.setDebugMode(Boolean(settings.advanced?.debugMode));
  const theme = settings.appearance?.theme;
  if (theme && useThemeStore.getState().theme !== theme) {
    useThemeStore.getState().setTheme(theme);
  }
}

// ============================================================================
// Settings Hook
// ============================================================================

/**
 * Load backend settings on mount and expose update commands.
 *
 * Update commands reject on backend failure; callers decide how to report it.
 *
 * @returns Settings (null until loaded), loading/error state and commands.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback((next: AppSettings) => {
    setSettings(next);
    applyBackendSettings(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      accept(await invoke<AppSettings>("get_settings"));
      setError(null);
    } catch (e) {
      setError(e?.toString() || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [accept]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateSettings = useCallback(
    async (newSettings: AppSettings) => {
      await invoke("update_settings", { settings: newSettings });
      accept(newSettings);
    },
    [accept]
  );

  const updateSetting = useCallback(
    async <T>(key: string, value: T) => {
      await invoke("update_setting", { key, value });
      await refresh();
    },
    [refresh]
  );

  const getSetting = useCallback(async <T>(key: string): Promise<T> => {
    return invoke<T>("get_setting", { key });
  }, []);

  const resetSettings = useCallback(async () => {
    const defaults = await invoke<AppSettings>("reset_settings");
    accept(defaults);
    return defaults;
  }, [accept]);

  const exportSettings = useCallback(async () => {
    return invoke<string>("export_settings");
  }, []);

  const importSettings = useCallback(
    async (json: string) => {
      await invoke("import_settings", { json });
      await refresh();
    },
    [refresh]
  );

  return {
    settings,
    loading,
    error,
    refresh,
    updateSettings,
    updateSetting,
    getSetting,
    resetSettings,
    exportSettings,
    importSettings,
  };
}

// ============================================================================
// Theme Hook
// ============================================================================

/**
 * Read and change the theme without loading all settings.
 *
 * `setTheme` applies the theme immediately via the theme store, then persists
 * it to the backend; if the backend rejects, the previous theme is restored and
 * the error rethrown.
 *
 * @returns The current theme and a `setTheme` command.
 */
export function useTheme() {
  const theme = useThemeStore((state) => state.theme);

  const setTheme = useCallback(async (next: Theme) => {
    const store = useThemeStore.getState();
    const previous = store.theme;
    store.setTheme(next);
    try {
      await invoke("update_setting", { key: "appearance.theme", value: next });
    } catch (err) {
      useThemeStore.getState().setTheme(previous);
      throw err;
    }
  }, []);

  return { theme, setTheme };
}
