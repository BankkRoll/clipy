import { ipcMain, webContents } from "electron";

import type {
  DownloadFilter,
  DownloadOptions,
  DownloadProgress
} from '../../../types/download';

import {
  DownloadErrorCode,
  createDownloadError,
  isDownloadError
} from '../../../types/download';

import type {
  DownloadCancelResponse,
  DownloadListResponse,
  DownloadProgressResponse,
  DownloadStartResponse,
  VideoInfoResponse
} from '../../../types/api';

import {
  createErrorResponse,
  createSuccessResponse
} from '../../../types/api';

import { getConfig } from "../../config_helpers";
import {
  addEventListener,
  cancelDownload,
  cleanup,
  getActiveDownloads,
  getDownloadProgress,
  getDownloadsByFilter,
  getVideoInfo,
  initializeDownloadManager,
  startDownload
} from '../../downloader/yt-dlp-manager';

import {
  DOWNLOAD_CANCEL_CHANNEL,
  DOWNLOAD_INFO_CHANNEL,
  DOWNLOAD_LIST_CHANNEL,
  DOWNLOAD_PROGRESS_CHANNEL,
  DOWNLOAD_START_CHANNEL
} from "./download-channels";

let isDownloadManagerInitialized = false;

async function ensureDownloadManagerInitialized(): Promise<void> {
  if (isDownloadManagerInitialized) {
    return;
  }

  const config = getConfig();
  const downloadConfig = config.download;

  await initializeDownloadManager({
    maxConcurrentDownloads: downloadConfig.concurrentDownloads,
    defaultOutputPath: downloadConfig.downloadPath,
    maxRetries: downloadConfig.autoRetryFailed ? 3 : 0,
    timeoutMs: 300000,
    retryDelayMs: 2000
  });

  addEventListener('progress', (progress: DownloadProgress) => {
    webContents.getAllWebContents().forEach(webContent => {
      if (!webContent.isDestroyed()) {
        webContent.send('download-progress-update', progress);
      }
    });
  });

  addEventListener('completed', (progress: DownloadProgress) => {
    webContents.getAllWebContents().forEach(webContent => {
      if (!webContent.isDestroyed()) {
        webContent.send('download-completed', progress);
      }
    });
  });

  addEventListener('failed', (progress: DownloadProgress) => {
    webContents.getAllWebContents().forEach(webContent => {
      if (!webContent.isDestroyed()) {
        webContent.send('download-failed', progress);
      }
    });
  });

  addEventListener('initialized', (success: boolean) => {
    console.log('Download manager initialized:', success ? 'Success' : 'Partial (ytdl-core only)');
  });

  isDownloadManagerInitialized = true;
}

function validateUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw createDownloadError('URL is required', DownloadErrorCode.INVALID_URL);
  }

  try {
    new URL(url);
  } catch {
    throw createDownloadError('Invalid URL format', DownloadErrorCode.INVALID_URL);
  }

  const youtubePattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/i;
  if (!youtubePattern.test(url)) {
    throw createDownloadError('URL must be a valid YouTube URL', DownloadErrorCode.INVALID_URL);
  }
}

function validateDownloadId(downloadId: string): void {
  if (!downloadId || typeof downloadId !== 'string') {
    throw createDownloadError('Download ID is required', DownloadErrorCode.INVALID_URL);
  }
}

function validateDownloadOptions(options: unknown): DownloadOptions {
  if (!options || typeof options !== 'object') {
    return {};
  }

  const opts = options as Record<string, unknown>;
  const validatedOptions: DownloadOptions = {};

  if (opts.quality !== undefined && typeof opts.quality === 'string') {
    validatedOptions.quality = opts.quality;
  }

  if (opts.format !== undefined) {
    const validFormats = ['mp4', 'webm', 'mkv', 'mp3', 'm4a', 'opus'];
    if (validFormats.includes(opts.format as string)) {
      validatedOptions.format = opts.format as any;
    }
  }

  if (opts.outputPath && typeof opts.outputPath === 'string') {
    validatedOptions.outputPath = opts.outputPath;
  }

  if (opts.filename && typeof opts.filename === 'string') {
    validatedOptions.filename = opts.filename;
  }

  if (typeof opts.downloadSubtitles === 'boolean') {
    validatedOptions.downloadSubtitles = opts.downloadSubtitles;
  }

  if (typeof opts.downloadThumbnail === 'boolean') {
    validatedOptions.downloadThumbnail = opts.downloadThumbnail;
  }

  if (typeof opts.saveMetadata === 'boolean') {
    validatedOptions.saveMetadata = opts.saveMetadata;
  }

  if (typeof opts.overwrite === 'boolean') {
    validatedOptions.overwrite = opts.overwrite;
  }

  if (typeof opts.maxRetries === 'number' && opts.maxRetries >= 0) {
    validatedOptions.maxRetries = Math.floor(opts.maxRetries);
  }

  if (typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0) {
    validatedOptions.timeoutMs = Math.floor(opts.timeoutMs);
  }

  if (typeof opts.startTime === 'number' && opts.startTime >= 0) {
    validatedOptions.startTime = opts.startTime;
  }

  if (typeof opts.endTime === 'number' && opts.endTime > 0) {
    validatedOptions.endTime = opts.endTime;
  }

  return validatedOptions;
}

