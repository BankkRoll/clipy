import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore, useThemeStore } from "@/stores/settingsStore";

// Snapshot the pristine default settings so we can restore between tests.
const DEFAULTS = JSON.parse(JSON.stringify(useSettingsStore.getState().settings));

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({ settings: JSON.parse(JSON.stringify(DEFAULTS)), isLoading: false });
  useThemeStore.setState({ theme: "system" });
});

describe("useThemeStore", () => {
  it("defaults to system theme", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("setTheme updates the theme", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });
});

describe("settings defaults", () => {
  it("has all five sections", () => {
    const s = useSettingsStore.getState().settings;
    expect(Object.keys(s).sort()).toEqual([
      "advanced",
      "appearance",
      "download",
      "editor",
      "general",
    ]);
  });

  it("has sane default values", () => {
    const s = useSettingsStore.getState().settings;
    expect(s.general.language).toBe("en");
    expect(s.download.defaultQuality).toBe("1080");
    expect(s.download.maxConcurrentDownloads).toBe(3);
    expect(s.editor.defaultProjectSettings).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(s.appearance.theme).toBe("system");
    expect(s.advanced.maxCacheSize).toBe(500);
  });
});

describe("updateGeneralSettings", () => {
  it("merges partial general settings without touching others", () => {
    useSettingsStore.getState().updateGeneralSettings({ launchOnStartup: true });
    const s = useSettingsStore.getState().settings;
    expect(s.general.launchOnStartup).toBe(true);
    expect(s.general.language).toBe("en");
    expect(s.download.defaultQuality).toBe("1080");
  });
});

describe("updateDownloadSettings", () => {
  it("merges partial download settings", () => {
    useSettingsStore.getState().updateDownloadSettings({ defaultQuality: "720", crfQuality: 18 });
    const d = useSettingsStore.getState().settings.download;
    expect(d.defaultQuality).toBe("720");
    expect(d.crfQuality).toBe(18);
    expect(d.defaultFormat).toBe("mp4");
  });
});

describe("updateEditorSettings", () => {
  it("merges partial editor settings", () => {
    useSettingsStore.getState().updateEditorSettings({ autoSave: false, autoSaveInterval: 120 });
    const e = useSettingsStore.getState().settings.editor;
    expect(e.autoSave).toBe(false);
    expect(e.autoSaveInterval).toBe(120);
    expect(e.showWaveforms).toBe(true);
  });
});

describe("updateAppearanceSettings", () => {
  it("merges partial appearance settings", () => {
    useSettingsStore.getState().updateAppearanceSettings({ accentColor: "#ff0000", fontSize: "large" });
    const a = useSettingsStore.getState().settings.appearance;
    expect(a.accentColor).toBe("#ff0000");
    expect(a.fontSize).toBe("large");
    expect(a.theme).toBe("system");
  });
});

describe("updateAdvancedSettings", () => {
  it("merges partial advanced settings", () => {
    useSettingsStore.getState().updateAdvancedSettings({ debugMode: true, proxyUrl: "http://p" });
    const adv = useSettingsStore.getState().settings.advanced;
    expect(adv.debugMode).toBe(true);
    expect(adv.proxyUrl).toBe("http://p");
    expect(adv.hardwareAcceleration).toBe(true);
  });
});

describe("resetSettings", () => {
  it("restores defaults after modifications", () => {
    useSettingsStore.getState().updateGeneralSettings({ launchOnStartup: true });
    useSettingsStore.getState().updateAdvancedSettings({ debugMode: true });
    useSettingsStore.getState().resetSettings();
    const s = useSettingsStore.getState().settings;
    expect(s.general.launchOnStartup).toBe(false);
    expect(s.advanced.debugMode).toBe(false);
  });
});

describe("immutability", () => {
  it("creates a new settings object on update (does not mutate in place)", () => {
    const before = useSettingsStore.getState().settings;
    useSettingsStore.getState().updateGeneralSettings({ closeToTray: false });
    const after = useSettingsStore.getState().settings;
    expect(after).not.toBe(before);
    expect(after.general).not.toBe(before.general);
  });
});
