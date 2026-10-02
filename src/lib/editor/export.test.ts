import { describe, it, expect } from "vitest";
import {
  buildExportSettings,
  codecCompatibilityError,
  compatibleAudioCodecs,
  compatibleVideoCodecs,
  crfToBitrate,
  exportPrefillFromSettings,
  qualityLabel,
  type ExportDialogSettings,
} from "./export";
import type { AppSettings } from "@/hooks/useSettings";

const dialog: ExportDialogSettings = {
  format: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  audioBitrate: "192",
  resolution: "1080p",
  frameRate: "original",
  crfQuality: 20,
  encodingPreset: "slow",
  hardwareAcceleration: false,
  hardwareAccelerationType: "nvenc",
  outputPath: "C:\\out.mp4",
};

describe("crfToBitrate / qualityLabel", () => {
  it.each([
    [18, 20000],
    [20, 15000],
    [23, 10000],
    [26, 6000],
    [28, 4000],
  ])("crf %i -> %i kbps", (crf, kbps) => {
    expect(crfToBitrate(crf)).toBe(kbps);
  });

  it.each([
    [18, "Excellent"],
    [23, "Good"],
    [28, "Medium"],
    [30, "Low"],
  ])("crf %i is %s", (crf, label) => {
    expect(qualityLabel(crf)).toBe(label);
  });
});

describe("buildExportSettings", () => {
  it("maps dialog choices to the backend payload", () => {
    expect(buildExportSettings(dialog, 30)).toEqual({
      format: "mp4",
      quality: "slow",
      resolution: "1080p",
      fps: 30,
      videoBitrate: 15000,
      audioBitrate: 192,
      useHardwareAcceleration: false,
      outputPath: "C:\\out.mp4",
      videoCodec: "h264",
      audioCodec: "aac",
      crfQuality: 20,
      encodingPreset: "slow",
      hardwareAccelerationType: "nvenc",
    });
  });

  it("uses an explicit frame rate when chosen", () => {
    expect(buildExportSettings({ ...dialog, frameRate: "60" }, 30).fps).toBe(60);
  });
});

describe("codec compatibility", () => {
  it("restricts WebM to VP9/AV1 + Opus and MP4/MOV to H.264/H.265/AV1", () => {
    expect(compatibleVideoCodecs("webm")).toEqual(["vp9", "av1"]);
    expect(compatibleVideoCodecs("mp4")).toEqual(["h264", "h265", "av1"]);
    expect(compatibleVideoCodecs("mov")).toEqual(["h264", "h265", "av1"]);
    expect(compatibleAudioCodecs("webm")).toEqual(["opus"]);
  });

  it("allows everything in MKV", () => {
    expect(compatibleVideoCodecs("mkv")).toEqual(["h264", "h265", "vp9", "av1"]);
    expect(compatibleAudioCodecs("mkv")).toEqual(["aac", "mp3", "opus", "flac"]);
  });

  it("explains invalid combinations", () => {
    expect(codecCompatibilityError("mp4", "h264", "aac")).toBeNull();
    expect(codecCompatibilityError("webm", "h264", "opus")).toBe(
      "WEBM does not support the H264 video codec"
    );
    expect(codecCompatibilityError("webm", "vp9", "aac")).toBe(
      "WEBM does not support the AAC audio codec"
    );
  });
});

describe("exportPrefillFromSettings", () => {
  it("uses built-in defaults while settings load", () => {
    expect(exportPrefillFromSettings(null)).toEqual({
      crfQuality: 23,
      encodingPreset: "medium",
      hardwareAcceleration: true,
      hardwareAccelerationType: "auto",
    });
  });

  it("prefills from backend settings, clamping CRF to the slider range", () => {
    const settings = {
      download: { crfQuality: 40, encodingPreset: "fast", videoCodec: "vp9" },
      advanced: { hardwareAcceleration: false, hardwareAccelerationType: "qsv" },
    } as unknown as AppSettings;
    expect(exportPrefillFromSettings(settings)).toEqual({
      crfQuality: 28,
      encodingPreset: "fast",
      hardwareAcceleration: false,
      hardwareAccelerationType: "qsv",
      videoCodec: "vp9",
    });
  });

  it("ignores unknown codecs and empty strings", () => {
    const settings = {
      download: { crfQuality: 10, encodingPreset: "", videoCodec: "copy" },
      advanced: { hardwareAcceleration: true },
    } as unknown as AppSettings;
    expect(exportPrefillFromSettings(settings)).toEqual({
      crfQuality: 18,
      encodingPreset: "medium",
      hardwareAcceleration: true,
      hardwareAccelerationType: "auto",
    });
  });
});
