import type {
  DownloadConfig,
  DownloadFilter,
  DownloadOptions,
  DownloadProgress,
  VideoInfo
} from '../../types/download';

import {
  createDownloadError,
  DownloadErrorCode,
  isDownloadError
} from '../../types/download';

import { downloadWithYouTubeJs, getVideoInfoFromYouTubeJs, initializeYouTubeJs, isYouTubeJsInitialized } from './youtubejs-provider';
import { downloadWithYtdlCore, getVideoInfoFromYtdl } from './ytdl-provider';

import { app } from 'electron';
import { get as httpsGet } from 'https';
import { EventEmitter } from 'node:events';
import { createWriteStream, existsSync, mkdirSync, unlink, writeFile } from 'node:fs';
import { join } from 'node:path';

interface DownloadManagerState {
  config: DownloadConfig;
  activeDownloads: Map<string, AbortController>;
  downloadHistory: Map<string, DownloadProgress>;
  eventEmitter: EventEmitter;
  initialized: boolean;
  youtubeJsReady: boolean;
}

let globalState: DownloadManagerState | null = null;

export async function initializeDownloadManager(config?: Partial<DownloadConfig>): Promise<void> {
  if (globalState && globalState.initialized) {
    return;
  }

  const defaultConfig: DownloadConfig = {
    maxConcurrentDownloads: 3,
    defaultOutputPath: join(app.getPath('downloads'), 'YouTube Downloads'),
    timeoutMs: 300000,
    maxRetries: 3,
    retryDelayMs: 2000,
    chunkSizeBytes: 1024 * 1024,
  };

  globalState = {
    config: { ...defaultConfig, ...config },
    activeDownloads: new Map(),
    downloadHistory: new Map(),
    eventEmitter: new EventEmitter(),
    initialized: false,
    youtubeJsReady: false
  };

  await ensureOutputDirectory(globalState.config.defaultOutputPath);
  
  try {
    await initializeYouTubeJs();
    globalState.youtubeJsReady = true;
    console.log('[YT-DLP-MANAGER] YouTubeJS initialized successfully');
    globalState.eventEmitter.emit('initialized', { youtubeJs: true, ytdl: true });
  } catch (error) {
    console.warn('[YT-DLP-MANAGER] YouTubeJS failed to initialize, will use ytdl-core only:', error);
    globalState.youtubeJsReady = false;
    globalState.eventEmitter.emit('initialized', { youtubeJs: false, ytdl: true });
  }

  globalState.initialized = true;
}

function ensureState(): DownloadManagerState {
  if (!globalState || !globalState.initialized) {
    throw createDownloadError('Download manager not initialized. Call initializeDownloadManager first.', DownloadErrorCode.UNKNOWN_ERROR);
  }
  return globalState;
}

async function ensureOutputDirectory(outputPath: string): Promise<void> {
  try {
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }
  } catch (error) {
    throw createDownloadError(
      'Failed to create output directory',
      DownloadErrorCode.PERMISSION_DENIED,
      error instanceof Error ? error : undefined
    );
  }
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const state = ensureState();

  console.log(`[YT-DLP-MANAGER] Getting video info for URL: ${url}`);
  const videoId = extractVideoId(url);

  if (!videoId) {
    throw createDownloadError(
      `Invalid YouTube URL: ${url}`,
      DownloadErrorCode.INVALID_URL
    );
  }

  if (state.youtubeJsReady && isYouTubeJsInitialized()) {
    try {
      console.log('[YT-DLP-MANAGER] Getting video info using YouTubeJS...');
      const info = await getVideoInfoFromYouTubeJs(videoId);
      if (info.formats.length > 0) {
        return info;
      }
      console.warn('[YT-DLP-MANAGER] YouTubeJS returned no formats, falling back.');
      throw new Error('No formats from YouTubeJS');
    } catch (error: unknown) {
      console.error('[YT-DLP-MANAGER] YouTubeJS failed to get info, falling back to ytdl-core:', error instanceof Error ? error.message : String(error));
    }
  }

  try {
    console.log('[YT-DLP-MANAGER] Getting video info using ytdl-core fallback...');
    const { parsed } = await getVideoInfoFromYtdl(videoId, state.config.timeoutMs);
    return parsed;
  } catch (fallbackError: unknown) {
    console.error('[YT-DLP-MANAGER] All providers failed to get video info:', fallbackError);
    throw fallbackError;
  }
}

