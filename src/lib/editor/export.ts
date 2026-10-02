/**
 * Export dialog options, container/codec compatibility rules, and the mapping
 * from dialog choices to the backend `export_project` settings payload.
 */
import type { ExportSettings as BackendExportSettings } from "@/hooks/useEditor";
import type { AppSettings } from "@/hooks/useSettings";

/** Container formats offered for export. */
export const EXPORT_FORMATS = [
  { value: "mp4", label: "MP4", description: "Most compatible" },
  { value: "webm", label: "WebM", description: "Web optimized" },
  { value: "mkv", label: "MKV", description: "High quality container" },
  { value: "mov", label: "MOV", description: "Apple QuickTime" },
] as const;

/** Video codecs offered for export. */
export const VIDEO_CODECS = [
  { value: "h264", label: "H.264", description: "Most compatible" },
  { value: "h265", label: "H.265/HEVC", description: "Better compression" },
  { value: "vp9", label: "VP9", description: "Open source, web" },
  { value: "av1", label: "AV1", description: "Best compression (slow)" },
] as const;

/** Audio codecs offered for export. */
export const AUDIO_CODECS = [
  { value: "aac", label: "AAC", description: "Default" },
  { value: "mp3", label: "MP3", description: "Universal" },
  { value: "opus", label: "Opus", description: "High quality" },
  { value: "flac", label: "FLAC", description: "Lossless" },
] as const;

/** Audio bitrates offered for export, in kbps. */
export const AUDIO_BITRATES = [
  { value: "128", label: "128 kbps", description: "Standard" },
  { value: "192", label: "192 kbps", description: "Good" },
  { value: "256", label: "256 kbps", description: "High" },
  { value: "320", label: "320 kbps", description: "Best" },
] as const;

/** Output resolutions offered for export. */
export const RESOLUTIONS = [
  { value: "original", label: "Original", width: 0, height: 0 },
  { value: "4k", label: "4K UHD", width: 3840, height: 2160 },
  { value: "1440p", label: "1440p QHD", width: 2560, height: 1440 },
  { value: "1080p", label: "1080p Full HD", width: 1920, height: 1080 },
  { value: "720p", label: "720p HD", width: 1280, height: 720 },
  { value: "480p", label: "480p SD", width: 854, height: 480 },
] as const;

/** Output frame rates offered for export. */
export const FRAME_RATES = [
  { value: "original", label: "Original" },
  { value: "24", label: "24 fps (Film)" },
  { value: "25", label: "25 fps (PAL)" },
  { value: "30", label: "30 fps" },
  { value: "50", label: "50 fps" },
  { value: "60", label: "60 fps" },
] as const;

/** Best quality the dialog's CRF slider allows. */
export const CRF_MIN = 18;
/** Smallest file the dialog's CRF slider allows. */
export const CRF_MAX = 28;

/** Choices made in the export dialog. */
export interface ExportDialogSettings {
  format: string;
  videoCodec: string;
  audioCodec: string;
  /** Audio bitrate in kbps, as a string from the select. */
  audioBitrate: string;
  resolution: string;
  /** `"original"` or a numeric fps string. */
  frameRate: string;
  crfQuality: number;
  encodingPreset: string;
  hardwareAcceleration: boolean;
  hardwareAccelerationType: string;
  outputPath: string;
}

const VIDEO_CODECS_BY_FORMAT: Record<string, readonly string[]> = {
  mp4: ["h264", "h265", "av1"],
  mov: ["h264", "h265", "av1"],
  webm: ["vp9", "av1"],
};

const AUDIO_CODECS_BY_FORMAT: Record<string, readonly string[]> = {
  mp4: ["aac", "mp3", "opus", "flac"],
  mov: ["aac", "mp3"],
  webm: ["opus"],
};

/**
 * Video codecs the container can hold. Unknown containers (e.g. MKV) accept all.
 *
 * @param format - Container format.
 * @returns Allowed video codec values.
 */
export function compatibleVideoCodecs(format: string): readonly string[] {
  return VIDEO_CODECS_BY_FORMAT[format] ?? VIDEO_CODECS.map((c) => c.value);
}

