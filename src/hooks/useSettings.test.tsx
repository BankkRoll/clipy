import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import { useSettings, useTheme, useDownloadSettings } from "@/hooks/useSettings";

const FAKE_SETTINGS = {
  general: {},
  download: { downloadPath: "/d", defaultQuality: "1080" },
  editor: {},
  appearance: { theme: "dark", accentColor: "#abc", fontSize: "large", reducedMotion: true },
  advanced: {},
};

beforeEach(() => {
  invoke.mockReset();
  invoke.mockResolvedValue(FAKE_SETTINGS);
});

describe("useSettings", () => {
  it("loads settings on mount via get_settings", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(invoke).toHaveBeenCalledWith("get_settings");
    expect(result.current.settings).toEqual(FAKE_SETTINGS);
    expect(result.current.error).toBeNull();
  });

  it("sets error when get_settings rejects", async () => {
    invoke.mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("boom");
    expect(result.current.settings).toBeNull();
  });

  it("updateSettings invokes update_settings with the settings arg and sets state", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const next = { ...FAKE_SETTINGS, general: { language: "fr" } } as never;
    invoke.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.updateSettings(next);
    });
    expect(invoke).toHaveBeenCalledWith("update_settings", { settings: next });
    expect(result.current.settings).toBe(next);
  });

  it("updateSetting invokes update_setting then refreshes", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue(FAKE_SETTINGS);
    await act(async () => {
      await result.current.updateSetting("download.defaultQuality", "720");
    });
    expect(invoke).toHaveBeenCalledWith("update_setting", {
      key: "download.defaultQuality",
      value: "720",
    });
    expect(invoke).toHaveBeenCalledWith("get_settings");
  });

  it("getSetting invokes get_setting with key", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValueOnce("val");
    let out: unknown;
    await act(async () => {
      out = await result.current.getSetting("x.y");
    });
    expect(invoke).toHaveBeenCalledWith("get_setting", { key: "x.y" });
    expect(out).toBe("val");
  });

  it("resetSettings invokes reset_settings and stores the result", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const defaults = { ...FAKE_SETTINGS, advanced: { debugMode: false } } as never;
    invoke.mockResolvedValueOnce(defaults);
    await act(async () => {
      await result.current.resetSettings();
    });
    expect(invoke).toHaveBeenCalledWith("reset_settings");
    expect(result.current.settings).toBe(defaults);
  });

  it("exportSettings invokes export_settings", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockResolvedValueOnce("{}");
    let out: unknown;
    await act(async () => {
      out = await result.current.exportSettings();
    });
    expect(invoke).toHaveBeenCalledWith("export_settings");
    expect(out).toBe("{}");
  });

  it("importSettings invokes import_settings with json then refreshes", async () => {
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    invoke.mockClear();
    invoke.mockResolvedValue(FAKE_SETTINGS);
    await act(async () => {
      await result.current.importSettings('{"a":1}');
    });
    expect(invoke).toHaveBeenCalledWith("import_settings", { json: '{"a":1}' });
    expect(invoke).toHaveBeenCalledWith("get_settings");
  });
});

describe("useTheme", () => {
  it("derives theme values from loaded settings", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    expect(result.current.accentColor).toBe("#abc");
    expect(result.current.fontSize).toBe("large");
    expect(result.current.reducedMotion).toBe(true);
  });

  it("setTheme calls update_setting with appearance.theme", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    invoke.mockResolvedValue(FAKE_SETTINGS);
    await act(async () => {
      await result.current.setTheme("light");
    });
    expect(invoke).toHaveBeenCalledWith("update_setting", {
      key: "appearance.theme",
      value: "light",
    });
  });

  it("setAccentColor / setFontSize / setReducedMotion use correct keys", async () => {
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("dark"));
    invoke.mockResolvedValue(FAKE_SETTINGS);
    await act(async () => {
      await result.current.setAccentColor("#fff");
      await result.current.setFontSize("small");
      await result.current.setReducedMotion(false);
    });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "appearance.accentColor", value: "#fff" });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "appearance.fontSize", value: "small" });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "appearance.reducedMotion", value: false });
  });

  it("applies theme class to document root", async () => {
    renderHook(() => useTheme());
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(document.documentElement.style.getPropertyValue("--accent-color")).toBe("#abc");
    expect(document.documentElement.classList.contains("reduce-motion")).toBe(true);
  });
});

describe("useDownloadSettings", () => {
  it("exposes download section and setters target correct keys", async () => {
    const { result } = renderHook(() => useDownloadSettings());
    await waitFor(() => expect(result.current.settings).toBeTruthy());
    expect(result.current.settings?.defaultQuality).toBe("1080");
    invoke.mockResolvedValue(FAKE_SETTINGS);
    await act(async () => {
      await result.current.setDownloadPath("/x");
      await result.current.setDefaultQuality("480");
      await result.current.setDefaultFormat("mkv");
      await result.current.setMaxConcurrent(5);
    });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "download.downloadPath", value: "/x" });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "download.defaultQuality", value: "480" });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "download.defaultFormat", value: "mkv" });
    expect(invoke).toHaveBeenCalledWith("update_setting", { key: "download.maxConcurrentDownloads", value: 5 });
  });
});
