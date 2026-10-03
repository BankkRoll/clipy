import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

let log: ReturnType<typeof vi.spyOn>;
let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
let group: ReturnType<typeof vi.spyOn>;
let groupEnd: ReturnType<typeof vi.spyOn>;
let time: ReturnType<typeof vi.spyOn>;
let timeEnd: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  group = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
  groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
  time = vi.spyOn(console, "time").mockImplementation(() => {});
  timeEnd = vi.spyOn(console, "timeEnd").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("info, warn and error always log", () => {
    logger.info("hello", 1);
    logger.warn("Mod", "careful", 2);
    logger.error("Mod", "broken", 3);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("hello"),
      expect.any(String),
      expect.any(String),
      1
    );
    expect(warn).toHaveBeenCalledWith("[Mod] careful", 2);
    expect(error).toHaveBeenCalledWith("[Mod] broken", 3);
  });

  it("debug-level output is silent until debug mode is enabled", () => {
    logger.debug("Mod", "hidden");
    logger.debugGroup("Mod", "group", { a: 1 });
    logger.time("t");
    logger.timeEnd("t");
    expect(log).not.toHaveBeenCalled();
    expect(group).not.toHaveBeenCalled();
    expect(time).not.toHaveBeenCalled();
    expect(timeEnd).not.toHaveBeenCalled();
  });

  it("emits debug-level output when debug mode is enabled", () => {
    logger.setDebugMode(true);
    expect(logger.isDebugMode()).toBe(true);
    logger.debug("Mod", "visible", { x: 1 });
    logger.debugGroup("Mod", "group", { a: 1, b: 2 });
    logger.time("t");
    logger.timeEnd("t");
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[Mod]"),
      expect.any(String),
      expect.any(String),
      { x: 1 }
    );
    expect(group).toHaveBeenCalledWith("[Mod] group");
    expect(log).toHaveBeenCalledWith("  a:", 1);
    expect(log).toHaveBeenCalledWith("  b:", 2);
    expect(groupEnd).toHaveBeenCalled();
    expect(time).toHaveBeenCalledWith("[Perf] t");
    expect(timeEnd).toHaveBeenCalledWith("[Perf] t");
  });

  it("banner reports the version and debug state", () => {
    logger.banner("1.2.3");
    const lines = log.mock.calls.map((c: unknown[]) => String(c[0]) + String(c[1] ?? ""));
    expect(lines.some((l: string) => l.includes("1.2.3"))).toBe(true);
    expect(lines.some((l: string) => l.includes("OFF"))).toBe(true);
    expect(lines.some((l: string) => l.includes("verbose logging active"))).toBe(false);

    log.mockClear();
    logger.setDebugMode(true);
    logger.banner("1.2.3");
    const debugLines = log.mock.calls.map((c: unknown[]) => String(c[0]) + String(c[1] ?? ""));
    expect(debugLines.some((l: string) => l.includes("ON"))).toBe(true);
    expect(debugLines.some((l: string) => l.includes("verbose logging active"))).toBe(true);
  });
});
