/**
 * Tab components rendered directly against sparse settings: an older config
 * may lack every optional field, and each control must then show the same
 * default the backend would apply.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AdvancedTab,
  BinaryCard,
  DownloadsTab,
  NetworkTab,
  QualityTab,
  SponsorBlockTab,
  SubtitlesTab,
} from "@/components/settings";
import { settingsFixture } from "@/test/fixtures";
import type { AppSettings } from "@/hooks/useSettings";

const OPTIONAL_DOWNLOAD_FIELDS = [
  "filenameTemplate",
  "audioFormat",
  "audioBitrate",
  "audioCodec",
  "videoCodec",
  "crfQuality",
  "encodingPreset",
  "downloadSubtitles",
  "autoSubtitles",
  "embedSubtitles",
  "subtitleFormat",
  "subtitleLanguage",
  "sponsorBlock",
  "sponsorBlockCategories",
  "downloadChapters",
  "splitByChapters",
  "playlistStart",
  "playlistEnd",
  "playlistItems",
  "rateLimit",
  "concurrentFragments",
  "cookiesFromBrowser",
  "restrictFilenames",
  "useDownloadArchive",
  "writeInfoJson",
  "writeDescription",
  "writeThumbnail",
  "geoBypass",
];

function sparseSettings(extra: Record<string, unknown> = {}): AppSettings {
  const settings = settingsFixture();
  const d = settings.download as unknown as Record<string, unknown>;
  for (const key of OPTIONAL_DOWNLOAD_FIELDS) delete d[key];
  Object.assign(d, extra);
  delete (settings.advanced as unknown as Record<string, unknown>).hardwareAccelerationType;
  (settings.advanced as unknown as Record<string, unknown>).proxyUrl = undefined;
  return settings;
}

const item = (label: string) => within(screen.getByRole("group", { name: label }));

describe("settings tabs with sparse settings", () => {
  it("Downloads tab shows defaults and labels every select option", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <DownloadsTab
        settings={sparseSettings()}
        onUpdateSetting={onUpdate}
        onBrowseDownloadPath={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: "Filename template" })).toHaveValue(
      "%(title)s.%(ext)s"
    );
    expect(screen.getByRole("spinbutton", { name: "Playlist start index" })).toHaveValue(0);
    expect(screen.getByRole("textbox", { name: "Playlist items" })).toHaveValue("");
    expect(item("Write info JSON").getByRole("switch")).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Video ID" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "download.filenameTemplate",
      "%(title)s - %(id)s.%(ext)s"
    );

    await user.click(item("Simultaneous downloads").getByRole("combobox"));
    const concurrency = screen.getAllByRole("option").map((o) => o.textContent);
    expect(concurrency).toEqual([
      "1 downloadMost stable",
      "2 downloadsBalanced",
      "3 downloadsBalanced",
      "4 downloadsFaster, uses more resources",
      "5 downloadsFaster, uses more resources",
    ]);
    await user.keyboard("{Escape}");

    await user.click(item("Max retry attempts").getByRole("combobox"));
    const retries = screen.getAllByRole("option").map((o) => o.textContent);
    expect(retries).toEqual([
      "1 attemptQuick failure",
      "2 attemptsQuick failure",
      "3 attemptsBalanced",
      "5 attemptsBalanced",
      "10 attemptsPersistent",
    ]);
  });

  it("Network tab defaults to no cookies and one fragment", () => {
    render(<NetworkTab settings={sparseSettings()} onUpdateSetting={vi.fn()} />);
    expect(item("Use browser cookies").getByRole("combobox")).toHaveTextContent("None");
    expect(item("Concurrent fragments").getByRole("combobox")).toHaveTextContent("1 fragment");
    expect(screen.getByRole("textbox", { name: "Rate limit" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Proxy URL" })).toHaveValue("");
    expect(item("Geo-bypass").getByRole("switch")).not.toBeChecked();
  });

  it("Network tab tolerates unknown stored values", () => {
    render(
      <NetworkTab
        settings={sparseSettings({ cookiesFromBrowser: "netscape", concurrentFragments: 3 })}
        onUpdateSetting={vi.fn()}
      />
    );
    expect(item("Use browser cookies").getByRole("combobox")).not.toHaveTextContent("None");
  });

  it("Quality tab shows backend defaults and quality badges", async () => {
    const user = userEvent.setup();
    render(<QualityTab settings={sparseSettings()} onUpdateSetting={vi.fn()} />);
    expect(item("CRF Quality").getByText("23")).toBeInTheDocument();
    expect(item("Video codec").getByRole("combobox")).toHaveTextContent("Auto");
    expect(item("Audio codec").getByRole("combobox")).toHaveTextContent("Auto");
    expect(item("Audio format").getByRole("combobox")).toHaveTextContent("M4A/AAC");
    expect(item("Encoding preset").getByRole("combobox")).toHaveTextContent("Medium");
    expect(item("Audio bitrate").getByRole("combobox")).toHaveTextContent("192 kbps");
    await user.click(item("Preferred resolution").getByRole("combobox"));
    const names = screen.getAllByRole("option").map((o) => o.textContent);
    expect(names).toContain("4K (2160p)Best");
    expect(names).toContain("720p");
  });

  it("Quality tab tolerates unknown stored values and ignores no-op slider commits", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <QualityTab
        settings={sparseSettings({
          audioFormat: "aiff",
          encodingPreset: "placebo",
          videoCodec: "theora",
          audioCodec: "pcm",
          crfQuality: 0,
        })}
        onUpdateSetting={onUpdate}
      />
    );
    expect(item("CRF Quality").getByText("0")).toBeInTheDocument();
    screen.getByRole("slider").focus();
    await user.keyboard("{ArrowRight}{ArrowLeft}");
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith("download.crfQuality", 1);
  });

  it("SponsorBlock tab treats missing categories as just 'sponsor'", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <SponsorBlockTab
        settings={sparseSettings({ sponsorBlock: true })}
        onUpdateSetting={onUpdate}
      />
    );
    expect(screen.getByRole("button", { name: /^Sponsor/ })).toHaveClass("ring-1");
    await user.click(screen.getByRole("button", { name: /^Outro/ }));
    expect(onUpdate).toHaveBeenCalledWith("download.sponsorBlockCategories", ["sponsor", "outro"]);
    await user.click(screen.getByRole("button", { name: /^Sponsor/ }));
    expect(onUpdate).toHaveBeenCalledWith("download.sponsorBlockCategories", []);
  });

  it("Subtitles tab defaults to English SRT", () => {
    render(
      <SubtitlesTab
        settings={sparseSettings({ downloadSubtitles: true })}
        onUpdateSetting={vi.fn()}
      />
    );
    expect(item("Preferred language").getByRole("combobox")).toHaveTextContent("English");
    expect(item("Subtitle format").getByRole("combobox")).toHaveTextContent("SRT");
    expect(item("Embed in video file").getByRole("switch")).not.toBeChecked();
  });

  it("Subtitles tab tolerates unknown stored values", () => {
    render(
      <SubtitlesTab
        settings={sparseSettings({
          downloadSubtitles: true,
          subtitleLanguage: "tlh",
          subtitleFormat: "sbv",
        })}
        onUpdateSetting={vi.fn()}
      />
    );
    expect(item("Preferred language").getByRole("combobox")).not.toHaveTextContent("English");
  });

  it("Advanced tab handles missing stats, status and reset handler", () => {
    render(
      <AdvancedTab
        settings={sparseSettings()}
        onUpdateSetting={vi.fn()}
        cacheStats={null}
        onClearCache={vi.fn()}
        onRefreshCache={vi.fn()}
        binaryStatus={null}
        binaryLoading={false}
        onRefreshBinaries={vi.fn()}
        onInstallFfmpeg={vi.fn()}
        onInstallYtdlp={vi.fn()}
        onUpdateYtdlp={vi.fn()}
        installingFfmpeg={false}
        installingYtdlp={false}
        updatingYtdlp={false}
      />
    );
    expect(item("Cache").getByText("0 MB used")).toBeInTheDocument();
    expect(item("Acceleration type").getByRole("combobox")).toHaveTextContent("Auto Detect");
    expect(
      within(screen.getByRole("group", { name: "FFmpeg" })).getByText("Not installed")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset Everything" })).toBeDisabled();
  });

  it("Advanced tab tolerates an unknown acceleration type", () => {
    const settings = sparseSettings();
    settings.advanced.hardwareAccelerationType = "cuda-legacy";
    render(
      <AdvancedTab
        settings={settings}
        onUpdateSetting={vi.fn()}
        cacheStats={null}
        onClearCache={vi.fn()}
        onRefreshCache={vi.fn()}
        binaryStatus={null}
        binaryLoading
        onRefreshBinaries={vi.fn()}
        onInstallFfmpeg={vi.fn()}
        onInstallYtdlp={vi.fn()}
        onUpdateYtdlp={vi.fn()}
        installingFfmpeg={false}
        installingYtdlp={false}
        updatingYtdlp={false}
      />
    );
    expect(screen.getAllByText("Checking status...")).toHaveLength(2);
  });
});

describe("BinaryCard", () => {
  it("shows installing and update states", () => {
    const { rerender } = render(
      <BinaryCard name="yt-dlp" installed={false} loading={false} installing onInstall={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: /Install/ })).toBeDisabled();
    rerender(
      <BinaryCard
        name="yt-dlp"
        version="2026.01.01"
        installed
        loading={false}
        installing
        onInstall={vi.fn()}
        onUpdate={vi.fn()}
        canUpdate
      />
    );
    expect(screen.getByText("Version 2026.01.01")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Update/ })).toBeDisabled();
    rerender(
      <BinaryCard
        name="FFmpeg"
        version="7"
        installed
        loading={false}
        installing={false}
        onInstall={vi.fn()}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
