import { useState, useCallback, useEffect, useRef } from "react";
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
  const [audioFormat, setAudioFormat] = useState(settings?.download?.audioFormat ?? "m4a");
  const [audioBitrate, setAudioBitrate] = useState(settings?.download?.audioBitrate ?? "192");
  const [embedThumbnail, setEmbedThumbnail] = useState(settings?.download?.embedThumbnail ?? true);
  const [embedMetadata, setEmbedMetadata] = useState(settings?.download?.embedMetadata ?? true);
  const [downloadSubtitles, setDownloadSubtitles] = useState(settings?.download?.downloadSubtitles ?? false);
  const [subtitleLanguage, setSubtitleLanguage] = useState(settings?.download?.subtitleLanguage ?? "en");
  const [embedSubtitles, setEmbedSubtitles] = useState(settings?.download?.embedSubtitles ?? false);
  const [autoSubtitles, setAutoSubtitles] = useState(settings?.download?.autoSubtitles ?? false);
  const [sponsorBlock, setSponsorBlock] = useState(settings?.download?.sponsorBlock ?? false);
  const [sponsorCategories, setSponsorCategories] = useState<string[]>(
    settings?.download?.sponsorBlockCategories ?? ["sponsor"]
  );
  const [downloadChapters, setDownloadChapters] = useState(settings?.download?.downloadChapters ?? false);
  const [splitByChapters, setSplitByChapters] = useState(settings?.download?.splitByChapters ?? false);
  const [writeDescription, setWriteDescription] = useState(settings?.download?.writeDescription ?? false);
  const [writeThumbnail, setWriteThumbnail] = useState(settings?.download?.writeThumbnail ?? false);

  // Settings may load async (null at first render). Re-seed state once when
  // settings transition from null -> loaded, so saved settings take effect on
  // the initial form even if the user hasn't touched anything yet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!settings) return;
    seededRef.current = true;

    const d = settings.download;
    setQuality(d?.defaultQuality || "1080");
    setFormat(d?.defaultFormat || "mp4");
    setAudioFormat(d?.audioFormat ?? "m4a");
    setAudioBitrate(d?.audioBitrate ?? "192");
    setEmbedThumbnail(d?.embedThumbnail ?? true);
    setEmbedMetadata(d?.embedMetadata ?? true);
    setDownloadSubtitles(d?.downloadSubtitles ?? false);
    setSubtitleLanguage(d?.subtitleLanguage ?? "en");
    setEmbedSubtitles(d?.embedSubtitles ?? false);
    setAutoSubtitles(d?.autoSubtitles ?? false);
    setSponsorBlock(d?.sponsorBlock ?? false);
    setSponsorCategories(d?.sponsorBlockCategories ?? ["sponsor"]);
    setDownloadChapters(d?.downloadChapters ?? false);
    setSplitByChapters(d?.splitByChapters ?? false);
    setWriteDescription(d?.writeDescription ?? false);
    setWriteThumbnail(d?.writeThumbnail ?? false);
  }, [settings]);

  const toggleSponsorCategory = useCallback((category: string) => {
    setSponsorCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
    );
  }, []);

  const resetOptions = useCallback(() => {
    const d = settings?.download;
    setDownloadMode("video");
    setQuality(d?.defaultQuality || "1080");
    setFormat(d?.defaultFormat || "mp4");
    setAudioFormat(d?.audioFormat ?? "m4a");
    setAudioBitrate(d?.audioBitrate ?? "192");
    setEmbedThumbnail(d?.embedThumbnail ?? true);
    setEmbedMetadata(d?.embedMetadata ?? true);
    setDownloadSubtitles(d?.downloadSubtitles ?? false);
    setSubtitleLanguage(d?.subtitleLanguage ?? "en");
    setEmbedSubtitles(d?.embedSubtitles ?? false);
    setAutoSubtitles(d?.autoSubtitles ?? false);
    setSponsorBlock(d?.sponsorBlock ?? false);
    setSponsorCategories(d?.sponsorBlockCategories ?? ["sponsor"]);
    setDownloadChapters(d?.downloadChapters ?? false);
    setSplitByChapters(d?.splitByChapters ?? false);
    setWriteDescription(d?.writeDescription ?? false);
    setWriteThumbnail(d?.writeThumbnail ?? false);
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
    },
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
