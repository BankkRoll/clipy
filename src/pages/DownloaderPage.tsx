import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { DownloaderRoute } from "@/routes/routes";
import { isSuccessResponse } from "@/types/api";
import { DownloadOptions, VideoInfo } from "@/types/download";
import { useSearch } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UrlInputCard } from '../components/downloader/url-input-card';
import { VideoPreviewCard } from '../components/downloader/video-preview-card';

export default function DownloaderPage() {
  const { t } = useTranslation();
  const { url: urlFromSearch } = useSearch({ from: DownloaderRoute.id });

  const [currentUrl, setCurrentUrl] = useState(urlFromSearch || "");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoading, setIsLoading] = useState(!!urlFromSearch);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentUrl) {
      handleFetchVideoInfo(currentUrl);
    }
  }, [currentUrl]);

  const handleFetchVideoInfo = async (url: string) => {
    setIsLoading(true);
    setVideoInfo(null);
    setError(null);
    try {
      const response = await window.downloadManager.getInfo(url);
      if (isSuccessResponse(response)) {
        setVideoInfo(response.data);
      } else {
        setError(response.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (options: DownloadOptions) => {
    if (!videoInfo) return;
    
    try {
      const fullUrl = `https://www.youtube.com/watch?v=${videoInfo.id}`;
      
      const configResponse = await window.configManager.get();
      if (isSuccessResponse(configResponse)) {
        const config = configResponse.data;
        const finalOptions = {
          quality: options.quality || config.download.defaultVideoQuality,
          format: options.format || config.download.videoFormat,
          downloadSubtitles: options.downloadSubtitles ?? config.download.downloadSubtitles,
          downloadThumbnail: options.downloadThumbnail ?? config.download.downloadThumbnails,
          saveMetadata: options.saveMetadata ?? config.download.saveMetadata,
          createSubdirectories: options.createSubdirectories ?? config.download.createSubdirectories,
          startTime: options.startTime,
          endTime: options.endTime,
        };
        
        await window.downloadManager.start(fullUrl, finalOptions);
      } else {
        await window.downloadManager.start(fullUrl, options);
      }
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleReset = () => {
    setCurrentUrl("");
    setVideoInfo(null);
    setError(null);
    setIsLoading(false);
  };

  const renderContent = () => {
    if (isLoading) {
      return <UrlInputCard onSubmit={setCurrentUrl} isLoading={isLoading} />;
    }

    if (error) {
      return (
        <div className="w-full max-w-4xl mx-auto">
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('errorGeneric')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="flex justify-center">
            <UrlInputCard onSubmit={setCurrentUrl} isLoading={false} />
          </div>
        </div>
      );
    }

    if (videoInfo) {
      return <VideoPreviewCard videoInfo={videoInfo} onDownload={handleDownload} onReset={handleReset} />;
    }

    return <UrlInputCard onSubmit={setCurrentUrl} isLoading={isLoading} />;
  };

  return (
    <div className="space-y-12">
      {renderContent()}
    </div>
  );
} 