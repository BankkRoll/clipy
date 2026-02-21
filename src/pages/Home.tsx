import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UrlInput, VideoInfoCard, useDownloadOptions, SIZE_ESTIMATION_RATES } from "@/components/home";
import { isValidUrl } from "@/lib/utils";
import { VIDEO_QUALITIES } from "@/lib/constants";
import { DEFAULT_DOWNLOAD_OPTIONS } from "@/types/download";
import { useDownloadStore } from "@/stores/downloadStore";
import { toast } from "sonner";
import { type VideoInfo } from "@/types/video";
import { useVideoInfo, useDownloadQueue, useSettings } from "@/hooks";
import { logger } from "@/lib/logger";

export function Home() {
  const navigate = useNavigate();
  const addDownloadWithId = useDownloadStore((state) => state.addDownloadWithId);
  const { settings } = useSettings();

  const { fetchVideoInfo: tauriFetchVideoInfo } = useVideoInfo();
  const { startDownload: tauriStartDownload } = useDownloadQueue();

  // URL input state
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Download options hook
  const { options, setters, toggleSponsorCategory, resetOptions } = useDownloadOptions(settings);

  // Available qualities from video info
  const availableQualities = useMemo(() => {
    if (!videoInfo?.formats) return VIDEO_QUALITIES;

    const heights = new Set<number>();
    videoInfo.formats.forEach((f) => {
      if (f.height > 0) heights.add(f.height);
    });

    return VIDEO_QUALITIES.filter((q) => {
      const height = parseInt(q.value);
      return Array.from(heights).some((h) => h >= height);
    });
  }, [videoInfo]);

  // Estimate file size
  const estimatedSize = useMemo(() => {
    if (!videoInfo) return null;

    const qualityInt = parseInt(options.quality);
    const durationMinutes = videoInfo.duration / 60;
    const rate = SIZE_ESTIMATION_RATES[qualityInt] || 10;
    const sizeMB = rate * durationMinutes;

    if (options.downloadMode === "audio") {
      const audioBitrateInt = parseInt(options.audioBitrate);
      const audioSizeMB = (audioBitrateInt / 8) * (videoInfo.duration / 60);
      return audioSizeMB * 1024 * 1024;
    }

    return sizeMB * 1024 * 1024;
  }, [videoInfo, options.quality, options.downloadMode, options.audioBitrate]);

  const handleUrlChange = useCallback((newUrl: string) => {
    setUrl(newUrl);
    setError(null);
  }, []);

  const handleFetchInfo = useCallback(async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    if (!isValidUrl(url)) {
      setError("Please enter a valid URL");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const info = await tauriFetchVideoInfo(url);
      setVideoInfo(info as VideoInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch video info");
      setVideoInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [url, tauriFetchVideoInfo]);

  const handleDownload = useCallback(async () => {
    if (!videoInfo) return;

    const downloadPath = settings?.download?.downloadPath || "";

    try {
      const downloadOptions = {
        ...DEFAULT_DOWNLOAD_OPTIONS,
        quality: options.downloadMode === "audio" ? "best" : options.quality,
        format: options.downloadMode === "audio" ? options.audioFormat : options.format,
        audioOnly: options.downloadMode === "audio",
        outputPath: downloadPath,
        filename: "",
        embedThumbnail: options.embedThumbnail,
        embedMetadata: options.embedMetadata,
        audioFormat: options.audioFormat,
        audioBitrate: options.audioBitrate,
        downloadSubtitles: options.downloadSubtitles,
        subtitleLanguages: [options.subtitleLanguage],
        embedSubtitles: options.embedSubtitles,
        autoSubtitles: options.autoSubtitles,
        sponsorBlock: options.sponsorBlock,
        sponsorBlockCategories: options.sponsorCategories,
        downloadChapters: options.downloadChapters,
        splitByChapters: options.splitByChapters,
        writeDescription: options.writeDescription,
        writeThumbnail: options.writeThumbnail,
        rateLimit: settings?.download?.rateLimit || "",
        concurrentFragments: settings?.download?.concurrentFragments || 1,
        cookiesFromBrowser: settings?.download?.cookiesFromBrowser || "",
        proxyUrl: settings?.advanced?.proxyUrl || "",
        restrictFilenames: settings?.download?.restrictFilenames || false,
        useDownloadArchive: settings?.download?.useDownloadArchive || false,
        geoBypass: settings?.download?.geoBypass || false,
      };

      const backendId = await tauriStartDownload(url, videoInfo, downloadOptions);

      addDownloadWithId(backendId, {
        videoId: videoInfo.id,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        url,
        status: "downloading",
        progress: 0,
        totalBytes: 0,
        downloadedBytes: 0,
        speed: 0,
        eta: 0,
        quality: options.downloadMode === "audio" ? "Audio" : `${options.quality}p`,
        format: options.downloadMode === "audio" ? options.audioFormat : options.format,
        outputPath: downloadPath,
        error: null,
        completedAt: null,
        duration: videoInfo.duration,
        channel: videoInfo.channel,
      });

      toast.success("Download started", {
        description: videoInfo.title,
      });

      // Reset form and redirect
      setUrl("");
      setVideoInfo(null);
      setShowAdvanced(false);
      resetOptions();
      navigate("/downloads");
    } catch (err) {
      logger.error("Home", "Failed to start download:", err);
      toast.error("Failed to start download", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [
    videoInfo,
    url,
    options,
    settings,
    tauriStartDownload,
    addDownloadWithId,
    navigate,
    resetOptions,
  ]);

  return (
    <div className="relative flex h-full flex-col overflow-y-auto">
      {/* Background Watermark - contained within this page, not behind sidebar */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none overflow-hidden">
        <span
          className="font-black leading-none tracking-tight text-foreground/[0.03]"
          style={{ fontSize: "clamp(8rem, 30vw, 24rem)" }}
        >
          Clipy
        </span>
      </div>

      <div className="relative z-10 flex w-full flex-1 flex-col items-center px-6 py-8">
        <UrlInput
          url={url}
          isLoading={isLoading}
          error={error}
          hasVideo={!!videoInfo}
          onUrlChange={handleUrlChange}
          onFetch={handleFetchInfo}
        />

        {videoInfo && (
          <div className="mt-8 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <VideoInfoCard
              videoInfo={videoInfo}
              options={options}
              setters={setters}
              toggleSponsorCategory={toggleSponsorCategory}
              availableQualities={availableQualities}
              estimatedSize={estimatedSize}
              showAdvanced={showAdvanced}
              onShowAdvancedChange={setShowAdvanced}
              onDownload={handleDownload}
            />
          </div>
        )}
      </div>
    </div>
  );
}
