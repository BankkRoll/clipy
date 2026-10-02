import { describe, it, expect, vi, afterEach } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { UrlInput, useDownloadOptions, buildDownloadOptions } from "@/components/home";
import { settingsFixture } from "@/test/fixtures";
import type { AppSettings } from "@/hooks/useSettings";

afterEach(() => {
  vi.useRealTimers();
});

describe("UrlInput placeholder animation", () => {
  it("types a site, pauses, erases it and moves to the next one", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(
      <UrlInput
        url=""
        isLoading={false}
        error={null}
        hasVideo={false}
        onUrlChange={() => {}}
        onFetch={() => {}}
      />
    );
    const input = screen.getByRole("textbox", { name: "Video URL" });
    expect(input).toHaveAttribute("placeholder", "https://");

    const first = "https://youtube.com/watch?v=dQw4w9WgXcQ";
    act(() => vi.advanceTimersByTime(500 + 50 * first.length));
    expect(input).toHaveAttribute("placeholder", first);

    act(() => vi.advanceTimersByTime(2000 + 25 * 10));
    expect(input.getAttribute("placeholder")!.length).toBeLessThan(first.length);
    act(() => vi.advanceTimersByTime(25 * first.length + 300 + 50 * 40));
    expect(input.getAttribute("placeholder")).toContain("vimeo.com");
  });

  it("hides the platform list once a video is shown and skips fetch while loading", () => {
    const onFetch = vi.fn();
    const { rerender } = render(
      <UrlInput
        url="x"
        isLoading={false}
        error={null}
        hasVideo={false}
        onUrlChange={() => {}}
        onFetch={onFetch}
      />
    );
    expect(screen.getByText("Supports 1000+ sites including")).toBeInTheDocument();
    rerender(
      <UrlInput url="x" isLoading error={null} hasVideo onUrlChange={() => {}} onFetch={onFetch} />
    );
    expect(screen.queryByText("Supports 1000+ sites including")).toBeNull();
    act(() => {
      screen
        .getByRole("textbox", { name: "Video URL" })
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onFetch).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button")[0]).toBeDisabled();
  });
});

describe("useDownloadOptions", () => {
  it("uses built-in defaults until settings load, then seeds once", () => {
    const { result, rerender } = renderHook(({ s }) => useDownloadOptions(s), {
      initialProps: { s: null as AppSettings | null },
    });
    expect(result.current.options).toMatchObject({
      downloadMode: "video",
      quality: "1080",
      format: "mp4",
      audioFormat: "m4a",
      audioBitrate: "192",
      sponsorCategories: ["sponsor"],
    });

    rerender({ s: settingsFixture({ download: { defaultQuality: "720", sponsorBlock: true } }) });
    expect(result.current.options.quality).toBe("720");
    expect(result.current.options.sponsorBlock).toBe(true);

    act(() => result.current.setters.setQuality("480"));
    rerender({ s: settingsFixture({ download: { defaultQuality: "2160" } }) });
    expect(result.current.options.quality).toBe("480");
  });

  it("falls back per field when optional settings are absent", () => {
    const sparse = settingsFixture();
    const d = sparse.download as unknown as Record<string, unknown>;
    for (const key of [
      "audioFormat",
      "audioBitrate",
      "downloadSubtitles",
      "subtitleLanguage",
      "embedSubtitles",
      "autoSubtitles",
      "sponsorBlock",
      "sponsorBlockCategories",
      "downloadChapters",
      "splitByChapters",
      "writeDescription",
      "writeThumbnail",
    ]) {
      delete d[key];
    }
    d.defaultQuality = "";
    d.defaultFormat = "";
    d.embedThumbnail = undefined;
    d.embedMetadata = undefined;

    const { result } = renderHook(() => useDownloadOptions(sparse));
    const expected = {
      quality: "1080",
      format: "mp4",
      audioFormat: "m4a",
      audioBitrate: "192",
      embedThumbnail: true,
      embedMetadata: true,
      subtitleLanguage: "en",
      sponsorCategories: ["sponsor"],
      downloadSubtitles: false,
    };
    expect(result.current.options).toMatchObject(expected);
    act(() => result.current.resetOptions());
    expect(result.current.options).toMatchObject(expected);
  });

  it("toggles sponsor categories and resets to the settings", () => {
    const { result } = renderHook(() =>
      useDownloadOptions(settingsFixture({ download: { defaultFormat: "mkv" } }))
    );
    act(() => result.current.toggleSponsorCategory("intro"));
    expect(result.current.options.sponsorCategories).toEqual(["sponsor", "intro"]);
    act(() => result.current.toggleSponsorCategory("sponsor"));
    expect(result.current.options.sponsorCategories).toEqual(["intro"]);
    act(() => {
      result.current.setters.setDownloadMode("audio");
      result.current.setters.setFormat("webm");
    });
    act(() => result.current.resetOptions());
    expect(result.current.options).toMatchObject({
      downloadMode: "video",
      format: "mkv",
      sponsorCategories: ["sponsor"],
    });
  });

  it("resets to built-in defaults without settings", () => {
    const { result } = renderHook(() => useDownloadOptions(null));
    act(() => result.current.setters.setQuality("144"));
    act(() => result.current.resetOptions());
    expect(result.current.options.quality).toBe("1080");
  });
});

describe("buildDownloadOptions", () => {
  it("fills backend defaults when settings have not loaded", () => {
    const { result } = renderHook(() => useDownloadOptions(null));
    const options = buildDownloadOptions(result.current.options, null);
    expect(options).toMatchObject({
      outputPath: "",
      audioCodec: "auto",
      videoCodec: "auto",
      subtitleFormat: "srt",
      concurrentFragments: 1,
      proxyUrl: "",
      writeInfoJson: false,
      geoBypass: false,
    });
  });

  it("copies persisted download settings the form does not expose", () => {
    const settings = settingsFixture({
      download: {
        audioCodec: "opus",
        videoCodec: "av1",
        subtitleFormat: "vtt",
        writeInfoJson: true,
        concurrentFragments: 4,
        restrictFilenames: true,
        useDownloadArchive: true,
        createChannelSubfolder: true,
        includeDateInFilename: true,
        filenameTemplate: "%(id)s.%(ext)s",
        geoBypass: true,
      },
    });
    const { result } = renderHook(() => useDownloadOptions(settings));
    expect(buildDownloadOptions(result.current.options, settings)).toMatchObject({
      audioCodec: "opus",
      videoCodec: "av1",
      subtitleFormat: "vtt",
      writeInfoJson: true,
      concurrentFragments: 4,
      restrictFilenames: true,
      useDownloadArchive: true,
      createChannelSubfolder: true,
      includeDateInFilename: true,
      filenameTemplate: "%(id)s.%(ext)s",
      geoBypass: true,
    });
  });
});
