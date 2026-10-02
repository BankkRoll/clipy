import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatBytes,
  formatDuration,
  formatDurationVerbose,
  formatRelativeTime,
  debounce,
  throttle,
  generateId,
  clamp,
  isValidYouTubeUrl,
  isValidUrl,
  extractYouTubeVideoId,
  sanitizeFilename,
  isNewerVersion,
  compareVersions,
  normalizeUrl,
  thumbnailSrc,
  isRemoteSource,
  isEditableTarget,
  mediaSrc,
} from "@/lib/utils";
import { mockConvertFileSrc } from "@tauri-apps/api/mocks";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("dedupes conflicting tailwind classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("handles conditional/falsy values", () => {
    const cond = false as boolean;
    expect(cn("a", cond && "b", null, undefined, "c")).toBe("a c");
  });
});

describe("formatBytes", () => {
  it("returns '0 Bytes' for 0", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 Bytes");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });

  it("formats terabytes for huge numbers", () => {
    expect(formatBytes(1099511627776)).toBe("1 TB");
  });

  it("respects the decimals argument", () => {
    expect(formatBytes(1536, 0)).toBe("2 KB");
    expect(formatBytes(1536, 3)).toBe("1.5 KB");
  });

  it("treats negative decimals as 0 decimals", () => {
    expect(formatBytes(1536, -5)).toBe("2 KB");
  });
});

describe("formatDuration", () => {
  it("formats seconds under a minute as M:SS", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(59)).toBe("0:59");
  });

  it("formats minutes as M:SS", () => {
    expect(formatDuration(90)).toBe("1:30");
    expect(formatDuration(605)).toBe("10:05");
  });

  it("formats hours as H:MM:SS", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
    expect(formatDuration(3600)).toBe("1:00:00");
  });

  it("handles 0", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(90.9)).toBe("1:30");
  });
});

describe("formatDurationVerbose", () => {
  it("formats seconds only", () => {
    expect(formatDurationVerbose(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDurationVerbose(330)).toBe("5m 30s");
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatDurationVerbose(3661)).toBe("1h 1m 1s");
  });

  it("omits zero minutes/seconds when there are hours", () => {
    expect(formatDurationVerbose(3600)).toBe("1h");
  });

  it("returns '0s' for 0", () => {
    expect(formatDurationVerbose(0)).toBe("0s");
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for very recent times", () => {
    expect(formatRelativeTime(new Date("2026-06-18T11:59:30.000Z"))).toBe("just now");
  });

  it("formats minutes ago", () => {
    expect(formatRelativeTime(new Date("2026-06-18T11:55:00.000Z"))).toBe("5 minutes ago");
  });

  it("formats a single hour without pluralizing", () => {
    expect(formatRelativeTime(new Date("2026-06-18T11:00:00.000Z"))).toBe("1 hour ago");
  });

  it("formats days ago", () => {
    expect(formatRelativeTime(new Date("2026-06-16T12:00:00.000Z"))).toBe("2 days ago");
  });

  it("accepts a string date", () => {
    expect(formatRelativeTime("2026-06-18T11:55:00.000Z")).toBe("5 minutes ago");
  });
});

