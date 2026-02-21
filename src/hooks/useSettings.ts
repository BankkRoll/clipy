/**
 * Settings-related Tauri hooks
 */

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface AppSettings {
  general: GeneralSettings;
  download: DownloadSettings;
  editor: EditorSettings;
  appearance: AppearanceSettings;
  advanced: AdvancedSettings;
}

export interface GeneralSettings {
  language: string;
  launchOnStartup: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  checkForUpdates: boolean;
  autoUpdateBinaries: boolean;
}

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

  // Filename template
  filenameTemplate?: string;

  // Audio settings
  audioFormat?: string;
  audioBitrate?: string;
  audioCodec?: string;

  // Video settings
  videoCodec?: string;
  crfQuality?: number;
  encodingPreset?: string;

  // Subtitle settings
  downloadSubtitles?: boolean;
  autoSubtitles?: boolean;
  embedSubtitles?: boolean;
  subtitleFormat?: string;
  subtitleLanguage?: string;

  // SponsorBlock settings
  sponsorBlock?: boolean;
  sponsorBlockCategories?: string[];

  // Chapter settings
  downloadChapters?: boolean;
  splitByChapters?: boolean;

  // Playlist settings
  playlistStart?: number;
  playlistEnd?: number;
  playlistItems?: string;

  // Network/Performance settings
  rateLimit?: string;
  concurrentFragments?: number;
  cookiesFromBrowser?: string;

  // File handling settings
  restrictFilenames?: boolean;
  useDownloadArchive?: boolean;

  // Write metadata files
  writeInfoJson?: boolean;
  writeDescription?: boolean;
  writeThumbnail?: boolean;

  // Geo-bypass settings
  geoBypass?: boolean;
}

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

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  reducedMotion: boolean;
}

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
// Settings Hook
// ============================================================================

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<AppSettings>('get_settings');
      setSettings(result);
      setError(null);
    } catch (e) {
      setError(e?.toString() || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Update all settings
  const updateSettings = useCallback(
    async (newSettings: AppSettings) => {
      await invoke('update_settings', { settings: newSettings });
      setSettings(newSettings);
    },
    []
  );

  // Update a single setting
  const updateSetting = useCallback(
    async <T>(key: string, value: T) => {
      await invoke('update_setting', { key, value });
      // Refresh to get the updated settings
      await refresh();
    },
    [refresh]
  );

  // Get a single setting
  const getSetting = useCallback(async <T>(key: string): Promise<T> => {
    return invoke<T>('get_setting', { key });
  }, []);

  // Reset to defaults
  const resetSettings = useCallback(async () => {
    const defaultSettings = await invoke<AppSettings>('reset_settings');
    setSettings(defaultSettings);
    return defaultSettings;
  }, []);

  // Export settings
  const exportSettings = useCallback(async () => {
    return invoke<string>('export_settings');
  }, []);

  // Import settings
  const importSettings = useCallback(
    async (json: string) => {
      await invoke('import_settings', { json });
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

export function useTheme() {
  const { settings, updateSetting } = useSettings();

  const theme = settings?.appearance.theme || 'system';
  const accentColor = settings?.appearance.accentColor || '#3b82f6';
  const fontSize = settings?.appearance.fontSize || 'medium';
  const reducedMotion = settings?.appearance.reducedMotion || false;

  const setTheme = useCallback(
    async (newTheme: 'light' | 'dark' | 'system') => {
      await updateSetting('appearance.theme', newTheme);
    },
    [updateSetting]
  );

  const setAccentColor = useCallback(
    async (color: string) => {
      await updateSetting('appearance.accentColor', color);
    },
    [updateSetting]
  );

  const setFontSize = useCallback(
    async (size: 'small' | 'medium' | 'large') => {
      await updateSetting('appearance.fontSize', size);
    },
    [updateSetting]
  );

  const setReducedMotion = useCallback(
    async (reduced: boolean) => {
      await updateSetting('appearance.reducedMotion', reduced);
    },
    [updateSetting]
  );

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;

    // Determine actual theme
    let actualTheme = theme;
    if (theme === 'system') {
      actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }

    // Apply theme class
    root.classList.remove('light', 'dark');
    root.classList.add(actualTheme);

    // Apply accent color
    root.style.setProperty('--accent-color', accentColor);

    // Apply font size
    const fontSizeMap = { small: '14px', medium: '16px', large: '18px' };
    root.style.setProperty('--base-font-size', fontSizeMap[fontSize]);

    // Apply reduced motion
    if (reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [theme, accentColor, fontSize, reducedMotion]);

  return {
    theme,
    accentColor,
    fontSize,
    reducedMotion,
    setTheme,
    setAccentColor,
    setFontSize,
    setReducedMotion,
  };
}

// ============================================================================
// Download Settings Hook
// ============================================================================

export function useDownloadSettings() {
  const { settings, updateSetting } = useSettings();

  const downloadSettings = settings?.download;

  const setDownloadPath = useCallback(
    async (path: string) => {
      await updateSetting('download.downloadPath', path);
    },
    [updateSetting]
  );

  const setDefaultQuality = useCallback(
    async (quality: string) => {
      await updateSetting('download.defaultQuality', quality);
    },
    [updateSetting]
  );

  const setDefaultFormat = useCallback(
    async (format: string) => {
      await updateSetting('download.defaultFormat', format);
    },
    [updateSetting]
  );

  const setMaxConcurrent = useCallback(
    async (max: number) => {
      await updateSetting('download.maxConcurrentDownloads', max);
    },
    [updateSetting]
  );

  return {
    settings: downloadSettings,
    setDownloadPath,
    setDefaultQuality,
    setDefaultFormat,
    setMaxConcurrent,
  };
}
