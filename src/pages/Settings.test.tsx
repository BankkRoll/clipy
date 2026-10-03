import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { Settings } from "@/pages/Settings";
import { useThemeStore } from "@/stores/settingsStore";
import { resetUpdaterStore, useUpdaterStore } from "@/stores/updaterStore";
import { mockBackend, type IpcHandler } from "@/test/tauri";
import { renderWithRouter } from "@/test/render";
import { binaryStatusFixture, cacheStatsFixture, settingsFixture } from "@/test/fixtures";
import { REPOSITORY_URL } from "@/components/settings";
import type { AppSettings } from "@/hooks/useSettings";

type Overrides = Parameters<typeof settingsFixture>[0];

function setPath(target: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  const last = parts.pop()!;
  const parent = parts.reduce((obj, part) => obj[part] as Record<string, unknown>, target);
  parent[last] = value;
}

function setup(handlers: Record<string, IpcHandler> = {}, overrides: Overrides = {}) {
  let settings: AppSettings = settingsFixture(overrides);
  const backend = mockBackend({
    get_settings: () => JSON.parse(JSON.stringify(settings)),
    update_setting: ({ key, value }) => {
      setPath(settings as unknown as Record<string, unknown>, key as string, value);
      return null;
    },
    reset_settings: () => {
      settings = settingsFixture();
      return settings;
    },
    check_binaries: () => binaryStatusFixture(),
    get_cache_stats: () => cacheStatsFixture(),
    "plugin:app|version": () => "2.1.0",
    "plugin:dialog|ask": () => true,
    ...handlers,
  });
  const view = renderWithRouter(<Settings />, { route: "/settings" });
  return { backend, ...view };
}

type User = ReturnType<typeof setup>["user"];

async function openTab(user: User, name: string) {
  await screen.findByRole("tab", { name });
  await user.click(screen.getByRole("tab", { name }));
}

const item = (label: string) => within(screen.getByRole("group", { name: label }));

function settingWrites(backend: ReturnType<typeof setup>["backend"]) {
  return backend.callsTo("update_setting").map((c) => c.args);
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
  vi.unstubAllGlobals();
  resetUpdaterStore();
});

describe("Settings page shell", () => {
  it("loads settings exactly once and shows the runtime version", async () => {
    const { backend } = setup();
    expect(screen.getByText("Loading settings...")).toBeInTheDocument();
    await screen.findByRole("tab", { name: "General" });
    expect(await screen.findByText("v2.1.0")).toBeInTheDocument();
    expect(backend.callsTo("get_settings")).toHaveLength(1);
  });

  it("shows a load error and retries", async () => {
    let fail = true;
    const { user } = setup({
      get_settings: () => {
        if (fail) throw "config unreadable";
        return settingsFixture();
      },
    });
    expect(await screen.findByText("Failed to load settings")).toBeInTheDocument();
    expect(screen.getByText("config unreadable")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try Again" }));
    expect(await screen.findByRole("tab", { name: "General" })).toBeInTheDocument();
  });

  it("reloads settings from the header", async () => {
    const { user, backend } = setup();
    await screen.findByRole("tab", { name: "General" });
    await user.click(screen.getByRole("button", { name: "Reload settings" }));
    await waitFor(() => expect(backend.callsTo("get_settings")).toHaveLength(2));
  });

  it("toasts instead of throwing when a setting fails to save", async () => {
    const { user } = setup({
      update_setting: () => {
        throw "permission denied";
      },
    });
    await screen.findByRole("tab", { name: "General" });
    await user.click(item("Launch on startup").getByRole("switch"));
    expect(await screen.findByText("Failed to save setting")).toBeInTheDocument();
  });
});

describe("switches write their key", () => {
  it.each([
    ["General", "Launch on startup", "general.launchOnStartup", true],
    ["General", "Start minimized", "general.minimizeToTray", true],
    ["General", "Close to tray", "general.closeToTray", true],
    ["General", "Auto-check for updates", "general.checkForUpdates", false],
    ["General", "Auto-update binaries", "general.autoUpdateBinaries", false],
    ["Downloads", "Organize by channel", "download.createChannelSubfolder", true],
    ["Downloads", "Include date in filename", "download.includeDateInFilename", true],
    ["Downloads", "Embed thumbnail", "download.embedThumbnail", false],
    ["Downloads", "Embed metadata", "download.embedMetadata", false],
    ["Downloads", "Embed chapters", "download.downloadChapters", true],
    ["Downloads", "Auto-retry failed downloads", "download.autoRetry", false],
    ["Downloads", "Write info JSON", "download.writeInfoJson", true],
    ["Downloads", "Write description", "download.writeDescription", true],
    ["Downloads", "Write thumbnail", "download.writeThumbnail", true],
    ["Downloads", "Restrict filenames", "download.restrictFilenames", true],
    ["Downloads", "Download archive", "download.useDownloadArchive", true],
    ["Subtitles", "Download subtitles", "download.downloadSubtitles", true],
    ["SponsorBlock", "Enable SponsorBlock", "download.sponsorBlock", true],
    ["SponsorBlock", "Split by chapters", "download.splitByChapters", true],
    ["Network", "Geo-bypass", "download.geoBypass", true],
    ["Advanced", "Hardware acceleration", "advanced.hardwareAcceleration", false],
    ["Advanced", "Debug mode", "advanced.debugMode", true],
  ] as const)("%s › %s → %s", async (tab, label, key, value) => {
    const { user, backend } = setup();
    await openTab(user, tab);
    await user.click(item(label).getByRole("switch"));
    await waitFor(() => expect(settingWrites(backend)).toEqual([{ key, value }]));
  });

  it("shows subtitle options once subtitles are enabled", async () => {
    const { user, backend } = setup({}, { download: { downloadSubtitles: true } });
    await openTab(user, "Subtitles");
    await user.click(item("Embed in video file").getByRole("switch"));
    await user.click(item("Include auto-generated").getByRole("switch"));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.embedSubtitles", value: true },
        { key: "download.autoSubtitles", value: true },
      ])
    );
  });
});

