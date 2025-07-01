import type {
  DownloadFilter,
  DownloadManagerContext,
  DownloadOptions
} from '../../../types/download';


import {
  DOWNLOAD_CANCEL_CHANNEL,
  DOWNLOAD_INFO_CHANNEL,
  DOWNLOAD_LIST_CHANNEL,
  DOWNLOAD_PROGRESS_CHANNEL,
  DOWNLOAD_START_CHANNEL
} from "./download-channels";

export function exposeDownloadContext(): void {
  const { contextBridge, ipcRenderer } = window.require("electron");
  
  const downloadManagerAPI: DownloadManagerContext = {
    start: (url: string, options?: DownloadOptions) => 
      ipcRenderer.invoke(DOWNLOAD_START_CHANNEL, url, options),
    
    getProgress: (downloadId?: string) => 
      ipcRenderer.invoke(DOWNLOAD_PROGRESS_CHANNEL, downloadId),
    
    cancel: (downloadId: string) => 
      ipcRenderer.invoke(DOWNLOAD_CANCEL_CHANNEL, downloadId),
    
    list: (filter?: DownloadFilter) => 
      ipcRenderer.invoke(DOWNLOAD_LIST_CHANNEL, filter),
    
    getInfo: (url: string) => 
      ipcRenderer.invoke(DOWNLOAD_INFO_CHANNEL, url),
  };

  contextBridge.exposeInMainWorld("downloadManager", downloadManagerAPI);
} 