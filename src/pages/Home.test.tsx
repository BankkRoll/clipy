import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { Home } from "@/pages/Home";
import { useDownloadStore } from "@/stores/downloadStore";
import { mockBackend, type IpcHandler } from "@/test/tauri";
import { currentLocation, renderWithRouter } from "@/test/render";
import { formatFixture, settingsFixture, videoInfoFixture } from "@/test/fixtures";
import type { DownloadOptions } from "@/types/download";

/** Field names of the Rust `DownloadOptions` struct, camelCased like serde does. */
function backendDownloadOptionFields(): string[] {
  const source = readFileSync(
    resolve(process.cwd(), "src-tauri/src/models/download.rs"),
    "utf8"
  ).replace(/\r\n/g, "\n");
  const body = /pub struct DownloadOptions \{\n([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
  return [...body.matchAll(/pub (\w+):/g)]
    .map((m) => m[1]!.replace(/_(\w)/g, (_, c: string) => c.toUpperCase()))
    .sort();
}

function setup(handlers: Record<string, IpcHandler> = {}) {
  const backend = mockBackend({
    get_settings: () => settingsFixture(),
    fetch_video_info: () => videoInfoFixture(),
    start_download: () => "dl-1",
    ...handlers,
  });
  const view = renderWithRouter(<Home />);
  return { backend, ...view };
}

async function fetchVideo(
  user: ReturnType<typeof setup>["user"],
  url = "youtube.com/watch?v=dQw4w9WgXcQ"
) {
  await user.type(screen.getByRole("textbox", { name: "Video URL" }), url);
  await user.click(screen.getByRole("button", { name: "Fetch" }));
  await screen.findByText("Never Gonna Give You Up");
}

async function pick(
  user: ReturnType<typeof setup>["user"],
  trigger: string,
  option: string | RegExp
) {
  await user.click(screen.getByRole("combobox", { name: trigger }));
  await user.click(await screen.findByRole("option", { name: option }));
}

function lastStartPayload(backend: ReturnType<typeof setup>["backend"]) {
  const call = backend.callsTo("start_download").at(-1);
  return call?.args as { url: string; options: DownloadOptions } | undefined;
}

describe("Home page", () => {
  it("disables Fetch for empty input and validates on Enter", async () => {
    const { user, backend } = setup();
    expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Video URL" }), "   {Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a URL");
    expect(backend.callsTo("fetch_video_info")).toHaveLength(0);
  });

  it("rejects non-http URLs without calling the backend", async () => {
    const { user, backend } = setup();
    await user.type(screen.getByRole("textbox", { name: "Video URL" }), "ftp://example.com/v");
    await user.click(screen.getByRole("button", { name: "Fetch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a valid http(s) URL");
    expect(backend.callsTo("fetch_video_info")).toHaveLength(0);

    await user.type(screen.getByRole("textbox", { name: "Video URL" }), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("fetches with the normalized URL and shows the video", async () => {
    const { user, backend } = setup();
    await fetchVideo(user);
    expect(backend.callsTo("fetch_video_info")[0]?.args).toEqual({
      url: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(screen.getByText("Rick Astley")).toBeInTheDocument();
    expect(screen.getByText(/1,500,000,000 views/)).toBeInTheDocument();
    expect(screen.getByText(/Estimated size/)).toBeInTheDocument();
  });

  it("shows the backend error when fetching fails", async () => {
    const { user } = setup({
      fetch_video_info: () => {
        throw "Unsupported URL: https://example.com/";
      },
    });
    await user.type(screen.getByRole("textbox", { name: "Video URL" }), "https://example.com/");
    await user.click(screen.getByRole("button", { name: "Fetch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Unsupported URL");
  });

  it("only offers qualities the video actually has", async () => {
    const { user } = setup({
      fetch_video_info: () => videoInfoFixture({ formats: [formatFixture({ height: 720 })] }),
    });
    await fetchVideo(user);
    await user.click(screen.getByRole("combobox", { name: "Quality" }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options.some((o) => o?.startsWith("720p"))).toBe(true);
    expect(options.some((o) => o?.startsWith("1080p"))).toBe(false);
  });

  it("offers every quality when the extractor reports no heights", async () => {
    const { user } = setup({
      fetch_video_info: () => videoInfoFixture({ formats: [formatFixture({ height: 0 })] }),
    });
    await fetchVideo(user);
    await user.click(screen.getByRole("combobox", { name: "Quality" }));
    expect(await screen.findAllByRole("option")).toHaveLength(8);
  });

  it("sends a start_download payload with exactly the backend DownloadOptions fields", async () => {
    const { user, backend } = setup({
      get_settings: () =>
        settingsFixture({
          download: { rateLimit: "1M", cookiesFromBrowser: "firefox", playlistItems: "1,3" },
          advanced: { proxyUrl: "socks5://127.0.0.1:1080" },
        }),
    });
    await fetchVideo(user);
    await pick(user, "Quality", /^720p/);
    await pick(user, "Format", "MKV");
    await user.click(screen.getByRole("button", { name: /Download Video/ }));

    await waitFor(() => expect(backend.callsTo("start_download")).toHaveLength(1));
    const payload = lastStartPayload(backend)!;
    expect(Object.keys(payload.options).sort()).toEqual(backendDownloadOptionFields());
    expect(payload.url).toBe("https://youtube.com/watch?v=dQw4w9WgXcQ");
    expect(payload.options).toMatchObject({
      quality: "720",
      format: "mkv",
      audioOnly: false,
      outputPath: "C:\\Users\\me\\Videos\\Clipy",
      rateLimit: "1M",
      cookiesFromBrowser: "firefox",
      playlistItems: "1,3",
      proxyUrl: "socks5://127.0.0.1:1080",
      subtitleLanguages: ["en"],
      sponsorBlockCategories: ["sponsor"],
    });
  });

  it("adds the download, toasts and navigates to /downloads", async () => {
    const { user } = setup();
    await fetchVideo(user);
    await user.click(screen.getByRole("button", { name: /Download Video/ }));
    await waitFor(() => expect(currentLocation()).toBe("/downloads"));
    expect(await screen.findByText("Download started")).toBeInTheDocument();
    expect(useDownloadStore.getState().downloads[0]).toMatchObject({
      id: "dl-1",
      quality: "1080p",
      format: "mp4",
      status: "pending",
    });
  });

  it("downloads audio with the chosen format and bitrate", async () => {
    const { user, backend } = setup();
    await fetchVideo(user);
    await user.click(screen.getByRole("tab", { name: /Audio Only/ }));
    await pick(user, "Audio format", /^MP3/);
    await pick(user, "Bitrate", "320 kbps");
    await user.click(screen.getByRole("button", { name: /Download Audio/ }));

    await waitFor(() => expect(backend.callsTo("start_download")).toHaveLength(1));
    expect(lastStartPayload(backend)!.options).toMatchObject({
      quality: "best",
      format: "mp3",
      audioOnly: true,
      audioFormat: "mp3",
      audioBitrate: "320",
    });
    expect(useDownloadStore.getState().downloads[0]).toMatchObject({
      quality: "Audio",
      format: "mp3",
    });
  });

  it("passes every advanced option through", async () => {
    const { user, backend } = setup();
    await fetchVideo(user);
    await user.click(screen.getByRole("button", { name: /Advanced Options/ }));

    await user.click(screen.getByRole("switch", { name: "Embed Thumbnail" }));
    await user.click(screen.getByRole("switch", { name: "Embed Metadata" }));
    await user.click(screen.getByRole("switch", { name: "Save Description" }));
    await user.click(screen.getByRole("switch", { name: "Save Thumbnail" }));
    await user.click(screen.getByRole("switch", { name: "Download Subtitles" }));
    await pick(user, "Subtitle language", "German");
    await user.click(screen.getByRole("switch", { name: "Embed in Video" }));
    await user.click(screen.getByRole("switch", { name: "Include Auto-Generated" }));
    await user.click(screen.getByRole("switch", { name: "Remove Sponsored Segments" }));
    await user.click(screen.getByRole("button", { name: "Intro" }));
    await user.click(screen.getByRole("button", { name: "Sponsor" }));
    await user.click(screen.getByRole("switch", { name: "Embed Chapters" }));
    await user.click(screen.getByRole("switch", { name: "Split by Chapters" }));

    await user.click(screen.getByRole("button", { name: /Advanced Options/ }));
    await user.click(screen.getByRole("button", { name: /Download Video/ }));

    await waitFor(() => expect(backend.callsTo("start_download")).toHaveLength(1));
    expect(lastStartPayload(backend)!.options).toMatchObject({
      embedThumbnail: false,
      embedMetadata: false,
      writeDescription: true,
      writeThumbnail: true,
      downloadSubtitles: true,
      subtitleLanguages: ["de"],
      embedSubtitles: true,
      autoSubtitles: true,
      sponsorBlock: true,
      sponsorBlockCategories: ["intro"],
      downloadChapters: true,
      splitByChapters: true,
    });
  });

  it("seeds the form from backend download settings", async () => {
    const { user, backend } = setup({
      get_settings: () =>
        settingsFixture({ download: { defaultQuality: "720", defaultFormat: "webm" } }),
    });
    await fetchVideo(user);
    expect(screen.getByRole("combobox", { name: "Quality" })).toHaveTextContent("720p");
    await user.click(screen.getByRole("button", { name: /Download Video/ }));
    await waitFor(() => expect(lastStartPayload(backend)?.options.format).toBe("webm"));
  });

  it("still estimates a size for a quality without a known bitrate", async () => {
    const { user } = setup({
      get_settings: () => settingsFixture({ download: { defaultQuality: "4320" } }),
      fetch_video_info: () => videoInfoFixture({ formats: [formatFixture({ height: 4320 })] }),
    });
    await fetchVideo(user);
    // 213 s at the 10 MB/min fallback rate.
    expect(screen.getByText("Estimated size: ~35.5 MB")).toBeInTheDocument();
  });

  it("reports Error objects from the backend by message", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({
      start_download: () => {
        throw new Error("Output folder is read-only");
      },
    });
    await fetchVideo(user);
    await user.click(screen.getByRole("button", { name: /Download Video/ }));
    expect(await screen.findByText("Output folder is read-only")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("toasts and stays put when the backend rejects the download", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({
      start_download: () => {
        throw "yt-dlp not installed";
      },
    });
    await fetchVideo(user);
    await user.click(screen.getByRole("button", { name: /Download Video/ }));
    const toast = await screen.findByText("Failed to start download");
    expect(within(toast.closest("li")!).getByText("yt-dlp not installed")).toBeInTheDocument();
    expect(currentLocation()).toBe("/");
    expect(useDownloadStore.getState().downloads).toEqual([]);
    errorSpy.mockRestore();
  });
});
