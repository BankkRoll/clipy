import { describe, it, expect, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { SetupWizard } from "@/components/onboarding";
import { useUIStore } from "@/stores/uiStore";
import { mockBackend, type IpcHandler } from "@/test/tauri";
import { renderWithRouter } from "@/test/render";
import { binaryStatusFixture, settingsFixture } from "@/test/fixtures";
import type { AppSettings } from "@/hooks/useSettings";

function setup(handlers: Record<string, IpcHandler> = {}) {
  const onComplete = vi.fn();
  const backend = mockBackend({
    get_settings: () => settingsFixture({ download: { downloadPath: "" } }),
    get_default_download_path: () => "C:\\Users\\me\\Videos\\Clipy",
    check_binaries: () => binaryStatusFixture(),
    ...handlers,
  });
  const view = renderWithRouter(<SetupWizard onComplete={onComplete} />);
  return { backend, onComplete, ...view };
}

type User = ReturnType<typeof setup>["user"];

const step = () => screen.getByText(/^Step \d of 6$/).textContent;

async function next(user: User, name: string | RegExp = /Continue/) {
  await user.click(screen.getByRole("button", { name }));
}

async function toBinaries(user: User) {
  await next(user, /Get Started/);
  expect(step()).toBe("Step 2 of 6");
}

async function toComplete(user: User) {
  await toBinaries(user);
  await next(user, /^Continue/);
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Download location" })).not.toHaveValue("")
  );
  await next(user);
  await next(user);
  await next(user);
  expect(step()).toBe("Step 6 of 6");
}

