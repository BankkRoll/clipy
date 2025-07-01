import { EventEmitter } from 'events';
import ffmpeg from 'fluent-ffmpeg';
import miniget from 'miniget';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { Innertube, Log } from 'youtubei.js';
import type {
    DownloadOptions,
    DownloadProgress,
    VideoFormatInfo,
    VideoInfo
} from '../../types/download';
import {
    createDownloadError,
    DownloadErrorCode
} from '../../types/download';
import { logDebug } from '../logger';

let innertubeInstance: Innertube | null = null;

export async function initializeYouTubeJs(): Promise<void> {
  if (innertubeInstance) {
    return;
  }

  try {
    Log.setLevel(Log.Level.INFO);
    innertubeInstance = await Innertube.create({
      lang: 'en',
      location: 'US',
      enable_session_cache: true,
      generate_session_locally: true
    });
    console.log('[YOUTUBEJS] InnerTube initialized successfully');
  } catch (error) {
    console.error('[YOUTUBEJS] Failed to initialize InnerTube:', error);
    throw createDownloadError(
      'Failed to initialize YouTubeJS',
      DownloadErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error : undefined
    );
  }
}

export async function getVideoInfoFromYouTubeJs(videoId: string): Promise<VideoInfo> {
  if (!innertubeInstance) {
    throw createDownloadError(
      'YouTubeJS not initialized',
      DownloadErrorCode.UNKNOWN_ERROR
    );
  }

  try {
    console.log('[YOUTUBEJS] Getting video info for:', videoId);
    const info = await innertubeInstance.getInfo(videoId, 'WEB');
    
    if (!info) {
      throw new Error('Failed to get InnerTube info: response is null');
    }

    console.log('[YOUTUBEJS] Info received successfully');
    logDebug('Raw YouTubeJS info:', JSON.stringify(info, null, 2));
    
    return parseYouTubeJsInfo(info);
  } catch (error) {
    console.error('[YOUTUBEJS] Failed to get video info:', error);
    throw createDownloadError(
      `YouTubeJS error: ${error instanceof Error ? error.message : String(error)}`,
      DownloadErrorCode.UNKNOWN_ERROR,
      error instanceof Error ? error : undefined
    );
  }
}

function parseYouTubeJsInfo(info: any): VideoInfo {
  console.log('[YOUTUBEJS] Parsing InnerTube info - basic info and streaming data available');
  
  const basicInfo = info.basic_info;
  const author = info.secondary_info?.owner?.author;

  console.log('[YOUTUBEJS] Video duration from basic info:', basicInfo?.duration);
  console.log('[YOUTUBEJS] Streaming data formats count:', info.streaming_data?.formats?.length || 0);
  console.log('[YOUTUBEJS] Streaming data adaptive formats count:', info.streaming_data?.adaptive_formats?.length || 0);

  const allFormats: VideoFormatInfo[] = [];
  
  if (info.streaming_data?.formats) {
    const regularFormats = info.streaming_data.formats.map((format: any) => parseYouTubeJsFormat(format));
    allFormats.push(...regularFormats);
  }
  
  if (info.streaming_data?.adaptive_formats) {
    const adaptiveFormats = info.streaming_data.adaptive_formats.map((format: any) => parseYouTubeJsFormat(format));
    allFormats.push(...adaptiveFormats);
  }
  
  console.log('[YOUTUBEJS] Parsed formats:', allFormats.length, 'total formats found');

  const result = {
    id: basicInfo?.id || info.video_id,
    title: basicInfo?.title || 'Unknown Title',
    description: basicInfo?.short_description || '',
    duration: basicInfo?.duration || 0,
    durationFormatted: formatDuration(basicInfo?.duration || 0),
    channel: {
      name: author?.name || basicInfo?.author || 'Unknown Channel',
      id: author?.id || basicInfo?.channel_id,
      thumbnail: author?.thumbnails?.[0]?.url,
      verified: author?.is_verified || false
    },
    thumbnails: basicInfo?.thumbnail || [],
    views: basicInfo?.view_count,
    viewsFormatted: formatViews(basicInfo?.view_count || 0),
    uploadDate: info.primary_info?.published?.text || 'Unknown',
    tags: basicInfo?.keywords || [],
    isLive: basicInfo?.is_live || false,
    isPrivate: basicInfo?.is_private || false,
    ageRestricted: info.playability_status?.status !== 'OK',
    captions: info.captions?.caption_tracks?.map((track: any) => ({
      lang: track.language_code,
      url: track.base_url,
    })) || [],
    formats: allFormats,
    availableQualities: extractQualities(allFormats),
  };
  
  console.log('[YOUTUBEJS] Final parsed result - duration:', result.duration, 'formats:', result.formats.length, 'qualities:', result.availableQualities.length);
  return result;
}