describe("generateId", () => {
  it("returns a non-empty string", () => {
    expect(typeof generateId()).toBe("string");
    expect(generateId().length).toBeGreaterThan(0);
  });

  it("produces unique-ish ids across many calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });

  it("matches the timestamp-random format", () => {
    expect(generateId()).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe("clamp", () => {
  it("returns the value when in range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps below min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps above max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal bounds", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it("works with negative ranges", () => {
    expect(clamp(-7, -10, -5)).toBe(-7);
    expect(clamp(-20, -10, -5)).toBe(-10);
  });
});

describe("isValidYouTubeUrl", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/abc123",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  ])("accepts %s", (url) => {
    expect(isValidYouTubeUrl(url)).toBe(true);
  });

  it.each(["https://vimeo.com/12345", "not a url", "https://google.com", ""])(
    "rejects %s",
    (url) => {
      expect(isValidYouTubeUrl(url)).toBe(false);
    }
  );
});

describe("isValidUrl", () => {
  it("accepts full http(s) urls", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com/path?q=1")).toBe(true);
  });

  it("accepts bare domains (prepends https)", () => {
    expect(isValidUrl("example.com")).toBe(true);
    expect(isValidUrl("youtube.com/watch?v=abc")).toBe(true);
  });

  it("accepts bare hosts with a port and localhost", () => {
    expect(isValidUrl("example.com:8080/v")).toBe(true);
    expect(isValidUrl("localhost:3000/v")).toBe(true);
  });

  it("rejects clearly invalid input", () => {
    expect(isValidUrl("")).toBe(false);
    expect(isValidUrl(" ")).toBe(false);
    expect(isValidUrl("hello")).toBe(false);
    expect(isValidUrl("two words.com")).toBe(false);
    expect(isValidUrl("https://")).toBe(false);
    expect(isValidUrl("http://exa mple.com")).toBe(false);
  });

  it.each([
    "httpx://example.com",
    "ftp://example.com",
    "file:///C:/video.mp4",
    "file:/etc/passwd",
    "javascript:alert(1)",
    "mailto:me@example.com",
    "data:text/html,hi",
    "https:/example.com",
  ])("rejects non-http(s) or malformed scheme %s", (url) => {
    expect(isValidUrl(url)).toBe(false);
  });
});

describe("normalizeUrl", () => {
  it("prefixes https only for bare domains", () => {
    expect(normalizeUrl("youtube.com/watch?v=x")).toBe("https://youtube.com/watch?v=x");
    expect(normalizeUrl("  http://example.com/a ")).toBe("http://example.com/a");
  });

  it("returns null for unusable input", () => {
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("[::1")).toBeNull();
  });
});

describe("thumbnailSrc", () => {
  it("returns null when there is no thumbnail", () => {
    expect(thumbnailSrc("")).toBeNull();
    expect(thumbnailSrc("   ")).toBeNull();
    expect(thumbnailSrc(null)).toBeNull();
    expect(thumbnailSrc(undefined)).toBeNull();
  });

  it("keeps https, data and blob URLs from any site", () => {
    expect(thumbnailSrc("https://vimeo.com/t.jpg")).toBe("https://vimeo.com/t.jpg");
    expect(thumbnailSrc("data:image/png;base64,AA")).toBe("data:image/png;base64,AA");
    expect(thumbnailSrc("blob:x")).toBe("blob:x");
  });

  it("upgrades http and protocol-relative URLs to https", () => {
    expect(thumbnailSrc("http://cdn.site/t.jpg")).toBe("https://cdn.site/t.jpg");
    expect(thumbnailSrc("//cdn.site/t.jpg")).toBe("https://cdn.site/t.jpg");
  });

  it("routes local files through the media protocol", () => {
    mockConvertFileSrc("windows");
    expect(thumbnailSrc("C:\\thumbs\\a (1).jpg")).toBe(mediaSrc("C:\\thumbs\\a (1).jpg"));
    expect(thumbnailSrc("C:\\thumbs\\a.jpg")).toMatch(/clipy-media/);
  });
});

describe("isRemoteSource", () => {
  it("distinguishes URLs from local paths", () => {
    expect(isRemoteSource("https://a/b.mp4")).toBe(true);
    expect(isRemoteSource("HTTP://a/b.mp4")).toBe(true);
    expect(isRemoteSource("blob:abc")).toBe(true);
    expect(isRemoteSource("data:video/mp4;base64,")).toBe(true);
    expect(isRemoteSource("httpdocs/video.mp4")).toBe(false);
    expect(isRemoteSource("C:\\v.mp4")).toBe(false);
  });
});

describe("isEditableTarget", () => {
  it("detects text-entry controls", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.appendChild(child);
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});

describe("extractYouTubeVideoId", () => {
  it("extracts from watch?v= urls", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("extracts from youtu.be urls", () => {
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from embed urls", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from shorts urls", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts from watch urls with extra query params", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toBe(
      "dQw4w9WgXcQ"
    );
  });

  it("returns null for non-youtube urls", () => {
    expect(extractYouTubeVideoId("https://vimeo.com/12345")).toBeNull();
  });

  it("returns null for empty/garbage input", () => {
    expect(extractYouTubeVideoId("")).toBeNull();
    expect(extractYouTubeVideoId("just some text")).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("replaces illegal filesystem characters with underscores", () => {
    expect(sanitizeFilename('a<b>c:d"e/f\\g|h?i*j')).toBe("a_b_c_d_e_f_g_h_i_j");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFilename("  hello    world  ")).toBe("hello world");
  });

  it("truncates to 200 characters", () => {
    const long = "x".repeat(300);
    expect(sanitizeFilename(long).length).toBe(200);
  });
});

describe("debounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("only calls once after the delay for rapid calls", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("passes the latest arguments", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("a");
    debounced("b");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith("b");
  });

  it("resets the timer on each call", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);
    debounced();
    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("throttle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("calls immediately on first invocation", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("ignores calls within the limit window", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows another call after the limit window passes", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes through arguments of the leading call", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled("first");
    throttled("second");
    expect(fn).toHaveBeenCalledWith("first");
  });
});

