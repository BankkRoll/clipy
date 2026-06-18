import { describe, it, expect } from "vitest";
import {
  APP_NAME,
  APP_VERSION,
  VIDEO_QUALITIES,
  VIDEO_FORMATS,
  AUDIO_FORMATS,
  AUDIO_BITRATES,
  VIDEO_CODECS,
  AUDIO_CODECS,
  HW_ACCEL_TYPES,
  ENCODING_PRESETS,
  FILENAME_PLACEHOLDERS,
  SUBTITLE_FORMATS,
  EXPORT_FORMATS,
  EXPORT_PRESETS,
  KEYBOARD_SHORTCUTS,
  TIMELINE,
  DOWNLOAD,
  CACHE,
  FFMPEG_DOWNLOAD_URL,
  YTDLP_DOWNLOAD_URL,
} from "@/lib/constants";

function uniqueValues<T extends { value: string }>(arr: readonly T[]): boolean {
  const vals = arr.map((x) => x.value);
  return new Set(vals).size === vals.length;
}

describe("app identity", () => {
  it("APP_NAME is Clipy", () => {
    expect(APP_NAME).toBe("Clipy");
  });

  it("APP_VERSION is semver-ish", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("option arrays have unique values", () => {
  const cases: Array<[string, readonly { value: string }[]]> = [
    ["VIDEO_QUALITIES", VIDEO_QUALITIES],
    ["VIDEO_FORMATS", VIDEO_FORMATS],
    ["AUDIO_FORMATS", AUDIO_FORMATS],
    ["AUDIO_BITRATES", AUDIO_BITRATES],
    ["VIDEO_CODECS", VIDEO_CODECS],
    ["AUDIO_CODECS", AUDIO_CODECS],
    ["HW_ACCEL_TYPES", HW_ACCEL_TYPES],
    ["ENCODING_PRESETS", ENCODING_PRESETS],
    ["FILENAME_PLACEHOLDERS", FILENAME_PLACEHOLDERS],
    ["SUBTITLE_FORMATS", SUBTITLE_FORMATS],
  ];

  it.each(cases)("%s has unique values", (_name, arr) => {
    expect(uniqueValues(arr)).toBe(true);
  });

  it.each(cases)("%s entries all have label + value", (_name, arr) => {
    for (const item of arr) {
      expect(item.value).toBeTruthy();
      expect((item as unknown as { label: string }).label).toBeTruthy();
    }
  });
});

describe("VIDEO_QUALITIES", () => {
  it("values are descending numeric heights", () => {
    const nums = VIDEO_QUALITIES.map((q) => Number(q.value));
    const sorted = [...nums].sort((a, b) => b - a);
    expect(nums).toEqual(sorted);
  });

  it("contains the recommended 1080 option", () => {
    const q = VIDEO_QUALITIES.find((x) => x.value === "1080");
    expect(q?.badge).toBe("Recommended");
  });
});

describe("AUDIO_FORMATS", () => {
  it("lossless formats wav and flac have no bitrates", () => {
    for (const v of ["wav", "flac"]) {
      const f = AUDIO_FORMATS.find((x) => x.value === v);
      expect(f?.bitrates).toEqual([]);
    }
  });

  it("lossy formats have ascending bitrate lists", () => {
    for (const f of AUDIO_FORMATS) {
      if (f.bitrates.length > 1) {
        const sorted = [...f.bitrates].sort((a, b) => a - b);
        expect([...f.bitrates]).toEqual(sorted);
      }
    }
  });
});

describe("EXPORT_FORMATS alias", () => {
  it("is the same reference as VIDEO_FORMATS", () => {
    expect(EXPORT_FORMATS).toBe(VIDEO_FORMATS);
  });
});

describe("EXPORT_PRESETS", () => {
  it("has unique ids", () => {
    const ids = EXPORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset has a WxH resolution", () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.resolution).toMatch(/^\d+x\d+$/);
    }
  });

  it("every preset has bitrate ending in k", () => {
    for (const p of EXPORT_PRESETS) {
      expect(p.bitrate).toMatch(/k$/);
      expect(p.audioBitrate).toMatch(/k$/);
    }
  });
});

describe("KEYBOARD_SHORTCUTS", () => {
  it("contains expected core bindings", () => {
    expect(KEYBOARD_SHORTCUTS.PLAY_PAUSE).toBe("Space");
    expect(KEYBOARD_SHORTCUTS.SAVE).toBe("Ctrl+s");
    expect(KEYBOARD_SHORTCUTS.UNDO).toBe("Ctrl+z");
  });

  it("all values are non-empty strings", () => {
    for (const v of Object.values(KEYBOARD_SHORTCUTS)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("numeric constant groups", () => {
  it("TIMELINE zoom bounds are coherent", () => {
    expect(TIMELINE.MIN_ZOOM).toBeLessThan(TIMELINE.DEFAULT_ZOOM);
    expect(TIMELINE.DEFAULT_ZOOM).toBeLessThanOrEqual(TIMELINE.MAX_ZOOM);
    expect(TIMELINE.TRACK_HEIGHT).toBeGreaterThan(0);
  });

  it("DOWNLOAD values are positive", () => {
    expect(DOWNLOAD.MAX_CONCURRENT).toBeGreaterThan(0);
    expect(DOWNLOAD.RETRY_ATTEMPTS).toBeGreaterThan(0);
    expect(DOWNLOAD.RETRY_DELAY).toBeGreaterThan(0);
  });

  it("CACHE max size is 500 MB in bytes", () => {
    expect(CACHE.MAX_CACHE_SIZE).toBe(500 * 1024 * 1024);
    expect(CACHE.THUMBNAIL_MAX_AGE).toBeGreaterThan(CACHE.VIDEO_INFO_MAX_AGE);
  });
});

describe("download URLs", () => {
  it("are https github urls", () => {
    expect(FFMPEG_DOWNLOAD_URL).toMatch(/^https:\/\/github\.com\//);
    expect(YTDLP_DOWNLOAD_URL).toMatch(/^https:\/\/github\.com\//);
  });

  it("ytdlp url points at the windows exe", () => {
    expect(YTDLP_DOWNLOAD_URL).toMatch(/yt-dlp\.exe$/);
  });
});