export async function startDownload(url: string, options: DownloadOptions = {}): Promise<string> {
  const state = ensureState();

  if (state.activeDownloads.size >= state.config.maxConcurrentDownloads) {
    throw createDownloadError(
      `Maximum concurrent downloads (${state.config.maxConcurrentDownloads}) reached`,
      DownloadErrorCode.UNKNOWN_ERROR
    );
  }

  const downloadId = generateDownloadId();
  const controller = new AbortController();
  const videoId = extractVideoId(url);

  if (!videoId) {
    throw createDownloadError(`Invalid YouTube URL: ${url}`, DownloadErrorCode.INVALID_URL);
  }

  state.activeDownloads.set(downloadId, controller);

  (async () => {
    let progress: DownloadProgress | null = null;
    try {
      progress = {
        downloadId,
        url,
        title: 'Fetching video information...',
        progress: 0,
        speed: '0 B/s',
        eta: '--:--',
        size: '0 B',
        downloadedBytes: 0,
        totalBytes: 0,
        status: 'initializing',
        filePath: '',
        startTime: Date.now(),
        retryCount: 0,
        provider: options.provider || 'auto'
      };
      state.downloadHistory.set(downloadId, progress);
      state.eventEmitter.emit('progress', progress);

      const selectedProvider = options.provider || 'auto';
      console.log(`[YT-DLP-MANAGER] Selected provider: ${selectedProvider}`);

      if ((selectedProvider === 'youtubejs' || selectedProvider === 'auto') && 
          state.youtubeJsReady && isYouTubeJsInitialized()) {
        try {
          console.log('[YT-DLP-MANAGER] Attempting download with: YouTubeJS');
          progress.usedProvider = 'youtubejs';
          await downloadWithYouTubeJs(videoId, options, progress, state.eventEmitter, controller);
          return;
        } catch (youtubeJsError: unknown) {
          console.warn(`[YT-DLP-MANAGER] YouTubeJS Provider failed: ${youtubeJsError instanceof Error ? youtubeJsError.message : String(youtubeJsError)}.`);
          if (selectedProvider === 'youtubejs') {
            throw youtubeJsError;
          }
          progress.status = 'retrying';
          state.eventEmitter.emit('progress', progress);
        }
      }

      if (selectedProvider === 'ytdl-core' || selectedProvider === 'auto') {
        try {
          console.log('[YT-DLP-MANAGER] Attempting download with fallback: ytdl-core');
          progress.usedProvider = 'ytdl-core';
          await downloadWithYtdlCore(videoId, options, progress, state.eventEmitter, controller);
          return;
        } catch (ytdlCoreError: unknown) {
          console.error(`[YT-DLP-MANAGER] Fallback provider ytdl-core also failed: ${ytdlCoreError instanceof Error ? ytdlCoreError.message : String(ytdlCoreError)}`);
          throw ytdlCoreError;
        }
      }

      throw createDownloadError(
        'No download providers available. YouTubeJS is not initialized and ytdl-core is not selected.',
        DownloadErrorCode.NO_FORMAT_AVAILABLE
      );

    } catch (error) {
      const finalError = isDownloadError(error) ? error : createDownloadError(String(error), DownloadErrorCode.UNKNOWN_ERROR);
      if (progress) {
        progress.status = 'failed';
        progress.error = finalError;
        state.eventEmitter.emit('progress', progress);
        state.eventEmitter.emit('failed', {
          ...progress
        });
      }
      console.error(`[YT-DLP-MANAGER] Download failed permanently for ${downloadId}:`, finalError);
    } finally {
      state.activeDownloads.delete(downloadId);
    }
  })();

  return downloadId;
}

export function cancelDownload(downloadId: string): boolean {
  const state = ensureState();

  const controller = state.activeDownloads.get(downloadId);
  if (controller) {
    controller.abort();
    return true;
  }
  return false;
}

export function getActiveDownloads(): DownloadProgress[] {
  const state = ensureState();

  return Array.from(state.activeDownloads.keys())
    .map(id => state.downloadHistory.get(id))
    .filter((progress): progress is DownloadProgress => progress !== undefined);
}

export function getDownloadHistory(): DownloadProgress[] {
  const state = ensureState();

  return Array.from(state.downloadHistory.values())
    .sort((a, b) => b.startTime - a.startTime);
}

export function getDownloadProgress(downloadId: string): DownloadProgress | null {
  const state = ensureState();
  return state.downloadHistory.get(downloadId) || null;
}

export function getDownloadsByFilter(filter: DownloadFilter): DownloadProgress[] {
  const state = ensureState();

  let downloads: DownloadProgress[] = [];

  switch (filter) {
    case 'active':
      downloads = getActiveDownloads();
      break;
    case 'completed':
      downloads = getDownloadHistory().filter(d => d.status === 'completed');
      break;
    case 'failed':
      downloads = getDownloadHistory().filter(d => d.status === 'failed');
      break;
    case 'all':
    default:
      downloads = [...getActiveDownloads(), ...getDownloadHistory()];
      break;
  }

  return downloads.sort((a, b) => b.startTime - a.startTime);
}

export function addEventListener(event: string, listener: (...args: any[]) => void): void {
  const state = ensureState();
  state.eventEmitter.on(event, listener);
}

export function removeEventListener(event: string, listener: (...args: any[]) => void): void {
  const state = ensureState();
  state.eventEmitter.off(event, listener);
}

export function removeAllEventListeners(): void {
  const state = ensureState();
  state.eventEmitter.removeAllListeners();
}

function generateDownloadId(): string {
  return `clipy_dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
    /music\.youtube\.com\/watch\?v=([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export function cleanup(): void {
  if (globalState) {
    for (const controller of globalState.activeDownloads.values()) {
      controller.abort();
    }

    globalState.activeDownloads.clear();
    globalState.eventEmitter.removeAllListeners();
    globalState = null;
  }
} 