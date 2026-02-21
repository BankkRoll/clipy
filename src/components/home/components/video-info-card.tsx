import { Download, CheckCircle, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes } from "@/lib/utils";
import type { VideoInfo } from "@/types/video";
import { DownloadModeTabs } from "./download-mode-tabs";
import { QualityFormatSelect } from "./quality-format-select";
import { AdvancedOptions } from "./advanced-options";
import type { DownloadOptions } from "../hooks/use-download-options";

interface QualityOption {
  readonly value: string;
  readonly label: string;
  readonly badge?: string | null;
}

interface VideoInfoCardProps {
  videoInfo: VideoInfo;
  options: DownloadOptions;
  setters: {
    setDownloadMode: (mode: "video" | "audio") => void;
    setQuality: (quality: string) => void;
    setFormat: (format: string) => void;
    setAudioFormat: (format: string) => void;
    setAudioBitrate: (bitrate: string) => void;
    setEmbedThumbnail: (value: boolean) => void;
    setEmbedMetadata: (value: boolean) => void;
    setWriteDescription: (value: boolean) => void;
    setWriteThumbnail: (value: boolean) => void;
    setDownloadSubtitles: (value: boolean) => void;
    setSubtitleLanguage: (value: string) => void;
    setEmbedSubtitles: (value: boolean) => void;
    setAutoSubtitles: (value: boolean) => void;
    setSponsorBlock: (value: boolean) => void;
    setDownloadChapters: (value: boolean) => void;
    setSplitByChapters: (value: boolean) => void;
  };
  toggleSponsorCategory: (category: string) => void;
  availableQualities: readonly QualityOption[];
  estimatedSize: number | null;
  showAdvanced: boolean;
  onShowAdvancedChange: (show: boolean) => void;
  onDownload: () => void;
}

export function VideoInfoCard({
  videoInfo,
  options,
  setters,
  toggleSponsorCategory,
  availableQualities,
  estimatedSize,
  showAdvanced,
  onShowAdvancedChange,
  onDownload,
}: VideoInfoCardProps) {
  return (
    <Card className="w-full">
      <CardContent className="p-6">
        <div className="flex gap-4">
          {/* Thumbnail */}
          <div className="relative aspect-video w-48 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              src={videoInfo.thumbnail}
              alt={videoInfo.title}
              className="h-full w-full object-cover"
            />
            <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
              {Math.floor(videoInfo.duration / 60)}:
              {(videoInfo.duration % 60).toString().padStart(2, "0")}
            </div>
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col min-w-0">
            <h3 className="line-clamp-2 font-semibold">{videoInfo.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{videoInfo.channel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {videoInfo.viewCount.toLocaleString()} views
            </p>

            {/* Download Mode Tabs */}
            <div className="mt-4">
              <DownloadModeTabs
                mode={options.downloadMode}
                onModeChange={setters.setDownloadMode}
              />
            </div>

            {/* Quality & Format Options */}
            <div className="mt-4">
              {options.downloadMode === "video" ? (
                <QualityFormatSelect
                  mode="video"
                  quality={options.quality}
                  format={options.format}
                  availableQualities={availableQualities}
                  onQualityChange={setters.setQuality}
                  onFormatChange={setters.setFormat}
                />
              ) : (
                <QualityFormatSelect
                  mode="audio"
                  audioFormat={options.audioFormat}
                  audioBitrate={options.audioBitrate}
                  onAudioFormatChange={setters.setAudioFormat}
                  onAudioBitrateChange={setters.setAudioBitrate}
                />
              )}
            </div>

            {/* Estimated Size */}
            {estimatedSize && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                <span>Estimated size: ~{formatBytes(estimatedSize)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Options */}
        <AdvancedOptions
          isOpen={showAdvanced}
          onOpenChange={onShowAdvancedChange}
          options={options}
          setters={setters}
          toggleSponsorCategory={toggleSponsorCategory}
        />

        {/* Download Button */}
        <div className="mt-6 flex items-center gap-3">
          <Button onClick={onDownload} className="gap-2 flex-1" size="lg">
            <Download className="h-4 w-4" />
            Download {options.downloadMode === "audio" ? "Audio" : "Video"}
          </Button>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Ready
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
