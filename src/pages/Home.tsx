/**
 * Home page: paste a URL, inspect the video, pick options and start a download.
 */
import { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  UrlInput,
  VideoInfoCard,
  useDownloadOptions,
  buildDownloadOptions,
  SIZE_ESTIMATION_RATES,
} from "@/components/home";
import { normalizeUrl } from "@/lib/utils";
import { VIDEO_QUALITIES } from "@/lib/constants";
import { toast } from "sonner";
import { type VideoInfo } from "@/types/video";
import { useVideoInfo, useDownloadCommands, useSettings } from "@/hooks";
import { logger } from "@/lib/logger";

/** Home page component. */
export function Home() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { fetchVideoInfo } = useVideoInfo();
  const { startDownload } = useDownloadCommands();

  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [fetchedUrl, setFetchedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { options, setters, toggleSponsorCategory, resetOptions } = useDownloadOptions(settings);

  const availableQualities = useMemo(() => {
    if (!videoInfo?.formats) return VIDEO_QUALITIES;

    const maxHeight = Math.max(0, ...videoInfo.formats.map((f) => f.height || 0));
    // Some extractors report no heights at all; offer every quality then.
    if (maxHeight === 0) return VIDEO_QUALITIES;
    return VIDEO_QUALITIES.filter((q) => maxHeight >= parseInt(q.value));
  }, [videoInfo]);

  const estimatedSize = useMemo(() => {
    if (!videoInfo) return null;

    const minutes = videoInfo.duration / 60;
    if (options.downloadMode === "audio") {
      const audioSizeMB = (parseInt(options.audioBitrate) / 8) * minutes;
      return audioSizeMB * 1024 * 1024;
    }

    const rate = SIZE_ESTIMATION_RATES[parseInt(options.quality)] || 10;
    return rate * minutes * 1024 * 1024;
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

    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Please enter a valid http(s) URL");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setVideoInfo(await fetchVideoInfo(normalized));
      setFetchedUrl(normalized);
    } catch (err) {
      // useVideoInfo always rethrows backend failures as Error.
      setError((err as Error).message);
      setVideoInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [url, fetchVideoInfo]);

  const handleDownload = useCallback(
    async (info: VideoInfo) => {
      const audio = options.downloadMode === "audio";
      try {
        await startDownload(fetchedUrl, info, buildDownloadOptions(options, settings), {
          quality: audio ? "Audio" : `${options.quality}p`,
          format: audio ? options.audioFormat : options.format,
        });

        toast.success("Download started", { description: info.title });

        setUrl("");
        setVideoInfo(null);
        setShowAdvanced(false);
        resetOptions();
        navigate("/downloads");
      } catch (err) {
        logger.error("Home", "Failed to start download:", err);
        toast.error("Failed to start download", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [fetchedUrl, options, settings, startDownload, navigate, resetOptions]
  );

  return (
    <div className="relative flex h-full flex-col overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
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
          <div className="mt-8 w-full max-w-2xl duration-500 animate-in fade-in slide-in-from-bottom-4">
            <VideoInfoCard
              videoInfo={videoInfo}
              options={options}
              setters={setters}
              toggleSponsorCategory={toggleSponsorCategory}
              availableQualities={availableQualities}
              estimatedSize={estimatedSize}
              showAdvanced={showAdvanced}
              onShowAdvancedChange={setShowAdvanced}
              onDownload={() => handleDownload(videoInfo)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
