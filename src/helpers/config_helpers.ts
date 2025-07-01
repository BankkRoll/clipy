import { app } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AppConfig } from '../types/config';

const configFilePath = join(app.getPath('userData'), 'config.json');

const defaultConfig: AppConfig = {
  download: {
    defaultVideoQuality: 'best',
    videoFormat: 'mp4',
    downloadSubtitles: true,
    downloadThumbnails: true,
    saveMetadata: true,
    createSubdirectories: true,
    concurrentDownloads: 3,
    autoRetryFailed: true,
    downloadPath: join(app.getPath('downloads'), 'Clipy'),
  },
  editor: {
    hardwareAcceleration: false,
    autoSaveProjects: true,
    realtimePreview: true,
  },
  storage: {
    tempPath: join(app.getPath('userData'), 'temp'),
    cachePath: join(app.getPath('userData'), 'cache'),
  },
};

let appConfig: AppConfig;

export function loadConfig(): AppConfig {
  if (appConfig) {
    return appConfig;
  }

  try {
    if (existsSync(configFilePath)) {
      const fileContent = readFileSync(configFilePath, 'utf-8');
      const storedConfig = JSON.parse(fileContent);
      appConfig = {
        ...defaultConfig,
        ...storedConfig,
        download: { ...defaultConfig.download, ...storedConfig.download },
        editor: { ...defaultConfig.editor, ...storedConfig.editor },
        storage: { ...defaultConfig.storage, ...storedConfig.storage },
      };
    } else {
      appConfig = defaultConfig;
    }
  } catch (error) {
    console.error('Error loading config file, falling back to defaults:', error);
    appConfig = defaultConfig;
  }

  saveConfig();
  return appConfig;
}

export function saveConfig(): void {
  try {
    writeFileSync(configFilePath, JSON.stringify(appConfig, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save config file:', error);
  }
}

export function getConfig(): AppConfig {
  return loadConfig();
}

export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  appConfig = { ...appConfig, ...updates };
  saveConfig();
  return appConfig;
}

export function updateDownloadConfig(updates: Partial<AppConfig['download']>): AppConfig {
    appConfig.download = { ...appConfig.download, ...updates };
    saveConfig();
    return appConfig;
}

export function updateEditorConfig(updates: Partial<AppConfig['editor']>): AppConfig {
    appConfig.editor = { ...appConfig.editor, ...updates };
    saveConfig();
    return appConfig;
} 