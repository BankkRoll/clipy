/**
 * Locally persisted settings caches.
 *
 * The backend (`get_settings`) is the source of truth. {@link useThemeStore}
 * only caches the theme in localStorage so the first paint uses the right
 * colors before backend settings load; `applyBackendSettings` keeps it in sync.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Theme, type AppSettings } from "@/types/settings";

/** Shape of the theme cache. */
export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * First-paint cache of `appearance.theme`. Write theme changes through
 * `useTheme().setTheme` so the backend is updated too.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "clipy-theme",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/**
 * Settings store - manages all app settings
 */
interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  updateGeneralSettings: (settings: Partial<AppSettings["general"]>) => void;
  updateDownloadSettings: (settings: Partial<AppSettings["download"]>) => void;
  updateEditorSettings: (settings: Partial<AppSettings["editor"]>) => void;
  updateAppearanceSettings: (settings: Partial<AppSettings["appearance"]>) => void;
  updateAdvancedSettings: (settings: Partial<AppSettings["advanced"]>) => void;
  resetSettings: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  general: {
    language: "en",
    launchOnStartup: false,
    minimizeToTray: true,
    closeToTray: true,
    checkForUpdates: true,
    autoUpdateBinaries: true,
  },
  download: {
    downloadPath: "",
    defaultQuality: "1080",
    defaultFormat: "mp4",
    maxConcurrentDownloads: 3,
    createChannelSubfolder: false,
    includeDateInFilename: false,
    embedThumbnail: true,
    embedMetadata: true,
    autoRetry: true,
    retryAttempts: 3,
    // New settings
    filenameTemplate: "%(title)s.%(ext)s",
    crfQuality: 23,
    encodingPreset: "medium",
    playlistStart: 0,
    playlistEnd: 0,
    playlistItems: "",
    writeInfoJson: false,
    writeDescription: false,
    writeThumbnail: false,
  },
  editor: {
    defaultProjectSettings: {
      width: 1920,
      height: 1080,
      fps: 30,
    },
    autoSave: true,
    autoSaveInterval: 60,
    showWaveforms: true,
    snapToClips: true,
    snapToPlayhead: true,
    defaultTransitionDuration: 0.5,
  },
  appearance: {
    theme: "system",
    accentColor: "#3b82f6",
    fontSize: "medium",
    reducedMotion: false,
  },
  advanced: {
    ffmpegPath: "",
    ytdlpPath: "",
    tempPath: "",
    cachePath: "",
    maxCacheSize: 500,
    hardwareAcceleration: true,
    hardwareAccelerationType: "auto",
    debugMode: false,
    proxyUrl: "",
  },
};

/** @deprecated Use backend settings via useSettings. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isLoading: false,

      updateGeneralSettings: (newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            general: { ...state.settings.general, ...newSettings },
          },
        })),

      updateDownloadSettings: (newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            download: { ...state.settings.download, ...newSettings },
          },
        })),

      updateEditorSettings: (newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            editor: { ...state.settings.editor, ...newSettings },
          },
        })),

      updateAppearanceSettings: (newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: { ...state.settings.appearance, ...newSettings },
          },
        })),

      updateAdvancedSettings: (newSettings) =>
        set((state) => ({
          settings: {
            ...state.settings,
            advanced: { ...state.settings.advanced, ...newSettings },
          },
        })),

      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "clipy-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