function parseYouTubeJsFormat(format: any): VideoFormatInfo {
  const mimeType = format.mime_type || '';
  const hasVideo = format.has_video === true;
  const hasAudio = format.has_audio === true;

  let url = '';
  
  if (format.url) {
    url = format.url;
  }
  
  else if (format.decipher && typeof format.decipher === 'function') {
    try {
      url = format.decipher();
    } catch (error) {
      console.warn('[YOUTUBEJS] Failed to decipher URL for format', format.itag);
    }
  }
  
  else if (format.signature_cipher) {
    try {
      const params = new URLSearchParams(format.signature_cipher);
      const baseUrl = params.get('url');
      const signature = params.get('s');
      if (baseUrl) {
        url = baseUrl;
      }
    } catch (error) {
      console.warn('[YOUTUBEJS] Failed to parse signature_cipher for format', format.itag);
    }
  }
  
  else if (format.cipher) {
    try {
      const params = new URLSearchParams(format.cipher);
      const baseUrl = params.get('url');
      if (baseUrl) {
        url = baseUrl;
      }
    } catch (error) {
      console.warn('[YOUTUBEJS] Failed to parse cipher for format', format.itag);
    }
  }
  
  else if (format.signatureCipher) {
    try {
      const params = new URLSearchParams(format.signatureCipher);
      const baseUrl = params.get('url');
      if (baseUrl) {
        url = baseUrl;
      }
    } catch (error) {
      console.warn('[YOUTUBEJS] Failed to parse signatureCipher for format', format.itag);
    }
  }
  
  else if (format.download_url) {
    url = format.download_url;
  }
  else if (format.base_url) {
    url = format.base_url;
  }
  
  console.log(`[YOUTUBEJS] Format ${format.itag}: hasUrl=${!!url}, hasVideo=${hasVideo}, hasAudio=${hasAudio}, quality=${format.quality_label || format.quality}`);

  return {
    itag: format.itag || 0,
    quality: format.quality?.toString() || format.quality_label || 'unknown',
    qualityLabel: format.quality_label,
    format: mimeType.split(';')[0]?.split('/')[1] || 'unknown',
    container: mimeType.split(';')[0]?.split('/')[1] || 'unknown',
    contentLength: format.content_length,
    bitrate: format.bitrate,
    audioBitrate: format.bitrate,
    fps: format.fps,
    width: format.width,
    height: format.height,
    hasAudio,
    hasVideo,
    audioCodec: hasAudio ? mimeType.split('codecs="')[1]?.split('"')[0] : undefined,
    videoCodec: hasVideo ? mimeType.split('codecs="')[1]?.split('"')[0] : undefined,
    mimeType: mimeType,
    url: url
  };
}

