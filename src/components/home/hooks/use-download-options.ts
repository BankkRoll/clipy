import { useState, useCallback } from "react";
import type { AppSettings } from "@/hooks/useSettings";

export interface DownloadOptions {
  downloadMode: "video" | "audio";
  quality: string;
  format: string;
  audioFormat: string;
  audioBitrate: string;
  embedThumbnail: boolean;
  embedMetadata: boolean;
  downloadSubtitles: boolean;
  subtitleLanguage: string;
  embedSubtitles: boolean;
  autoSubtitles: boolean;
  sponsorBlock: boolean;
  sponsorCategories: string[];
  downloadChapters: boolean;
  splitByChapters: boolean;
  writeDescription: boolean;
  writeThumbnail: boolean;
}

export function useDownloadOptions(settings: AppSettings | null) {
  const [downloadMode, setDownloadMode] = useState<"video" | "audio">("video");
  const [quality, setQuality] = useState(settings?.download?.defaultQuality || "1080");
  const [format, setFormat] = useState(settings?.download?.defaultFormat || "mp4");
  const [audioFormat, setAudioFormat] = useState("m4a");
  const [audioBitrate, setAudioBitrate] = useState("192");
  const [embedThumbnail, setEmbedThumbnail] = useState(settings?.download?.embedThumbnail ?? true);
  const [embedMetadata, setEmbedMetadata] = useState(settings?.download?.embedMetadata ?? true);
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = useState("en");
  const [embedSubtitles, setEmbedSubtitles] = useState(false);
  const [autoSubtitles, setAutoSubtitles] = useState(false);
  const [sponsorBlock, setSponsorBlock] = useState(false);
  const [sponsorCategories, setSponsorCategories] = useState<string[]>(["sponsor"]);
  const [downloadChapters, setDownloadChapters] = useState(false);
  const [splitByChapters, setSplitByChapters] = useState(false);
  const [writeDescription, setWriteDescription] = useState(false);
  const [writeThumbnail, setWriteThumbnail] = useState(false);

  const toggleSponsorCategory = useCallback((category: string) => {
    setSponsorCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const resetOptions = useCallback(() => {
    setDownloadMode("video");
    setQuality(settings?.download?.defaultQuality || "1080");
    setFormat(settings?.download?.defaultFormat || "mp4");
    setAudioFormat("m4a");
    setAudioBitrate("192");
    setEmbedThumbnail(settings?.download?.embedThumbnail ?? true);
    setEmbedMetadata(settings?.download?.embedMetadata ?? true);
    setDownloadSubtitles(false);
    setSubtitleLanguage("en");
    setEmbedSubtitles(false);
    setAutoSubtitles(false);
    setSponsorBlock(false);
    setSponsorCategories(["sponsor"]);
    setDownloadChapters(false);
    setSplitByChapters(false);
    setWriteDescription(false);
    setWriteThumbnail(false);
  }, [settings]);

  return {
    options: {
      downloadMode,
      quality,
      format,
      audioFormat,
      audioBitrate,
      embedThumbnail,
      embedMetadata,
      downloadSubtitles,
      subtitleLanguage,
      embedSubtitles,
      autoSubtitles,
      sponsorBlock,
      sponsorCategories,
      downloadChapters,
      splitByChapters,
      writeDescription,
      writeThumbnail,
    } as DownloadOptions,
    setters: {
      setDownloadMode,
      setQuality,
      setFormat,
      setAudioFormat,
      setAudioBitrate,
      setEmbedThumbnail,
      setEmbedMetadata,
      setDownloadSubtitles,
      setSubtitleLanguage,
      setEmbedSubtitles,
      setAutoSubtitles,
      setSponsorBlock,
      setSponsorCategories,
      setDownloadChapters,
      setSplitByChapters,
      setWriteDescription,
      setWriteThumbnail,
    },
    toggleSponsorCategory,
    resetOptions,
  };
}