function validateFilter(filter: unknown): DownloadFilter {
  const validFilters: DownloadFilter[] = ['active', 'completed', 'failed', 'all'];
  if (typeof filter === 'string' && validFilters.includes(filter as DownloadFilter)) {
    return filter as DownloadFilter;
  }
  return 'all';
}

function mapDownloadError(error: unknown) {
  if (isDownloadError(error)) {
    return createErrorResponse(error.message, error.code, error.retryable);
  }
  
  if (error instanceof Error) {
    return createErrorResponse(error.message, DownloadErrorCode.UNKNOWN_ERROR);
  }
  
  return createErrorResponse(String(error), DownloadErrorCode.UNKNOWN_ERROR);
}

function mapSpecificVideoInfoError(error: unknown) {
  if (isDownloadError(error)) {
    switch (error.code) {
      case DownloadErrorCode.VIDEO_UNAVAILABLE:
        return createErrorResponse(
          'This video is unavailable or has been removed', 
          DownloadErrorCode.VIDEO_UNAVAILABLE
        );
      case DownloadErrorCode.VIDEO_PRIVATE:
        return createErrorResponse(
          'This video is private and cannot be accessed', 
          DownloadErrorCode.VIDEO_PRIVATE
        );
      case DownloadErrorCode.GEO_BLOCKED:
        return createErrorResponse(
          'This video is not available in your region', 
          DownloadErrorCode.GEO_BLOCKED
        );
      case DownloadErrorCode.AGE_RESTRICTED:
        return createErrorResponse(
          'This video is age-restricted', 
          DownloadErrorCode.AGE_RESTRICTED
        );
      case DownloadErrorCode.TIMEOUT:
        return createErrorResponse(
          'Request timed out - please try again', 
          DownloadErrorCode.TIMEOUT, 
          true
        );
      default:
        return createErrorResponse(error.message, error.code, error.retryable);
    }
  }

  return mapDownloadError(error);
}

export async function addDownloadEventListeners(): Promise<void> {
  await ensureDownloadManagerInitialized();

  ipcMain.handle(
    DOWNLOAD_START_CHANNEL, 
    async (_event, url: string, options?: unknown): Promise<DownloadStartResponse> => {
      try {
        validateUrl(url);
        const validatedOptions = validateDownloadOptions(options);
        
        const config = getConfig();
        const downloadDefaults = config.download;

        const finalOptions: DownloadOptions = {
          quality: downloadDefaults.defaultVideoQuality,
          format: downloadDefaults.videoFormat,
          createSubdirectories: downloadDefaults.createSubdirectories,
          downloadSubtitles: downloadDefaults.downloadSubtitles,
          downloadThumbnail: downloadDefaults.downloadThumbnails,
          saveMetadata: downloadDefaults.saveMetadata,
          ...validatedOptions,
        };
        
        const downloadId = await startDownload(url, finalOptions);

        return createSuccessResponse({
          downloadId,
          message: 'Download started successfully'
        });

      } catch (error) {
        console.error('Download start failed:', error);
        return mapDownloadError(error);
      }
    }
  );

  ipcMain.handle(
    DOWNLOAD_PROGRESS_CHANNEL, 
    async (_event, downloadId?: string): Promise<DownloadProgressResponse> => {
      try {
        if (downloadId) {
          validateDownloadId(downloadId);
          
          const progress = getDownloadProgress(downloadId);
          if (!progress) {
            return createErrorResponse(
              'Download not found', 
              DownloadErrorCode.UNKNOWN_ERROR
            );
          }

          return createSuccessResponse(progress);
        } else {
          const activeDownloads = getActiveDownloads();
          return createSuccessResponse(activeDownloads);
        }
      } catch (error) {
        console.error('Get progress failed:', error);
        return mapDownloadError(error);
      }
    }
  );

  ipcMain.handle(
    DOWNLOAD_CANCEL_CHANNEL, 
    async (_event, downloadId: string): Promise<DownloadCancelResponse> => {
      try {
        validateDownloadId(downloadId);

        const cancelled = cancelDownload(downloadId);

        if (cancelled) {
          return createSuccessResponse({
            downloadId,
            message: 'Download cancelled successfully'
          });
        } else {
          return createErrorResponse(
            'Download not found or already completed', 
            DownloadErrorCode.UNKNOWN_ERROR
          );
        }
      } catch (error) {
        console.error('Download cancel failed:', error);
        return mapDownloadError(error);
      }
    }
  );

  ipcMain.handle(
    DOWNLOAD_LIST_CHANNEL, 
    async (_event, filter?: unknown): Promise<DownloadListResponse> => {
      try {
        const validatedFilter = validateFilter(filter);
        const downloads = getDownloadsByFilter(validatedFilter);

        return createSuccessResponse({
          downloads,
          count: downloads.length,
          filter: validatedFilter
        });
      } catch (error) {
        console.error('Get download list failed:', error);
        return mapDownloadError(error);
      }
    }
  );

  ipcMain.handle(
    DOWNLOAD_INFO_CHANNEL, 
    async (_event, url: string): Promise<VideoInfoResponse> => {
      try {
        validateUrl(url);

        const videoInfo = await getVideoInfo(url);
        return createSuccessResponse(videoInfo);

      } catch (error) {
        console.error('Get video info failed:', error);
        return mapSpecificVideoInfoError(error);
      }
    }
  );
}

export function cleanupDownloadListeners(): void {
  if (isDownloadManagerInitialized) {
    cleanup();
    isDownloadManagerInitialized = false;
  }
} 