function extractQualities(formats: VideoFormatInfo[]): string[] {
  console.log('[YOUTUBEJS] Extracting qualities from', formats.length, 'formats');
  
  const videoFormats = formats.filter(f => f.hasVideo);
  console.log('[YOUTUBEJS] Video formats found:', videoFormats.length);
  
  if (videoFormats.length > 0) {
    console.log('[YOUTUBEJS] Sample video format:', {
      itag: videoFormats[0].itag,
      quality: videoFormats[0].quality,
      qualityLabel: videoFormats[0].qualityLabel,
      hasVideo: videoFormats[0].hasVideo,
      width: videoFormats[0].width,
      height: videoFormats[0].height
    });
  }
  
  const qualityMap = new Map<string, string>();
  
  formats
    .filter(f => f.hasVideo && f.quality && f.quality !== 'unknown')
    .forEach(f => {
      let qualityLabel = f.quality;
      
      if (f.width && f.height) {
        const height = f.height;
        if (height >= 2160) qualityLabel = '4K';
        else if (height >= 1440) qualityLabel = '2K';
        else if (height >= 1080) qualityLabel = '1080p';
        else if (height >= 720) qualityLabel = '720p';
        else if (height >= 480) qualityLabel = '480p';
        else if (height >= 360) qualityLabel = '360p';
        else if (height >= 240) qualityLabel = '240p';
        else if (height >= 144) qualityLabel = '144p';
      }
      
      if (!f.width || !f.height) {
        qualityLabel = f.quality;
      }
      
      qualityMap.set(qualityLabel, qualityLabel);
    });
  
  const result = Array.from(qualityMap.keys()).sort((a, b) => {
    const getQualityValue = (quality: string): number => {
      if (quality.includes('4K') || quality.includes('2160')) return 2160;
      if (quality.includes('2K') || quality.includes('1440')) return 1440;
      if (quality.includes('1080')) return 1080;
      if (quality.includes('720')) return 720;
      if (quality.includes('480')) return 480;
      if (quality.includes('360')) return 360;
      if (quality.includes('240')) return 240;
      if (quality.includes('144')) return 144;
      return 0;
    };
    return getQualityValue(b) - getQualityValue(a);
  });
  
  console.log('[YOUTUBEJS] Extracted qualities:', result);
  return result;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}

function formatViews(views: number): string {
  if (views >= 1_000_000_000) {
    return `${(views / 1_000_000_000).toFixed(1)}B`;
  } else if (views >= 1_000_000) {
    return `${(views / 1_000_000).toFixed(1)}M`;
  } else if (views >= 1_000) {
    return `${(views / 1_000).toFixed(1)}K`;
  } else {
    return views.toString();
  }
}

export function isYouTubeJsInitialized(): boolean {
  return innertubeInstance !== null;
}

export function cleanupYouTubeJs(): void {
  innertubeInstance = null;
}

async function generateFilePath(
  videoInfo: VideoInfo,
  options: DownloadOptions,
  config: any
): Promise<string> {
  let outputPath = options.outputPath || config.defaultOutputPath;

  if (options.createSubdirectories && videoInfo.channel.name) {
    const channelDir = sanitizeFilename(videoInfo.channel.name);
    outputPath = join(outputPath, channelDir);
  }

  let filename: string;
  if (options.filename) {
    filename = options.filename;
  } else {
    const sanitizedTitle = sanitizeFilename(videoInfo.title);
    const extension = getExtensionForFormat(options.format || 'mp4');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    let baseFilename = `${sanitizedTitle}_${timestamp}`;

    if (options.startTime || options.endTime) {
      const startStr = options.startTime ? formatTime(options.startTime) : 'start';
      const endStr = options.endTime ? formatTime(options.endTime) : 'end';
      baseFilename += `_${startStr}-${endStr}`;
    }

    filename = `${baseFilename}.${extension}`;
  }

  return join(outputPath, filename);
}