describe("selects write their key", () => {
  it.each([
    ["Downloads", "Simultaneous downloads", /^4 downloads/, "download.maxConcurrentDownloads", 4],
    ["Downloads", "Max retry attempts", /^5 attempts/, "download.retryAttempts", 5],
    ["Quality", "Preferred resolution", /^720p/, "download.defaultQuality", "720"],
    ["Quality", "Container format", /^WebM/, "download.defaultFormat", "webm"],
    ["Quality", "Video codec", /^AV1/, "download.videoCodec", "av1"],
    ["Quality", "Encoding preset", /^Slow(?!er)/, "download.encodingPreset", "slow"],
    ["Quality", "Audio format", /^Opus/, "download.audioFormat", "opus"],
    ["Quality", "Audio bitrate", /^320 kbps/, "download.audioBitrate", "320"],
    ["Quality", "Audio codec", /^Vorbis/, "download.audioCodec", "vorbis"],
    ["Network", "Concurrent fragments", /^8 fragments/, "download.concurrentFragments", 8],
    ["Network", "Use browser cookies", /^Firefox/, "download.cookiesFromBrowser", "firefox"],
    [
      "Advanced",
      "Acceleration type",
      /^NVIDIA NVENC/,
      "advanced.hardwareAccelerationType",
      "nvenc",
    ],
  ] as const)("%s › %s", async (tab, label, option, key, value) => {
    const { user, backend } = setup();
    await openTab(user, tab);
    await user.click(item(label).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: option }));
    await waitFor(() => expect(settingWrites(backend)).toEqual([{ key, value }]));
  });

  it("subtitle language and format", async () => {
    const { user, backend } = setup({}, { download: { downloadSubtitles: true } });
    await openTab(user, "Subtitles");
    await user.click(item("Preferred language").getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "German" }));
    await user.click(item("Subtitle format").getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /^VTT/ }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.subtitleLanguage", value: "de" },
        { key: "download.subtitleFormat", value: "vtt" },
      ])
    );
  });

  it("choosing no browser stores an empty string", async () => {
    const { user, backend } = setup({}, { download: { cookiesFromBrowser: "chrome" } });
    await openTab(user, "Network");
    await user.click(item("Use browser cookies").getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /^None/ }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([{ key: "download.cookiesFromBrowser", value: "" }])
    );
  });

  it("applies the concurrency limit to the live queue", async () => {
    const { user, backend } = setup();
    await openTab(user, "Downloads");
    await user.click(item("Simultaneous downloads").getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /^2 downloads/ }));
    await waitFor(() =>
      expect(backend.callsTo("set_max_concurrent_downloads")[0]?.args).toEqual({ max: 2 })
    );
  });

  it("logs but does not toast when the live concurrency update fails", async () => {
    const { user, backend } = setup({
      set_max_concurrent_downloads: () => {
        throw "queue busy";
      },
    });
    await openTab(user, "Downloads");
    await user.click(item("Simultaneous downloads").getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /^1 download/ }));
    await waitFor(() => expect(backend.callsTo("set_max_concurrent_downloads")).toHaveLength(1));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(screen.queryByText("Failed to save setting")).toBeNull();
  });

  it("hides dependent controls when their toggle is off", async () => {
    const { user } = setup(
      {},
      { download: { autoRetry: false }, advanced: { hardwareAcceleration: false } }
    );
    await openTab(user, "Downloads");
    expect(screen.queryByRole("group", { name: "Max retry attempts" })).toBeNull();
    await openTab(user, "Advanced");
    expect(screen.queryByRole("group", { name: "Acceleration type" })).toBeNull();
  });
});