/**
 * Audio codecs the container can hold. Unknown containers (e.g. MKV) accept all.
 *
 * @param format - Container format.
 * @returns Allowed audio codec values.
 */
export function compatibleAudioCodecs(format: string): readonly string[] {
  return AUDIO_CODECS_BY_FORMAT[format] ?? AUDIO_CODECS.map((c) => c.value);
}

/**
 * Explain why a format/codec combination cannot be exported.
 *
 * @param format - Container format.
 * @param videoCodec - Video codec.
 * @param audioCodec - Audio codec.
 * @returns A user-facing message, or `null` when the combination is valid.
 */
export function codecCompatibilityError(
  format: string,
  videoCodec: string,
  audioCodec: string
): string | null {
  const name = format.toUpperCase();
  if (!compatibleVideoCodecs(format).includes(videoCodec)) {
    return `${name} does not support the ${videoCodec.toUpperCase()} video codec`;
  }
  if (!compatibleAudioCodecs(format).includes(audioCodec)) {
    return `${name} does not support the ${audioCodec.toUpperCase()} audio codec`;
  }
  return null;
}

/**
 * Approximate target video bitrate for a CRF value (lower CRF = higher quality).
 *
 * @param crf - Constant rate factor.
 * @returns Bitrate in kbps.
 */
export function crfToBitrate(crf: number): number {
  if (crf <= 18) return 20000;
  if (crf <= 20) return 15000;
  if (crf <= 23) return 10000;
  if (crf <= 26) return 6000;
  return 4000;
}

/**
 * Short quality description for a CRF value.
 *
 * @param crf - Constant rate factor.
 * @returns "Excellent", "Good", "Medium" or "Low".
 */
export function qualityLabel(crf: number): string {
  if (crf <= 18) return "Excellent";
  if (crf <= 23) return "Good";
  if (crf <= 28) return "Medium";
  return "Low";
}

/**
 * Build the backend `export_project` settings from dialog choices.
 *
 * @param settings - Dialog choices.
 * @param projectFps - Project frame rate, used when the dialog says "original".
 * @returns Backend export settings payload.
 */
export function buildExportSettings(
  settings: ExportDialogSettings,
  projectFps: number
): BackendExportSettings {
  return {
    format: settings.format,
    quality: settings.encodingPreset,
    resolution: settings.resolution,
    fps: settings.frameRate === "original" ? projectFps : parseInt(settings.frameRate, 10),
    videoBitrate: crfToBitrate(settings.crfQuality),
    audioBitrate: parseInt(settings.audioBitrate, 10),
    useHardwareAcceleration: settings.hardwareAcceleration,
    outputPath: settings.outputPath,
    videoCodec: settings.videoCodec,
    audioCodec: settings.audioCodec,
    crfQuality: settings.crfQuality,
    encodingPreset: settings.encodingPreset,
    hardwareAccelerationType: settings.hardwareAccelerationType,
  };
}

/** Dialog fields that are prefilled from the user's saved settings. */
export type ExportPrefill = Pick<
  ExportDialogSettings,
  "crfQuality" | "encodingPreset" | "hardwareAcceleration" | "hardwareAccelerationType"
> &
  Partial<Pick<ExportDialogSettings, "videoCodec">>;

/**
 * Derive export dialog defaults from backend app settings.
 *
 * @param settings - Settings from `get_settings`, or `null` while loading.
 * @returns Prefilled dialog values (falling back to built-in defaults).
 */
export function exportPrefillFromSettings(settings: AppSettings | null): ExportPrefill {
  const codec = settings?.download.videoCodec;
  const known = VIDEO_CODECS.some((c) => c.value === codec);
  return {
    crfQuality: Math.min(CRF_MAX, Math.max(CRF_MIN, settings?.download.crfQuality ?? 23)),
    encodingPreset: settings?.download.encodingPreset || "medium",
    hardwareAcceleration: settings?.advanced.hardwareAcceleration ?? true,
    hardwareAccelerationType: settings?.advanced.hardwareAccelerationType || "auto",
    ...(codec && known ? { videoCodec: codec } : {}),
  };
}
