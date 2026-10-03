/**
 * Every main user flow, end to end, against the real app, real tools and the
 * real network. Steps build on each other like a new user's first session:
 *
 * setup (installs yt-dlp/FFmpeg) → browser-cookie fallback → video download →
 * audio-only download → pause/resume/cancel → library search/rename/remove →
 * editor export → settings persistence and tool update status.
 *
 * Throughout, a watcher fails the run if any console window flashes up
 * (Windows; run against a release build, since debug builds own a console).
 */
import { $, $$, browser, expect } from "@wdio/globals";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { watchConsoleWindows, type ConsoleWatch } from "../support/console-watch";

/**
 * "Me at the zoo" (19 s) is the most stable video on YouTube. Override with
 * another yt-dlp-supported URL if YouTube starts bot-checking your IP.
 */
const VIDEO_URL = process.env.CLIPY_E2E_VIDEO_URL ?? "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const VIDEO_TITLE = process.env.CLIPY_E2E_VIDEO_TITLE ?? "Me at the zoo";
/** A long video for pause/resume/cancel, throttled so it can't finish. */
const LONG_URL = "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
const LONG_TITLE = "Big Buck Bunny";
const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".opus", ".ogg", ".aac", ".flac", ".wav"];

const workDir = process.env.CLIPY_E2E_WORKDIR!;
const downloadDir = path.join(workDir, "downloads");
const exportPath = path.join(workDir, "export.mp4");

const button = (text: string) => $(`//button[contains(normalize-space(.), "${text}")]`);
const byLabel = (label: string) => $(`[aria-label="${label}"]`);
const heading = (t: string) =>
  $(`//h1[normalize-space(.)="${t}"] | //h2[normalize-space(.)="${t}"]`);
const text = (t: string) => $(`//*[contains(normalize-space(text()), "${t}")]`);
const settingGroup = (label: string) =>
  `//*[@role="group"][.//*[normalize-space(text())="${label}"]]`;

/**
 * Replace a React-controlled input's value the way a user would (select all,
 * type), then assert it stuck. WebDriver's clearValue bypasses React's
 * onChange, so setValue can leave stale state behind.
 */
async function fill(label: string, value: string) {
  const input = await byLabel(label);
  await input.click();
  await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "a"]);
  await browser.keys("Backspace");
  if (value) await input.addValue(value);
  await expect(input).toHaveValue(value);
}

async function navigate(name: "Home" | "Library" | "Downloads" | "Editor" | "Settings") {
  await $(`a[aria-label="${name}"]`).click();
}

async function openSettingsTab(name: string) {
  await navigate("Settings");
  await $(`//*[@role="tab"][contains(normalize-space(.), "${name}")]`).click();
}

/** Pick `option` in the Radix select inside the setting labelled `label`. */
async function chooseSetting(label: string, option: string) {
  await $(`${settingGroup(label)}//button[@role="combobox"]`).click();
  await $(`//*[@role="option"][.//*[normalize-space(text())="${option}"]]`).click();
  await expect($(`${settingGroup(label)}//button[@role="combobox"]`)).toHaveText(
    expect.stringContaining(option)
  );
}

async function fetchVideo(url: string, title: string) {
  await navigate("Home");
  await fill("Video URL", url);
  await (await button("Fetch")).click();
  await expect(text(title)).toBeDisplayed({ wait: 90_000 });
}

const downloaded = () => (existsSync(downloadDir) ? readdirSync(downloadDir) : []);

