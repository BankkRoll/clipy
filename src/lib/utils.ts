/**
 * Shared helpers: class names, formatting, timing, URL/version handling and
 * media/thumbnail source resolution.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Merge Tailwind CSS classes; later classes win conflicts.
 *
 * @param inputs - Class values accepted by clsx.
 * @returns The merged class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a byte count for display, e.g. `1.5 MB`.
 *
 * @param bytes - Size in bytes.
 * @param decimals - Maximum fraction digits.
 * @returns The human-readable size.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Format seconds as `H:MM:SS` (or `M:SS` under an hour).
 *
 * @param seconds - Duration in seconds.
 * @returns The clock-style duration.
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format seconds as words, e.g. `5m 30s`.
 *
 * @param seconds - Duration in seconds.
 * @returns The verbose duration.
 */
export function formatDurationVerbose(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${secs}s`);
  }

  return parts.join(" ");
}

/**
 * Format a timestamp relative to now, e.g. `2 hours ago`.
 *
 * @param date - Date or ISO string.
 * @returns The relative time.
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

  const intervals = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
  ];

  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds);
    if (count >= 1) {
      return `${count} ${interval.label}${count !== 1 ? "s" : ""} ago`;
    }
  }

  return "just now";
}

/**
 * Delay calls until `delay` ms pass without another call.
 *
 * @param fn - Function to debounce.
 * @param delay - Quiet period in milliseconds.
 * @returns The debounced function.
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Run at most one call per `limit` ms (leading edge).
 *
 * @param fn - Function to throttle.
 * @param limit - Minimum interval in milliseconds.
 * @returns The throttled function.
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Generate a process-unique id (time + random suffix); not cryptographic.
 *
 * @returns A new id.
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Clamp a number to `[min, max]`.
 *
 * @param value - Input value.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns The clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check whether a URL points at a YouTube video (watch, shorts, youtu.be, embed).
 *
 * @param url - URL to test; the scheme is optional.
 * @returns True for YouTube video URLs.
 */
export function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
    /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/[\w-]+/,
  ];

  return patterns.some((pattern) => pattern.test(url));
}

const EXPLICIT_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;
// "mailto:x", "javascript:x", "file:/x" — a scheme without "//". A bare
// "host:port" also matches, so the port case is excluded by requiring a
// non-digit right after the colon.
const OPAQUE_SCHEME = /^[a-z][a-z\d+.-]*:(?!\d)/i;

/**
 * Normalize user input into an http(s) URL with a host.
 *
 * Input with an explicit scheme must already be `http://` or `https://`. Input
 * without one is treated as a bare domain (`youtube.com/watch?v=...`) and
 * prefixed with `https://`, but only if its host contains a dot (or is
 * `localhost`), so arbitrary words are not mistaken for URLs.
 *
 * @param input - Raw text, e.g. from the URL field.
 * @returns The normalized URL string, or `null` if it is not a usable URL.
 * @example
 * normalizeUrl("youtube.com/watch?v=x"); // "https://youtube.com/watch?v=x"
 * normalizeUrl("ftp://example.com"); // null
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  const hasScheme = EXPLICIT_SCHEME.test(trimmed);
  if (!hasScheme && OPAQUE_SCHEME.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  // NOTE: http(s) are WHATWG "special" schemes, which cannot parse without a
  // host, so a successful parse here already guarantees one.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (!hasScheme && !parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return null;
  }
  return parsed.href;
}

/**
 * Check whether input is an http(s) URL with a host (see {@link normalizeUrl}).
 *
 * @param url - Raw text, e.g. from the URL field.
 * @returns True if the input can be sent to the backend as a URL.
 */
export function isValidUrl(url: string): boolean {
  return normalizeUrl(url) !== null;
}

/**
 * Extract the 11-character video id from a YouTube URL.
 *
 * @param url - YouTube watch, shorts, embed or youtu.be URL.
 * @returns The id, or `null` if none is found.
 */
export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Make a string safe to use as a filename on every desktop OS.
 *
 * @param filename - Proposed name.
 * @returns The name with reserved characters replaced, whitespace collapsed
 *   and length capped at 200.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function parseVersion(v: string): { core: number[]; pre: string[] } {
  const clean = v.trim().replace(/^v/i, "").replace(/\+.*$/, "");
  const dash = clean.indexOf("-");
  const core = dash === -1 ? clean : clean.slice(0, dash);
  const pre = dash === -1 ? "" : clean.slice(dash + 1);
  return {
    core: core.split(".").map((n) => parseInt(n, 10) || 0),
    pre: pre ? pre.split(".") : [],
  };
}