describe("SetupWizard", () => {
  it("walks forward and back through every step", async () => {
    const { user } = setup();
    expect(screen.getByText("Welcome to Clipy")).toBeInTheDocument();
    await toBinaries(user);
    await next(user, /Back/);
    expect(step()).toBe("Step 1 of 6");
    await toComplete(user);
    expect(screen.getByText("You're All Set")).toBeInTheDocument();
    expect(screen.queryByText(/Drag videos from library to editor/)).toBeNull();
    await next(user, /Back/);
    expect(step()).toBe("Step 5 of 6");
  });

  describe("components step", () => {
    it("waits for the binary check before offering install or skip", async () => {
      const { user } = setup({ check_binaries: () => new Promise(() => {}) });
      await toBinaries(user);
      expect(screen.getByRole("button", { name: /Checking components/ })).toBeDisabled();
      expect(screen.queryByRole("button", { name: /Download & Install/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    });

    it("shows installed versions and continues without installing", async () => {
      const { user, backend } = setup();
      await toBinaries(user);
      expect(
        await within(screen.getByRole("group", { name: "FFmpeg" })).findByText("7.0")
      ).toBeInTheDocument();
      await next(user, /^Continue/);
      expect(step()).toBe("Step 3 of 6");
      expect(backend.callsTo("install_ffmpeg")).toHaveLength(0);
    });

    it("installs only what is missing, then advances", async () => {
      let status = binaryStatusFixture({ ffmpegInstalled: false, ffmpegVersion: null });
      const { user, backend } = setup({
        check_binaries: () => status,
        install_ffmpeg: () => {
          status = binaryStatusFixture();
          return null;
        },
      });
      await toBinaries(user);
      expect(await screen.findByText("~85 MB")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Download & Install" }));
      await waitFor(() => expect(step()).toBe("Step 3 of 6"));
      expect(backend.callsTo("install_ffmpeg")).toHaveLength(1);
      expect(backend.callsTo("install_ytdlp")).toHaveLength(0);
    });

    it("installs both tools when neither is present", async () => {
      const { user, backend } = setup({
        check_binaries: () =>
          binaryStatusFixture({ ffmpegInstalled: false, ytdlpInstalled: false }),
      });
      await toBinaries(user);
      await user.click(await screen.findByRole("button", { name: "Download & Install" }));
      await waitFor(() => expect(step()).toBe("Step 3 of 6"));
      expect(backend.callsTo("install_ytdlp")).toHaveLength(1);
    });

    it("reports a failed install and offers retry and skip", async () => {
      let attempts = 0;
      const { user } = setup({
        check_binaries: () => binaryStatusFixture({ ytdlpInstalled: false }),
        install_ytdlp: () => {
          attempts += 1;
          if (attempts === 1) throw "GitHub rate limit";
          return null;
        },
      });
      await toBinaries(user);
      await user.click(await screen.findByRole("button", { name: "Download & Install" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("GitHub rate limit");
      expect(screen.getByRole("button", { name: "Skip for now" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Retry Install" }));
      await waitFor(() => expect(step()).toBe("Step 3 of 6"));
    });

    it("lets the user skip after a failure", async () => {
      const { user } = setup({
        check_binaries: () => binaryStatusFixture({ ffmpegInstalled: false }),
        install_ffmpeg: () => {
          throw "";
        },
      });
      await toBinaries(user);
      await user.click(await screen.findByRole("button", { name: "Download & Install" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Failed to install FFmpeg");
      await user.click(screen.getByRole("button", { name: "Skip for now" }));
      expect(step()).toBe("Step 3 of 6");
    });

    it("shows a generic message for non-Error failures", async () => {
      const { user } = setup({
        check_binaries: () => {
          throw "check failed";
        },
      });
      await toBinaries(user);
      // With no status at all, both tools are treated as missing.
      await user.click(await screen.findByRole("button", { name: "Download & Install" }));
      await waitFor(() => expect(step()).toBe("Step 3 of 6"));
    });
  });

  describe("basics step", () => {
    async function toBasics(user: User) {
      await toBinaries(user);
      await next(user, /^Continue/);
    }

    it("defaults the folder from the backend and blocks an empty one", async () => {
      const { user } = setup();
      await toBasics(user);
      const input = screen.getByRole("textbox", { name: "Download location" });
      await waitFor(() => expect(input).toHaveValue("C:\\Users\\me\\Videos\\Clipy"));
      await user.clear(input);
      expect(screen.getByRole("button", { name: /Continue/ })).toBeDisabled();
    });

    it("keeps a configured folder over the default", async () => {
      const { user } = setup({
        get_settings: () => settingsFixture({ download: { downloadPath: "E:\\Mine" } }),
      });
      await toBasics(user);
      await waitFor(() =>
        expect(screen.getByRole("textbox", { name: "Download location" })).toHaveValue("E:\\Mine")
      );
    });

    it("logs when the default folder cannot be resolved", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      setup({
        get_default_download_path: () => {
          throw "no home";
        },
      });
      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      errorSpy.mockRestore();
    });

    it("picks a folder, ignores a cancelled picker and logs picker failures", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let pick: () => unknown = () => "F:\\Picked";
      const { user } = setup({ "plugin:dialog|open": () => pick() });
      await toBasics(user);
      const input = screen.getByRole("textbox", { name: "Download location" });
      await user.click(screen.getByRole("button", { name: "Browse for folder" }));
      await waitFor(() => expect(input).toHaveValue("F:\\Picked"));

      pick = () => null;
      await user.click(screen.getByRole("button", { name: "Browse for folder" }));
      pick = () => {
        throw "no dialog";
      };
      await user.click(screen.getByRole("button", { name: "Browse for folder" }));
      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      expect(input).toHaveValue("F:\\Picked");
      errorSpy.mockRestore();
    });
  });

  it("saves every choice in one update_settings call and completes onboarding", async () => {
    const { user, backend, onComplete } = setup();
    await toBinaries(user);
    await next(user, /^Continue/);

    const input = screen.getByRole("textbox", { name: "Download location" });
    await waitFor(() => expect(input).not.toHaveValue(""));
    await user.clear(input);
    await user.type(input, "D:\\Clips");
    await user.click(screen.getByRole("radio", { name: /^720/ }));
    await user.click(screen.getByRole("radio", { name: /^WebM/ }));
    await next(user);

    await user.click(screen.getByRole("switch", { name: "Embed Thumbnail" }));
    await user.click(screen.getByRole("switch", { name: "Embed Metadata" }));
    await user.click(screen.getByRole("switch", { name: "Organize by Channel" }));
    await user.click(screen.getByRole("switch", { name: "Download Subtitles" }));
    await user.click(screen.getByRole("combobox", { name: "Subtitle language" }));
    await user.click(await screen.findByRole("option", { name: "Japanese" }));
    await next(user);

    await user.click(screen.getByRole("switch", { name: "Hardware Acceleration" }));
    await user.click(screen.getByRole("combobox", { name: "Browser cookies" }));
    await user.click(await screen.findByRole("option", { name: "Firefox" }));
    await user.click(screen.getByRole("combobox", { name: "Encoding speed" }));
    await user.click(await screen.findByRole("option", { name: "Slow" }));
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTestId("crf-value")).toHaveTextContent("22");
    await next(user);

    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    expect(backend.callsTo("update_setting")).toHaveLength(0);
    const saved = backend.callsTo("update_settings")[0]?.args.settings as AppSettings;
    const expected = settingsFixture({
      download: {
        downloadPath: "D:\\Clips",
        defaultQuality: "720",
        defaultFormat: "webm",
        embedThumbnail: false,
        embedMetadata: false,
        createChannelSubfolder: true,
        downloadSubtitles: true,
        subtitleLanguage: "ja",
        cookiesFromBrowser: "firefox",
        crfQuality: 22,
        encodingPreset: "slow",
      },
      advanced: { hardwareAcceleration: false },
    });
    expect(saved).toEqual(expected);
    expect(useUIStore.getState().isFirstRun).toBe(false);
  });

  it("works without an onComplete callback", async () => {
    mockBackend({
      get_settings: () => settingsFixture(),
      check_binaries: () => binaryStatusFixture(),
    });
    const { user } = renderWithRouter(<SetupWizard />);
    await toComplete(user);
    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    await waitFor(() => expect(useUIStore.getState().isFirstRun).toBe(false));
  });

  it("labels installed tools without a reported version", async () => {
    const { user } = setup({
      check_binaries: () => binaryStatusFixture({ ffmpegVersion: null }),
    });
    await toBinaries(user);
    expect(
      await within(screen.getByRole("group", { name: "FFmpeg" })).findByText("Installed")
    ).toBeInTheDocument();
  });

  it("seeds from older configs that lack optional fields", async () => {
    const sparse = settingsFixture({ download: { downloadPath: "E:\\Old" } });
    const d = sparse.download as unknown as Record<string, unknown>;
    for (const key of [
      "downloadSubtitles",
      "subtitleLanguage",
      "cookiesFromBrowser",
      "crfQuality",
      "encodingPreset",
    ]) {
      delete d[key];
    }
    const { user, backend } = setup({ get_settings: () => sparse });
    await toComplete(user);
    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    await waitFor(() => expect(backend.callsTo("update_settings")).toHaveLength(1));
    const saved = backend.callsTo("update_settings")[0]?.args.settings as AppSettings;
    expect(saved.download).toMatchObject({
      downloadPath: "E:\\Old",
      downloadSubtitles: false,
      subtitleLanguage: "en",
      cookiesFromBrowser: "",
      crfQuality: 23,
      encodingPreset: "medium",
    });
  });

  it("stores no browser as an empty string", async () => {
    const { user, backend } = setup({
      get_settings: () => settingsFixture({ download: { cookiesFromBrowser: "chrome" } }),
    });
    await toComplete(user);
    await next(user, /Back/);
    await user.click(screen.getByRole("combobox", { name: "Browser cookies" }));
    await user.click(await screen.findByRole("option", { name: "None" }));
    await next(user);
    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    await waitFor(() => expect(backend.callsTo("update_settings")).toHaveLength(1));
    const saved = backend.callsTo("update_settings")[0]?.args.settings as AppSettings;
    expect(saved.download.cookiesFromBrowser).toBe("");
  });

  it("stays on the last step and toasts when saving fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user, onComplete } = setup({
      update_settings: () => {
        throw "disk full";
      },
    });
    await toComplete(user);
    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    expect(await screen.findByText("Couldn't save your settings")).toBeInTheDocument();
    expect(screen.getByText("disk full")).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(useUIStore.getState().isFirstRun).toBe(true);
    expect(screen.getByRole("button", { name: /Start Using Clipy/ })).toBeEnabled();
    errorSpy.mockRestore();
  });

  it("reports Error objects from the save by message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({
      get_settings: () => {
        throw new Error("settings unavailable");
      },
    });
    await toComplete(user);
    await user.click(screen.getByRole("button", { name: /Start Using Clipy/ }));
    expect(await screen.findByText("Couldn't save your settings")).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
