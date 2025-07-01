import {
    EventEmitter
} from 'events';
import ffmpeg from 'fluent-ffmpeg';
import {
    existsSync,
    mkdirSync
} from 'node:fs';
import {
    dirname,
    join
} from 'node:path';
import {
    Transform
} from 'node:stream';
import ytdl from 'ytdl-core';
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
import {
    logDebug
} from '../logger';

export async function getVideoInfoFromYtdl(videoId: string, timeoutMs: number = 30000): Promise<{ parsed: VideoInfo, raw: ytdl.videoInfo }> {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  const requestOptions = [
    {
      headers: {
        'User-Agent': userAgents[0],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    },
    {
      headers: {
        'User-Agent': userAgents[1],
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin': 'https://www.youtube.com',
        'Referer': 'https://www.youtube.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site'
      }
    },
    {
      headers: {
        'User-Agent': userAgents[2],
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    }
  ];

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < requestOptions.length; attempt++) {
    try {
      console.log(`[YTDL] Getting video info for: ${videoId} (attempt ${attempt + 1}/${requestOptions.length})`);
      
      const options = {
        requestOptions: requestOptions[attempt]
      };
      
      const info = await withTimeout(
        ytdl.getInfo(videoId, options),
        timeoutMs
      );
      
      console.log('[YTDL] Info received successfully');
      logDebug('Raw ytdl-core info:', JSON.stringify(info, null, 2));
      
      return {
        parsed: parseYtdlInfo(info),
        raw: info
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[YTDL] Attempt ${attempt + 1} failed:`, lastError.message);
      
      if (lastError.message.includes('410') || lastError.message.includes('Status code: 410')) {
        console.log('[YTDL] 410 error detected, not retrying with different user agents');
        break;
      }
      
      if (lastError.message.includes('403') || lastError.message.includes('Status code: 403')) {
        console.log('[YTDL] 403 error detected, not retrying');
        break;
      }
      
      if (attempt < requestOptions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  console.error('[YTDL] All attempts failed');
  throw mapYtdlError(lastError);
}

function parseYtdlInfo(info: ytdl.videoInfo): VideoInfo {
  console.log('[YTDL] Parsing ytdl-core info');
  
  const videoDetails = info.videoDetails;
  const formats = parseYtdlFormats(info.formats);
  const captions = info.player_response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.map((track: any) => ({
    lang: track.languageCode,
    url: track.baseUrl
  })) || [];

  const result = {
    id: videoDetails.videoId,
    title: videoDetails.title,
    description: videoDetails.description || '',
    duration: parseInt(videoDetails.lengthSeconds),
    durationFormatted: formatDuration(parseInt(videoDetails.lengthSeconds)),
    channel: {
      name: typeof videoDetails.author === 'string' ? videoDetails.author : videoDetails.author.name,
      id: videoDetails.channelId,
      thumbnail: videoDetails.thumbnails?.[0]?.url,
      verified: typeof videoDetails.author === 'string' ? false : videoDetails.author.verified
    },
    thumbnails: videoDetails.thumbnails || [],
    views: parseInt(videoDetails.viewCount),
    viewsFormatted: formatViews(parseInt(videoDetails.viewCount)),
    uploadDate: info.videoDetails.publishDate || '',
    tags: videoDetails.keywords || [],
    category: info.videoDetails.category,
    isLive: videoDetails.isLiveContent || false,
    isPrivate: videoDetails.isPrivate || false,
    ageRestricted: false,
    captions,
    formats,
    bestVideoFormat: formats.find(f => f.hasVideo && f.hasAudio),
    bestAudioFormat: formats.find(f => f.hasAudio && !f.hasVideo),
    availableQualities: extractQualities(formats)
  };

  console.log('[YTDL] Final parsed result - duration:', result.duration, 'formats:', result.formats.length, 'qualities:', result.availableQualities.length);
  return result;
}

function parseYtdlFormats(formats: ytdl.videoFormat[]): VideoFormatInfo[] {
  console.log('[YTDL] Parsing', formats.length, 'formats');
  
  return formats.map(format => ({
    itag: format.itag,
    quality: String(format.quality),
    qualityLabel: format.qualityLabel,
    format: format.container,
    container: format.container,
    contentLength: format.contentLength ? parseInt(format.contentLength) : undefined,
    bitrate: format.bitrate,
    audioBitrate: format.audioBitrate,
    fps: format.fps,
    width: format.width,
    height: format.height,
    hasAudio: format.hasAudio,
    hasVideo: format.hasVideo,
    audioCodec: format.audioCodec,
    videoCodec: format.videoCodec,
    mimeType: format.mimeType
  }));
}

function extractQualities(formats: VideoFormatInfo[]): string[] {
  console.log('[YTDL] Extracting qualities from', formats.length, 'formats');
  
  const videoFormats = formats.filter(f => f.hasVideo);
  console.log('[YTDL] Video formats found:', videoFormats.length);
  
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
  
  console.log('[YTDL] Extracted qualities:', result);
  return result;
}

function mapYtdlError(error: unknown): any {
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (errorMessage.includes('Video unavailable')) {
    return createDownloadError(
      'This video is unavailable or has been removed',
      DownloadErrorCode.VIDEO_UNAVAILABLE,
      error instanceof Error ? error : undefined
    );
  }

  if (errorMessage.includes('private')) {
    return createDownloadError(
      'This video is private and cannot be downloaded',
      DownloadErrorCode.VIDEO_PRIVATE,
      error instanceof Error ? error : undefined
    );
  }

  if (errorMessage.includes('region')) {
    return createDownloadError(
      'This video is not available in your region',
      DownloadErrorCode.GEO_BLOCKED,
      error instanceof Error ? error : undefined
    );
  }

  if (errorMessage.includes('age') || errorMessage.includes('restricted')) {
    return createDownloadError(
      'This video is age-restricted',
      DownloadErrorCode.AGE_RESTRICTED,
      error instanceof Error ? error : undefined
    );
  }

  if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
    return createDownloadError(
      'Request timed out',
      DownloadErrorCode.TIMEOUT,
      error instanceof Error ? error : undefined,
      true
    );
  }

  if (errorMessage.includes('410') || errorMessage.includes('Status code: 410')) {
    return createDownloadError(
      'YouTube has blocked this request (410 Gone). This usually means the video format is no longer available or YouTube has updated their systems.',
      DownloadErrorCode.VIDEO_UNAVAILABLE,
      error instanceof Error ? error : undefined,
      false
    );
  }

  if (errorMessage.includes('Status code:')) {
    const statusMatch = errorMessage.match(/Status code: (\d+)/);
    if (statusMatch) {
      const statusCode = parseInt(statusMatch[1]);
      if (statusCode >= 500) {
        return createDownloadError(
          `Server error (${statusCode}). Please try again later.`,
          DownloadErrorCode.NETWORK_ERROR,
          error instanceof Error ? error : undefined,
          true
        );
      } else if (statusCode === 403) {
        return createDownloadError(
          'Access forbidden (403). YouTube may be blocking requests from this IP.',
          DownloadErrorCode.RATE_LIMITED,
          error instanceof Error ? error : undefined,
          false
        );
      } else if (statusCode === 429) {
        return createDownloadError(
          'Too many requests (429). Please wait before trying again.',
          DownloadErrorCode.RATE_LIMITED,
          error instanceof Error ? error : undefined,
          true
        );
      }
    }
  }

  return createDownloadError(
    `Failed to get video info: ${errorMessage}`,
    DownloadErrorCode.UNKNOWN_ERROR,
    error instanceof Error ? error : undefined,
    true
  );
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

async function generateFilePath(
  videoInfo: VideoInfo,
  options: DownloadOptions,
  config: any
): Promise < string > {
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
  const formatMap: Record < string, string > = {
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

export async function downloadWithYtdlCore(
  videoId: string,
  options: DownloadOptions,
  progress: DownloadProgress,
  eventEmitter: EventEmitter,
  controller: AbortController
): Promise < void > {

  console.log('[YTDL-PROVIDER] Starting download for:', videoId);

  const {
    signal
  } = controller;

  return new Promise < void > (async (resolve, reject) => {
    let ffmpegProcess: ffmpeg.FfmpegCommand | undefined;

    const cleanupAndReject = (error: any) => {
      if (ffmpegProcess) {
        ffmpegProcess.kill('SIGKILL');
      }
      reject(error);
    };

    signal.addEventListener('abort', () => {
      console.log(`[YTDL-PROVIDER] Aborting download ${progress.downloadId}`);
      cleanupAndReject(createDownloadError('Download cancelled by user', DownloadErrorCode.DOWNLOAD_CANCELLED));
    });

    try {
      const {
        parsed: info,
        raw: rawInfo
      } = await getVideoInfoFromYtdl(videoId);


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
      const videoFormat = ytdl.chooseFormat(rawInfo.formats, {
        quality: options.quality || 'highestvideo',
        filter: 'videoonly'
      });
      const audioFormat = ytdl.chooseFormat(rawInfo.formats, {
        quality: 'highestaudio',
        filter: 'audioonly'
      });


      if (!videoFormat || !audioFormat) {
        throw createDownloadError('Could not find suitable video and audio formats.', DownloadErrorCode.NO_STREAMS);
      }

      console.log(`[YTDL-PROVIDER] Selected video format: ${videoFormat.qualityLabel} (${videoFormat.container})`);
      console.log(`[YTDL-PROVIDER] Selected audio format: ${audioFormat.audioBitrate}kbps (${audioFormat.container})`);


      const videoStream = ytdl(videoId, {
        format: videoFormat
      });
      const audioStream = ytdl(videoId, {
        format: audioFormat
      });

      let totalSize = parseInt(videoFormat.contentLength || '0') + parseInt(audioFormat.contentLength || '0');
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
      videoStream.on('error', (err) => cleanupAndReject(mapYtdlError(err)));
      audioStream.on('error', (err) => cleanupAndReject(mapYtdlError(err)));


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
          console.error('[FFMPEG] Stdout:', stdout);
          console.error('[FFMPEG] Stderr:', stderr);
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
      cleanupAndReject(mapYtdlError(error));
    }
  });
} 