function comparePrerelease(a: string[], b: string[]): number {
  // A release outranks any of its prereleases: 1.0.0 > 1.0.0-rc.1.
  if (a.length === 0 || b.length === 0) return b.length - a.length;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) return Number(x) - Number(y);
    // Numeric identifiers sort before alphanumeric ones.
    if (xNum !== yNum) return xNum ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Compare two version strings using semver 2.0 precedence, including
 * prerelease tags. Tolerates a leading "v", build metadata and missing
 * minor/patch segments.
 *
 * @param a - First version, e.g. `2.1.0-beta.2`.
 * @param b - Second version.
 * @returns A negative number if `a < b`, positive if `a > b`, 0 if equal.
 * @example
 * compareVersions("2.0.0", "2.0.0-rc.1"); // > 0
 */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < Math.max(x.core.length, y.core.length); i++) {
    const diff = (x.core[i] ?? 0) - (y.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return comparePrerelease(x.pre, y.pre);
}

/**
 * Check whether `candidate` is strictly newer than `current` (semver precedence).
 *
 * @param candidate - Version that might be newer, e.g. the latest release tag.
 * @param current - The running version.
 * @returns True if `candidate` has higher precedence than `current`.
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

/**
 * Resolve a video thumbnail into something an `<img>` can load.
 *
 * Remote thumbnails come from many sites (not only YouTube), sometimes as
 * protocol-relative or plain `http:` URLs that the webview CSP blocks; those
 * are upgraded to https. Local files go through the media protocol.
 *
 * @param thumbnail - Thumbnail URL or local path as stored by the backend.
 * @returns A loadable URL, or `null` when there is no thumbnail (show a placeholder).
 */
export function thumbnailSrc(thumbnail: string | null | undefined): string | null {
  const value = thumbnail?.trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (/^http:\/\//i.test(value)) return `https://${value.slice("http://".length)}`;
  if (/^(https|data|blob):/i.test(value)) return value;
  return mediaSrc(value);
}

/**
 * Check whether keyboard focus is in a text-entry control, where app-level
 * shortcuts must not steal keystrokes.
 *
 * @param target - The keyboard event target.
 * @returns True for inputs, textareas, selects and contenteditable elements.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    // COMPAT: jsdom (tests) does not implement isContentEditable.
    target.closest('[contenteditable=""], [contenteditable="true"]') !== null
  );
}

/**
 * Check whether a media source is already a URL rather than a local path.
 *
 * @param path - Source string.
 * @returns True for `http(s):`, `blob:` and `data:` URLs.
 */
export function isRemoteSource(path: string): boolean {
  return /^(https?|blob|data):/i.test(path);
}

/**
 * Build a webview-safe URL for a local media file via our custom
 * `clipy-media` URI scheme (registered in src-tauri/src/media_protocol.rs).
 *
 * We delegate to Tauri's `convertFileSrc(path, "clipy-media")` for ONE reason:
 * it emits the correct per-platform host form that the webview can actually
 * navigate to — `http://clipy-media.localhost/<path>` on Windows (WebView2) and
 * `clipy-media://localhost/<path>` on macOS/Linux. Feeding a raw
 * `clipy-media://` URL straight into <video src> on Windows fails WebView2's
 * URL safety check, which is the bug we were hitting.
 *
 * THE ACTUAL BUG. Tauri's `convertFileSrc` builds the media URL with
 * `encodeURIComponent(filePath)`. That leaves several characters UNescaped that
 * Chromium's media URL safety check (`html_media_element.cc`) then REJECTS,
 * producing "MEDIA_ELEMENT_ERROR: Media load rejected by URL safety check":
 *   - `\` backslashes from Windows paths  -> we normalize them to `/` first
 *   - `(` `)` `'` `!` `*`                  -> `encodeURIComponent` does NOT
 *     escape these, but they trip the safety check, so we escape them ourselves
 *
 * Real-world example that was failing:
 *   C:\Users\...\Justin Gaethje vs Ilia Topuria (Suga's Reaction).mp4
 * `convertFileSrc` produced `...localhost/C%3A%2F...(Suga%E2%80%99s%20Reaction).mp4`
 * — note the literal `(` `)`. Those parens are why it was still rejected even
 * after the backslash fix.
 *
 * The Rust handler decodes with a standard percent decoder, so escaping more is
 * always safe — the path round-trips back to the original either way.
 *
 * @param path - Absolute local file path.
 * @returns A `clipy-media` URL the webview can load.
 */
export function mediaSrc(path: string): string {
  // 1) backslashes -> forward slashes (so they encode to %2F, not %5C)
  const normalized = path.replace(/\\/g, "/");
  // 2) let Tauri build the correct per-platform host form, then
  // 3) escape the residual characters encodeURIComponent leaves behind.
  return convertFileSrc(normalized, "clipy-media").replace(
    /[()'!*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}
