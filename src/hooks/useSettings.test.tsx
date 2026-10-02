import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSettings, useTheme, applyBackendSettings } from "@/hooks/useSettings";
import { useThemeStore } from "@/stores/settingsStore";
import { logger } from "@/lib/logger";
import { mockBackend } from "@/test/tauri";
import { settingsFixture } from "@/test/fixtures";

describe("applyBackendSettings", () => {
  it("pushes debug mode to the logger and the theme to the theme cache", () => {
    applyBackendSettings(
      settingsFixture({ advanced: { debugMode: true }, appearance: { theme: "dark" } })
    );
    expect(logger.isDebugMode()).toBe(true);
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("does not rewrite an unchanged theme and tolerates missing sections", () => {
    const setTheme = vi.spyOn(useThemeStore.getState(), "setTheme");
    applyBackendSettings(settingsFixture({ appearance: { theme: "system" } }));
    applyBackendSettings({} as never);
    expect(setTheme).not.toHaveBeenCalled();
    expect(logger.isDebugMode()).toBe(false);
  });
});

describe("useSettings", () => {
  it("loads settings once on mount and applies side effects", async () => {
    const backend = mockBackend({
      get_settings: () => settingsFixture({ advanced: { debugMode: true } }),
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(backend.callsTo("get_settings")).toHaveLength(1);
    expect(result.current.settings?.download.defaultQuality).toBe("1080");
    expect(result.current.error).toBeNull();
    expect(logger.isDebugMode()).toBe(true);
  });

  it("records a load error", async () => {
    mockBackend({
      get_settings: () => {
        throw "corrupt config";
      },
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("corrupt config");
    expect(result.current.settings).toBeNull();
  });

  it("falls back to a generic load error", async () => {
    mockBackend({
      get_settings: () => {
        throw "";
      },
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.error).toBe("Failed to load settings"));
  });

  it("updateSettings sends the whole object and adopts it", async () => {
    const backend = mockBackend({ get_settings: () => settingsFixture() });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const next = settingsFixture({ appearance: { theme: "light" } });
    await act(() => result.current.updateSettings(next));
    expect(backend.callsTo("update_settings")[0]?.args).toEqual({ settings: next });
    expect(result.current.settings).toBe(next);
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("updateSetting writes one key then reloads", async () => {
    const backend = mockBackend({ get_settings: () => settingsFixture() });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.updateSetting("download.defaultQuality", "720"));
    expect(backend.callsTo("update_setting")[0]?.args).toEqual({
      key: "download.defaultQuality",
      value: "720",
    });
    expect(backend.callsTo("get_settings")).toHaveLength(2);
  });

  it("updateSetting rejects without reloading when the backend fails", async () => {
    const backend = mockBackend({
      get_settings: () => settingsFixture(),
      update_setting: () => {
        throw "invalid key";
      },
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.updateSetting("x", 1)).rejects.toBe("invalid key");
    expect(backend.callsTo("get_settings")).toHaveLength(1);
  });

  it("getSetting, exportSettings and importSettings call their commands", async () => {
    const backend = mockBackend({
      get_settings: () => settingsFixture(),
      get_setting: () => "val",
      export_settings: () => "{}",
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.getSetting("x.y")).resolves.toBe("val");
    await expect(result.current.exportSettings()).resolves.toBe("{}");
    await act(() => result.current.importSettings('{"a":1}'));
    expect(backend.callsTo("get_setting")[0]?.args).toEqual({ key: "x.y" });
    expect(backend.callsTo("import_settings")[0]?.args).toEqual({ json: '{"a":1}' });
    expect(backend.callsTo("get_settings")).toHaveLength(2);
  });

  it("resetSettings adopts the defaults the backend returns", async () => {
    const defaults = settingsFixture({ appearance: { theme: "light" } });
    mockBackend({
      get_settings: () => settingsFixture({ appearance: { theme: "dark" } }),
      reset_settings: () => defaults,
    });
    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let returned: unknown;
    await act(async () => {
      returned = await result.current.resetSettings();
    });
    expect(returned).toEqual(defaults);
    expect(result.current.settings).toEqual(defaults);
    expect(useThemeStore.getState().theme).toBe("light");
  });
});

describe("useTheme", () => {
  it("reads the cached theme without loading settings", () => {
    const backend = mockBackend();
    useThemeStore.setState({ theme: "dark" });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
    expect(backend.callsTo("get_settings")).toHaveLength(0);
  });

  it("setTheme applies immediately and persists to the backend", async () => {
    const backend = mockBackend();
    const { result } = renderHook(() => useTheme());
    await act(() => result.current.setTheme("light"));
    expect(result.current.theme).toBe("light");
    expect(backend.callsTo("update_setting")[0]?.args).toEqual({
      key: "appearance.theme",
      value: "light",
    });
  });

  it("setTheme restores the previous theme when the backend rejects", async () => {
    mockBackend({
      update_setting: () => {
        throw "read-only";
      },
    });
    useThemeStore.setState({ theme: "dark" });
    const { result } = renderHook(() => useTheme());
    await expect(act(() => result.current.setTheme("light"))).rejects.toBe("read-only");
    expect(result.current.theme).toBe("dark");
  });
});
