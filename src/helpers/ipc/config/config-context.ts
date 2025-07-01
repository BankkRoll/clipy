import type { ApiResponse } from '@/types/api';
import type {
    AppConfig,
    DownloadConfig,
    EditorConfig,
} from '@/types/config';
import type { StorageUsage, SystemInfo } from '@/types/system';
import {
    CONFIG_GET_CHANNEL,
    CONFIG_UPDATE_DOWNLOAD_CHANNEL,
    CONFIG_UPDATE_EDITOR_CHANNEL,
    STORAGE_CLEAR_CACHE_CHANNEL,
    STORAGE_GET_USAGE_CHANNEL,
    SYSTEM_GET_INFO_CHANNEL,
    SYSTEM_OPEN_DIALOG_CHANNEL,
} from './config-channels';

export type ConfigGetResponse = ApiResponse<AppConfig>;
export type ConfigUpdateResponse = ApiResponse<AppConfig>;
export type SystemInfoResponse = ApiResponse<SystemInfo>;
export type OpenDialogResponse = ApiResponse<string | undefined>;
export type StorageUsageResponse = ApiResponse<StorageUsage>;
export type ClearCacheResponse = ApiResponse<void>;

export interface ConfigManagerContext {
  get: () => Promise<ConfigGetResponse>;
  updateDownload: (
    updates: Partial<DownloadConfig>
  ) => Promise<ConfigUpdateResponse>;
  updateEditor: (
    updates: Partial<EditorConfig>
  ) => Promise<ConfigUpdateResponse>;
  getSystemInfo: () => Promise<SystemInfoResponse>;
  openDialog: () => Promise<OpenDialogResponse>;
  getStorageUsage: () => Promise<StorageUsageResponse>;
  clearCache: (type: 'temp' | 'thumbnails') => Promise<ClearCacheResponse>;
}

export function exposeConfigContext(): void {
  const { contextBridge, ipcRenderer } = window.require('electron');
  const configManager: ConfigManagerContext = {
    get: () => ipcRenderer.invoke(CONFIG_GET_CHANNEL),
    updateDownload: (updates) =>
      ipcRenderer.invoke(CONFIG_UPDATE_DOWNLOAD_CHANNEL, updates),
    updateEditor: (updates) =>
      ipcRenderer.invoke(CONFIG_UPDATE_EDITOR_CHANNEL, updates),
    getSystemInfo: () => ipcRenderer.invoke(SYSTEM_GET_INFO_CHANNEL),
    openDialog: () => ipcRenderer.invoke(SYSTEM_OPEN_DIALOG_CHANNEL),
    getStorageUsage: () => ipcRenderer.invoke(STORAGE_GET_USAGE_CHANNEL),
    clearCache: (type) => ipcRenderer.invoke(STORAGE_CLEAR_CACHE_CHANNEL, type),
  };
  contextBridge.exposeInMainWorld('configManager', configManager);
} 