describe("text inputs commit once per edit", () => {
  it.each([
    ["Downloads", "Download folder", "D:\\Media", "download.downloadPath", "D:\\Media"],
    ["Downloads", "Playlist items", "1,3,5-7", "download.playlistItems", "1,3,5-7"],
    ["Network", "Rate limit", " 2M ", "download.rateLimit", "2M"],
    ["Network", "Proxy URL", "socks5://h:1", "advanced.proxyUrl", "socks5://h:1"],
  ] as const)("%s › %s commits on blur", async (tab, label, text, key, value) => {
    const { user, backend } = setup();
    await openTab(user, tab);
    const input = screen.getByRole("textbox", { name: label });
    await user.clear(input);
    await user.type(input, text);
    expect(settingWrites(backend)).toEqual([]);
    await user.tab();
    await waitFor(() => expect(settingWrites(backend)).toEqual([{ key, value }]));
  });

  it("commits on Enter, ignores unchanged blur and reverts on Escape", async () => {
    const { user, backend } = setup();
    await openTab(user, "Downloads");
    const input = screen.getByRole("textbox", { name: "Filename template" });
    await user.click(input);
    await user.tab();
    expect(settingWrites(backend)).toEqual([]);

    await user.type(input, "x{Escape}");
    expect(input).toHaveValue("%(title)s.%(ext)s");

    await user.clear(input);
    await user.type(input, "%(id)s.%(ext)s{Enter}");
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.filenameTemplate", value: "%(id)s.%(ext)s" },
      ])
    );
  });

  it("parses playlist indices as non-negative integers", async () => {
    const { user, backend } = setup();
    await openTab(user, "Downloads");
    const start = screen.getByRole("spinbutton", { name: "Playlist start index" });
    await user.clear(start);
    await user.type(start, "5{Enter}");
    const end = screen.getByRole("spinbutton", { name: "Playlist end index" });
    await user.clear(end);
    await user.type(end, "-3{Enter}");
    await user.clear(start);
    await user.type(start, "{Enter}");
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.playlistStart", value: 5 },
        { key: "download.playlistEnd", value: 0 },
        { key: "download.playlistStart", value: 0 },
      ])
    );
  });

  it("filename placeholders insert before the extension", async () => {
    const { user, backend } = setup();
    await openTab(user, "Downloads");
    await user.click(screen.getByRole("button", { name: "Uploader" }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.filenameTemplate", value: "%(title)s - %(uploader)s.%(ext)s" },
      ])
    );
    await user.click(screen.getByRole("button", { name: "Title" }));
    await waitFor(() => expect(settingWrites(backend)).toHaveLength(2));
    expect(settingWrites(backend)[1]).toEqual({
      key: "download.filenameTemplate",
      value: "%(title)s - %(uploader)s.%(ext)s",
    });
  });

  it("the CRF slider writes once per committed change", async () => {
    const { user, backend } = setup();
    await openTab(user, "Quality");
    const slider = screen.getByRole("slider");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([{ key: "download.crfQuality", value: 24 }])
    );
    expect(item("CRF Quality").getByText("24")).toBeInTheDocument();
  });
});

