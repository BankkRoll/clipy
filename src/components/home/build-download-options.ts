/**
 * Translate the Home form into the backend `start_download` payload.
 */
import { DEFAULT_DOWNLOAD_OPTIONS, type DownloadOptions } from "@/types/download";
import type { AppSettings } from "@/hooks/useSettings";
import type { DownloadOptions as FormOptions } from "./hooks/use-download-options";

/**
 * Build the `start_download` options from the form state plus the persisted
 * download settings the form does not expose.
 *
 * @param form - Options chosen on the Home form.
 * @param settings - Backend settings (may still be loading).
 * @returns A complete backend `DownloadOptions` payload.
 */
export function buildDownloadOptions(
  form: FormOptions,
  settings: AppSettings | null
): DownloadOptions {
  const d = settings?.download;
  const audio = form.downloadMode === "audio";
  return {
    ...DEFAULT_DOWNLOAD_OPTIONS,
    quality: audio ? "best" : form.quality,
    format: audio ? form.audioFormat : form.format,
    audioOnly: audio,
    outputPath: d?.downloadPath || "",
    filename: "",
    embedThumbnail: form.embedThumbnail,
    embedMetadata: form.embedMetadata,
    audioFormat: form.audioFormat,
    audioBitrate: form.audioBitrate,
    audioCodec: d?.audioCodec || "auto",
    videoCodec: d?.videoCodec || "auto",
    downloadSubtitles: form.downloadSubtitles,
    subtitleLanguages: [form.subtitleLanguage],
    subtitleFormat: d?.subtitleFormat || "srt",
    embedSubtitles: form.embedSubtitles,
    autoSubtitles: form.autoSubtitles,
    sponsorBlock: form.sponsorBlock,
    sponsorBlockCategories: form.sponsorCategories,
    downloadChapters: form.downloadChapters,
    splitByChapters: form.splitByChapters,
    writeDescription: form.writeDescription,
    writeThumbnail: form.writeThumbnail,
    writeInfoJson: d?.writeInfoJson || false,
    rateLimit: d?.rateLimit || "",
    playlistItems: d?.playlistItems || "",
    concurrentFragments: d?.concurrentFragments || 1,
    cookiesFromBrowser: d?.cookiesFromBrowser || "",
    proxyUrl: settings?.advanced?.proxyUrl || "",
    restrictFilenames: d?.restrictFilenames || false,
    useDownloadArchive: d?.useDownloadArchive || false,
    createChannelSubfolder: d?.createChannelSubfolder || false,
    includeDateInFilename: d?.includeDateInFilename || false,
    filenameTemplate: d?.filenameTemplate || "",
    geoBypass: d?.geoBypass || false,
  };
}