describe("Clipy end to end", () => {
  let consoles: ConsoleWatch;

  before(async () => {
    consoles = await watchConsoleWindows();
  });

  after(() => consoles.stop());

  it("boots into the first-run setup", async () => {
    await expect(text("Welcome to Clipy")).toBeDisplayed({ wait: 60_000 });
    await expect(browser).toHaveTitle(expect.stringContaining("Clipy"));
  });

  it("installs the required tools during setup", async () => {
    await (await button("Get Started")).click();
    await expect(heading("Required Components")).toBeDisplayed();
    // Wait for the status check so we know whether anything needs installing.
    const install = await button("Download & Install");
    const proceed = await button("Continue");
    await browser.waitUntil(
      async () => (await install.isExisting()) || (await proceed.isExisting()),
      { timeout: 60_000 }
    );
    if (await install.isExisting()) {
      // Real, checksum-verified downloads of yt-dlp (and FFmpeg if missing);
      // a successful install advances to the next step by itself.
      await install.click();
    } else {
      await proceed.click();
    }
    await expect(heading("Basic Settings")).toBeDisplayed({ wait: 8 * 60_000 });
  });

  it("saves basic preferences with a custom download folder", async () => {
    await fill("Download location", downloadDir);
    await (await button("Continue")).click();
    await expect(heading("Preferences")).toBeDisplayed();
    await (await button("Continue")).click();
    await expect(heading("Advanced Options")).toBeDisplayed();
    await (await button("Continue")).click();
    await expect(heading("You're All Set")).toBeDisplayed();
    await (await button("Start Using Clipy")).click();
    await expect($(`a[aria-label="Home"]`)).toBeDisplayed({ wait: 30_000 });
  });

  it("downloads even when the chosen browser's cookies can't be read", async () => {
    // Chromium browsers lock and (on Windows) encrypt their cookie store, so
    // this exercises the retry without browser cookies.
    await openSettingsTab("Network");
    await chooseSetting("Use browser cookies", "Chrome");

    await fetchVideo(VIDEO_URL, VIDEO_TITLE);
    await (await button("Download Video")).click();
    await expect(browser).toHaveUrl(expect.stringContaining("/downloads"), { wait: 15_000 });
    await expect(text("Completed")).toBeDisplayed({ wait: 5 * 60_000 });
    await expect(byLabel("Play")).toBeEnabled();
    const files = downloaded().filter((f) => f.startsWith(VIDEO_TITLE));
    expect(files).toHaveLength(1);
    expect(statSync(path.join(downloadDir, files[0]!)).size).toBeGreaterThan(100_000);

    await openSettingsTab("Network");
    await chooseSetting("Use browser cookies", "None");
  });

  it("downloads audio only", async () => {
    await fetchVideo(VIDEO_URL, VIDEO_TITLE);
    await $(`//*[@role="tab"][contains(normalize-space(.), "Audio Only")]`).click();
    await (await button("Download Audio")).click();
    await expect(browser).toHaveUrl(expect.stringContaining("/downloads"), { wait: 15_000 });
    await browser.waitUntil(
      async () => (await $$(`//*[normalize-space(text())="Completed"]`).length) >= 2,
      {
        timeout: 5 * 60_000,
        timeoutMsg: "audio download never completed",
      }
    );
    const audio = downloaded().filter((f) =>
      AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase())
    );
    expect(audio).toHaveLength(1);
  });

  it("pauses, resumes and cancels a download", async () => {
    await openSettingsTab("Network");
    await fill("Rate limit", "50K");
    await browser.keys("Enter");

    await fetchVideo(LONG_URL, LONG_TITLE);
    await (await button("Download Video")).click();
    await expect(byLabel("Pause")).toBeDisplayed({ wait: 90_000 });
    await (await byLabel("Pause")).click();
    await expect(text("Paused")).toBeDisplayed({ wait: 30_000 });
    await (await byLabel("Resume")).click();
    await expect(byLabel("Pause")).toBeDisplayed({ wait: 60_000 });
    await (await byLabel("Cancel")).click();
    await expect(text("Cancelled")).toBeDisplayed({ wait: 30_000 });

    // A cancelled download must not leave a finished file behind.
    await browser.pause(2_000);
    expect(downloaded().filter((f) => f.startsWith(LONG_TITLE) && !f.includes(".part"))).toEqual(
      []
    );

    await openSettingsTab("Network");
    await fill("Rate limit", "");
    await browser.keys("Enter");
  });

  it("searches, renames and removes videos in the library", async () => {
    await navigate("Library");
    await expect(text(VIDEO_TITLE)).toBeDisplayed({ wait: 30_000 });

    await fill("Search videos", "no such video");
    await expect(text(VIDEO_TITLE)).not.toBeDisplayed();
    await fill("Search videos", "zoo");
    await expect(text(VIDEO_TITLE)).toBeDisplayed();
    await fill("Search videos", "");

    const cards = () => $$('[aria-label="More actions"]');
    const before = await cards().length;
    expect(before).toBeGreaterThanOrEqual(2);

    await (await cards()[0]!).click();
    await $(`//*[@role="menuitem"][contains(normalize-space(.), "Rename")]`).click();
    const title = await $('[placeholder="Video title"]');
    await title.click();
    await browser.keys(["Control", "a"]);
    await title.addValue("E2E renamed");
    await (await button("Save")).click();
    await expect(text("E2E renamed")).toBeDisplayed({ wait: 15_000 });

    const filesBefore = downloaded().length;
    await (await cards()[0]!).click();
    await $(`//*[@role="menuitem"][contains(normalize-space(.), "Remove")]`).click();
    await (await button("Remove from library")).click();
    await browser.waitUntil(async () => (await cards().length) === before - 1, {
      timeout: 15_000,
      timeoutMsg: "removed video still listed",
    });
    expect(downloaded()).toHaveLength(filesBefore);
  });

  it("opens a video in the editor and exports it with FFmpeg", async () => {
    await navigate("Library");
    const card = await text(VIDEO_TITLE);
    await card.moveTo();
    await (await byLabel("Edit")).click();
    await expect(browser).toHaveUrl(expect.stringContaining("/editor"), { wait: 15_000 });
    await expect($('[data-testid^="clip-"]')).toBeExisting({ wait: 30_000 });

    await (await button("Export")).click();
    await expect(text("Export Video")).toBeDisplayed();
    await fill("Output location", exportPath);
    const confirm = await $(`//div[@role="dialog"]//button[normalize-space(.)="Export"]`);
    await confirm.click();

    await browser.waitUntil(() => existsSync(exportPath) && statSync(exportPath).size > 10_000, {
      timeout: 5 * 60_000,
      timeoutMsg: `export never produced ${exportPath}`,
    });
    await expect(text("Export complete")).toBeDisplayed({ wait: 5 * 60_000 });
  });

  it("shows yt-dlp as up to date right after installing it", async () => {
    await openSettingsTab("Advanced");
    const ytdlp = $(`//*[@role="group"][@aria-label="yt-dlp"]`);
    await expect(ytdlp).toHaveText(expect.stringContaining("up to date"), { wait: 60_000 });
    await expect(
      ytdlp.$(`.//button[contains(normalize-space(.), "Update to")]`)
    ).not.toBeExisting();
  });

  it("persists a settings change across a reload", async () => {
    const updatesSwitch = () =>
      $(`${settingGroup("Auto-check for updates")}//button[@role="switch"]`);
    await navigate("Settings");
    const before = await (await updatesSwitch()).getAttribute("aria-checked");
    await (await updatesSwitch()).click();
    await browser.waitUntil(
      async () => (await (await updatesSwitch()).getAttribute("aria-checked")) !== before
    );
    await browser.refresh();
    await expect(updatesSwitch()).toHaveAttribute(
      "aria-checked",
      before === "true" ? "false" : "true",
      { wait: 30_000 }
    );
  });

  it("never flashed a console window", () => {
    expect(consoles.windows).toEqual([]);
  });
});