function getExtensionForFormat(format: string): string {
  const formatMap: Record<string, string> = {
    'mp4': 'mp4',
    'webm': 'webm',
    'mkv': 'mkv',
    'mp3': 'mp3',
    'm4a': 'm4a',
    'opus': 'opus'
  };
  return formatMap[format] || 'mp4';
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200);
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, '0')}m${secs.toString().padStart(2, '0')}s`;
  } else {
    return `${minutes}m${secs.toString().padStart(2, '0')}s`;
  }
}

export async function downloadWithYouTubeJs(
  videoId: string,
  options: DownloadOptions,
  progress: DownloadProgress,
  eventEmitter: EventEmitter,
  controller: AbortController
): Promise<void> {

  console.log('[YOUTUBEJS-PROVIDER] Starting download for:', videoId);

  const {
    signal
  } = controller;

  return new Promise<void>(async (resolve, reject) => {
    let ffmpegProcess: ffmpeg.FfmpegCommand | undefined;

    const cleanupAndReject = (error: any) => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
      }
      reject(error);
    };

    signal.addEventListener('abort', () => {
      console.log(`[YOUTUBEJS-PROVIDER] Aborting download ${progress.downloadId}`);
      cleanupAndReject(createDownloadError('Download cancelled by user', DownloadErrorCode.DOWNLOAD_CANCELLED));
    });

    try {
      const info = await getVideoInfoFromYouTubeJs(videoId);

      progress.title = info.title;
      progress.filePath = await generateFilePath(info, options, {
        defaultOutputPath: 'C:/Users/calvi/Downloads/electron-youtube'
      });
      eventEmitter.emit('progress', progress);

      const dir = dirname(progress.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, {
          recursive: true
        });
      }

      const qualityHeight = parseInt(options.quality?.replace('p', '') || '1080', 10);

      const videoFormats = info.formats
        .filter((f) => f.hasVideo && !f.hasAudio && f.url)
        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

      let videoFormat = videoFormats.find((f) => f.height === qualityHeight);
      if (!videoFormat) {
        videoFormat = videoFormats.find((f) => (f.height ?? 0) < qualityHeight) || videoFormats[0];
      }

      const audioFormats = info.formats
        .filter((f) => f.hasAudio && !f.hasVideo && f.url)
        .sort((a, b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
      const audioFormat = audioFormats[0];

      if (!videoFormat || !audioFormat || !videoFormat.url || !audioFormat.url) {
        throw createDownloadError('Could not find suitable video and audio stream URLs from YouTubeJS.', DownloadErrorCode.NO_STREAMS);
      }

      const videoStream = miniget(videoFormat.url, {
        signal
      });
      const audioStream = miniget(audioFormat.url, {
        signal
      });

      let totalSize = (videoFormat.contentLength ?? 0) + (audioFormat.contentLength ?? 0);
      let downloadedSize = 0;

      const progressStream = new Transform({
        transform(chunk, encoding, callback) {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            progress.progress = downloadedSize / totalSize;
            progress.downloadedBytes = downloadedSize;
            progress.totalBytes = totalSize;
            eventEmitter.emit('progress', progress);
          }
          callback(null, chunk);
        },
      });

      videoStream.pipe(progressStream);

      videoStream.on('error', (err) => cleanupAndReject(err));
      audioStream.on('error', (err) => cleanupAndReject(err));

      const ffmpegOptions = ['-c:v copy', '-c:a copy'];
      if (options.startTime) {
        ffmpegOptions.unshift(`-ss ${options.startTime}`);
      }
      if (options.endTime) {
        ffmpegOptions.unshift(`-to ${options.endTime}`);
      }

      ffmpegProcess = ffmpeg()
        .input(videoStream)
        .inputFormat(videoFormat.container || 'mp4')
        .input(audioStream)
        .inputFormat(audioFormat.container || 'mp4')
        .outputOptions(ffmpegOptions)
        .output(progress.filePath)
        .on('error', (err, stdout, stderr) => {
          console.error('[FFMPEG] Error:', err.message);
          cleanupAndReject(createDownloadError(`FFmpeg error: ${err.message}`, DownloadErrorCode.MUXING_ERROR, err));
        })
        .on('end', () => {
          progress.status = 'completed';
          progress.progress = 1;
          eventEmitter.emit('progress', progress);
          eventEmitter.emit('completed', progress);
          resolve();
        });

      ffmpegProcess.run();

    } catch (error) {
      reject(error);
    }
  });
} 