describe("isNewerVersion", () => {
  it("detects a newer patch/minor/major", () => {
    expect(isNewerVersion("2.0.1", "2.0.0")).toBe(true);
    expect(isNewerVersion("2.1.0", "2.0.9")).toBe(true);
    expect(isNewerVersion("3.0.0", "2.9.9")).toBe(true);
  });
  it("returns false for equal or older", () => {
    expect(isNewerVersion("2.0.0", "2.0.0")).toBe(false);
    expect(isNewerVersion("1.9.9", "2.0.0")).toBe(false);
  });
  it("tolerates leading v and prerelease suffixes", () => {
    expect(isNewerVersion("v2.1.0", "2.0.0")).toBe(true);
    expect(isNewerVersion("2.0.0-beta.1", "2.0.0")).toBe(false);
  });
  it("treats a release as newer than its own prerelease", () => {
    expect(isNewerVersion("2.0.0", "2.0.0-rc.1")).toBe(true);
    expect(isNewerVersion("2.0.1-alpha", "2.0.0")).toBe(true);
  });
  it("handles missing segments", () => {
    expect(isNewerVersion("2.1", "2.0.5")).toBe(true);
    expect(isNewerVersion("2", "2.0.0")).toBe(false);
  });
});

describe("compareVersions", () => {
  // The semver 2.0 spec's own precedence example, ascending.
  const ordered = [
    "1.0.0-alpha",
    "1.0.0-alpha.1",
    "1.0.0-alpha.beta",
    "1.0.0-beta",
    "1.0.0-beta.2",
    "1.0.0-beta.11",
    "1.0.0-rc.1",
    "1.0.0",
  ];

  it.each(ordered.slice(1).map((v, i) => [ordered[i]!, v]))("%s < %s", (lower, higher) => {
    expect(compareVersions(lower, higher)).toBeLessThan(0);
    expect(compareVersions(higher, lower)).toBeGreaterThan(0);
  });

  it("treats equal versions, build metadata and a leading v as equal", () => {
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3+build.5", "1.2.3")).toBe(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0-rc.1")).toBe(0);
  });

  it("pads missing segments on either side with zeros", () => {
    expect(compareVersions("2.0.1", "2")).toBeGreaterThan(0);
    expect(compareVersions("2", "2.0.1")).toBeLessThan(0);
    expect(compareVersions("2", "2.0.0")).toBe(0);
  });

  it("orders numeric identifiers before alphanumeric ones", () => {
    expect(compareVersions("1.0.0-1", "1.0.0-a")).toBeLessThan(0);
    expect(compareVersions("1.0.0-a", "1.0.0-1")).toBeGreaterThan(0);
  });
});