describe("SponsorBlock categories", () => {
  it("toggles categories in the stored list", async () => {
    const { user, backend } = setup({}, { download: { sponsorBlock: true } });
    await openTab(user, "SponsorBlock");
    await user.click(screen.getByRole("button", { name: /^Intro/ }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.sponsorBlockCategories", value: ["sponsor", "intro"] },
      ])
    );
    await user.click(screen.getByRole("button", { name: /^Sponsor/ }));
    await waitFor(() =>
      expect(settingWrites(backend)[1]).toEqual({
        key: "download.sponsorBlockCategories",
        value: ["intro"],
      })
    );
  });

  it("explains chapter splitting in a tooltip", async () => {
    const { user } = setup();
    await openTab(user, "SponsorBlock");
    await user.hover(screen.getByRole("button", { name: "About Split by chapters" }));
    expect(
      (await screen.findAllByText("Each chapter becomes its own file with the chapter title"))
        .length
    ).toBeGreaterThan(0);
  });
});

describe("theme", () => {
  it("writes appearance.theme and the theme cache", async () => {
    const { user, backend } = setup();
    await openTab(user, "General");
    await user.click(screen.getByRole("button", { name: "dark" }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([{ key: "appearance.theme", value: "dark" }])
    );
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(screen.getByRole("button", { name: "dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reverts and toasts when the backend rejects the theme", async () => {
    const { user } = setup({
      update_setting: () => {
        throw "read-only";
      },
    });
    await openTab(user, "General");
    await user.click(screen.getByRole("button", { name: "light" }));
    expect(await screen.findByText("Failed to save theme")).toBeInTheDocument();
    expect(useThemeStore.getState().theme).toBe("system");
  });
});

describe("download folder picker", () => {
  it("stores the picked folder", async () => {
    const { user, backend } = setup({ "plugin:dialog|open": () => "D:\\Picked" });
    await openTab(user, "Downloads");
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() =>
      expect(settingWrites(backend)).toEqual([
        { key: "download.downloadPath", value: "D:\\Picked" },
      ])
    );
    expect(await screen.findByText("Download location updated")).toBeInTheDocument();
    const args = backend.callsTo("plugin:dialog|open")[0]?.args as {
      options: { directory: boolean };
    };
    expect(args.options.directory).toBe(true);
  });

  it("does nothing when cancelled and toasts on failure", async () => {
    let result: () => unknown = () => null;
    const { user, backend } = setup({ "plugin:dialog|open": () => result() });
    await openTab(user, "Downloads");
    await user.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|open")).toHaveLength(1));
    expect(settingWrites(backend)).toEqual([]);

    result = () => {
      throw "no window";
    };
    await user.click(screen.getByRole("button", { name: "Browse" }));
    expect(await screen.findByText("Failed to update download location")).toBeInTheDocument();
  });
});

describe("maintenance actions", () => {
  it("clears the cache after confirmation", async () => {
    let confirm = false;
    const { user, backend } = setup({ "plugin:dialog|ask": () => confirm });
    await openTab(user, "Advanced");
    expect(item("Cache").getByText("2 KB used")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear Cache" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(backend.callsTo("clear_cache")).toHaveLength(0);

    confirm = true;
    await user.click(screen.getByRole("button", { name: "Clear Cache" }));
    expect(await screen.findByText("Cache cleared successfully")).toBeInTheDocument();
    expect(backend.callsTo("clear_cache")).toHaveLength(1);
  });

  it("toasts when clearing the cache fails and refreshes cache size on demand", async () => {
    const { user, backend } = setup({
      clear_cache: () => {
        throw "busy";
      },
    });
    await openTab(user, "Advanced");
    await user.click(screen.getByRole("button", { name: "Clear Cache" }));
    expect(await screen.findByText("Failed to clear cache")).toBeInTheDocument();
    const before = backend.callsTo("get_cache_stats").length;
    await user.click(screen.getByRole("button", { name: "Refresh cache size" }));
    await waitFor(() => expect(backend.callsTo("get_cache_stats").length).toBe(before + 1));
  });

  it("resets settings after confirmation", async () => {
    let confirm = false;
    const { user, backend } = setup({ "plugin:dialog|ask": () => confirm });
    await screen.findByRole("tab", { name: "General" });
    await user.click(screen.getByRole("button", { name: "Reset All" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));
    expect(backend.callsTo("reset_settings")).toHaveLength(0);

    confirm = true;
    await user.click(screen.getByRole("button", { name: "Reset All" }));
    expect(await screen.findByText("Settings reset to defaults")).toBeInTheDocument();
  });

  it("toasts when reset fails", async () => {
    const { user } = setup({
      reset_settings: () => {
        throw "locked";
      },
    });
    await screen.findByRole("tab", { name: "General" });
    await user.click(screen.getByRole("button", { name: "Reset All" }));
    expect(await screen.findByText("Failed to reset settings")).toBeInTheDocument();
  });

  it("describes the factory reset accurately", async () => {
    const { user } = setup();
    await openTab(user, "Advanced");
    expect(screen.getByText(/Your library and downloaded files are kept/)).toBeInTheDocument();
    expect(screen.queryByText(/library data/)).toBeNull();
  });

  it("factory reset needs two confirmations, then resets, clears and reloads", async () => {
    const answers: boolean[] = [];
    const { user, backend } = setup({ "plugin:dialog|ask": () => answers.shift() ?? false });
    await openTab(user, "Advanced");
    localStorage.setItem("clipy-ui-storage", "{}");

    answers.push(false);
    await user.click(screen.getByRole("button", { name: "Reset Everything" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(1));

    answers.push(true, false);
    await user.click(screen.getByRole("button", { name: "Reset Everything" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|ask")).toHaveLength(3));
    expect(backend.callsTo("reset_settings")).toHaveLength(0);

    const firstAsk = backend.callsTo("plugin:dialog|ask")[0]?.args.message as string;
    expect(firstAsk).toMatch(/library and downloaded files are not affected/);

    const realSetTimeout = window.setTimeout;
    let reload: (() => void) | undefined;
    const timeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      if (ms === 1500) {
        reload = fn;
        return 0;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);

    answers.push(true, true);
    await user.click(screen.getByRole("button", { name: "Reset Everything" }));
    expect(await screen.findByText("Factory reset complete. Restarting...")).toBeInTheDocument();
    expect(backend.callsTo("reset_settings")).toHaveLength(1);
    expect(backend.callsTo("clear_cache")).toHaveLength(1);
    expect(localStorage.getItem("clipy-ui-storage")).toBeNull();
    expect(reload).toBeDefined();
    timeoutSpy.mockRestore();
    // jsdom cannot navigate; calling the scheduled reload only reports that.
    reload?.();
  });

  it("factory reset toasts on failure", async () => {
    const { user } = setup({
      clear_cache: () => {
        throw "busy";
      },
    });
    await openTab(user, "Advanced");
    await user.click(screen.getByRole("button", { name: "Reset Everything" }));
    expect(await screen.findByText("Failed to complete factory reset")).toBeInTheDocument();
  });
});

describe("required components", () => {
  it("installs missing tools and updates yt-dlp", async () => {
    let status = binaryStatusFixture({ ffmpegInstalled: false, ytdlpInstalled: false });
    const { user, backend } = setup({
      check_binaries: () => status,
      install_ffmpeg: () => {
        status = { ...status, ffmpegInstalled: true };
        return null;
      },
      install_ytdlp: () => {
        status = { ...status, ytdlpInstalled: true };
        return null;
      },
    });
    await openTab(user, "Advanced");
    const ffmpeg = within(await screen.findByRole("group", { name: "FFmpeg" }));
    await user.click(await ffmpeg.findByRole("button", { name: /Install/ }));
    expect(await screen.findByText("FFmpeg installed successfully")).toBeInTheDocument();

    const ytdlp = within(screen.getByRole("group", { name: "yt-dlp" }));
    await user.click(ytdlp.getByRole("button", { name: /Install/ }));
    expect(await screen.findByText("yt-dlp installed successfully")).toBeInTheDocument();

    await user.click(await ytdlp.findByRole("button", { name: /Update/ }));
    expect(await screen.findByText("yt-dlp updated successfully")).toBeInTheDocument();
    expect(backend.callsTo("update_ytdlp")).toHaveLength(1);
  });

  it.each([
    ["FFmpeg", "Install", "install_ffmpeg", "Failed to install FFmpeg"],
    ["yt-dlp", "Install", "install_ytdlp", "Failed to install yt-dlp"],
  ])("%s %s failure is reported", async (name, button, command, message) => {
    const { user } = setup({
      check_binaries: () => binaryStatusFixture({ ffmpegInstalled: false, ytdlpInstalled: false }),
      [command]: () => {
        throw "network down";
      },
    });
    await openTab(user, "Advanced");
    const card = within(await screen.findByRole("group", { name }));
    await user.click(await card.findByRole("button", { name: new RegExp(button) }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("reports a failed yt-dlp update and refreshes status on demand", async () => {
    const { user, backend } = setup({
      update_ytdlp: () => {
        throw "rate limited";
      },
    });
    await openTab(user, "Advanced");
    const ytdlp = within(screen.getByRole("group", { name: "yt-dlp" }));
    await user.click(await ytdlp.findByRole("button", { name: /Update/ }));
    expect(await screen.findByText("Failed to update yt-dlp")).toBeInTheDocument();
    const before = backend.callsTo("check_binaries").length;
    await user.click(screen.getByRole("button", { name: "Refresh component status" }));
    await waitFor(() => expect(backend.callsTo("check_binaries").length).toBe(before + 1));
  });
});

describe("about and updates", () => {
  const UPDATE = {
    rid: 1,
    currentVersion: "2.1.0",
    version: "2.2.0",
    body: "## Highlights\n- Faster exports",
    rawJson: {},
  };

  async function check(user: User) {
    await openTab(user, "About");
    await screen.findByText("Version 2.1.0");
    await user.click(screen.getByRole("button", { name: "Check for Updates" }));
  }

  it("hands a found update to the app-wide update dialog without toasting", async () => {
    const { user, backend } = setup({ "plugin:updater|check": () => UPDATE });
    await check(user);
    await waitFor(() => expect(useUpdaterStore.getState().status).toBe("available"));
    expect(useUpdaterStore.getState()).toMatchObject({ open: true, newVersion: "2.2.0" });
    expect(backend.callsTo("plugin:updater|check")).toHaveLength(1);
    expect(screen.queryByText("You're up to date!")).toBeNull();
  });

  it("reports up to date when the updater finds nothing", async () => {
    const { user } = setup({ "plugin:updater|check": () => null });
    await check(user);
    expect(await screen.findByText("You're up to date!")).toBeInTheDocument();
  });

  it("reports a failed check and re-enables the button", async () => {
    const { user } = setup({
      "plugin:updater|check": () => {
        throw "offline";
      },
    });
    await check(user);
    expect(await screen.findByText("Failed to check for updates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for Updates" })).toBeEnabled();
  });

  it("opens project and acknowledgement links through the shell", async () => {
    const { user, backend } = setup();
    await openTab(user, "About");
    await user.click(screen.getByRole("button", { name: "View on GitHub" }));
    await user.click(screen.getByRole("button", { name: /^React — UI library/ }));
    await waitFor(() => expect(backend.callsTo("plugin:shell|open")).toHaveLength(2));
    expect(backend.callsTo("plugin:shell|open").map((c) => c.args.path)).toEqual([
      REPOSITORY_URL,
      "https://react.dev",
    ]);
    expect(screen.queryByText(/hls\.js/)).toBeNull();
  });

  it("logs when a link cannot be opened", async () => {
    const { user } = setup({
      "plugin:shell|open": () => {
        throw "denied";
      },
    });
    await openTab(user, "About");
    await user.click(screen.getByRole("button", { name: "View on GitHub" }));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });

  it("uses the dark logo when the backend theme is dark", async () => {
    const { user } = setup({}, { appearance: { theme: "dark" } });
    await openTab(user, "About");
    expect(screen.getByRole("img", { name: "Clipy" })).toHaveAttribute("src", "/logo-dark.png");
  });

  it("follows the system color scheme while on the system theme", async () => {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    const { user } = setup();
    await openTab(user, "About");
    expect(screen.getByRole("img", { name: "Clipy" })).toHaveAttribute("src", "/logo-light.png");
    const { act } = await import("@testing-library/react");
    act(() => listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent)));
    expect(screen.getByRole("img", { name: "Clipy" })).toHaveAttribute("src", "/logo-dark.png");
  });
});
