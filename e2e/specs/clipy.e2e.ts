/**
 * The core user journey, end to end, against the real app and network:
 * first-run setup (installing yt-dlp/FFmpeg), fetching video info, downloading,
 * finding the file in the library, editing and exporting it.
 *
 * Each step builds on the previous one, mirroring a new user's first session.
 */
import { $, browser, expect } from "@wdio/globals";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * "Me at the zoo" (19 s) is the most stable video on YouTube. CI can point at
 * another yt-dlp-supported URL, since YouTube often bot-checks datacenter IPs.
 */
const VIDEO_URL = process.env.CLIPY_E2E_VIDEO_URL ?? "https://www.youtube.com/watch?v=jNQXAC9IVRw";
const VIDEO_TITLE = process.env.CLIPY_E2E_VIDEO_TITLE ?? "Me at the zoo";

const workDir = process.env.CLIPY_E2E_WORKDIR!;
const downloadDir = path.join(workDir, "downloads");
const exportPath = path.join(workDir, "export.mp4");

const button = (text: string) => $(`//button[contains(normalize-space(.), "${text}")]`);
const byLabel = (label: string) => $(`[aria-label="${label}"]`);
const heading = (t: string) =>
  $(`//h1[normalize-space(.)="${t}"] | //h2[normalize-space(.)="${t}"]`);
const text = (t: string) => $(`//*[contains(normalize-space(text()), "${t}")]`);

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
  await input.addValue(value);
  await expect(input).toHaveValue(value);
}

async function navigate(name: "Home" | "Library" | "Downloads" | "Editor" | "Settings") {
  await $(`a[aria-label="${name}"]`).click();
}

describe("Clipy end to end", () => {
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
      {
        timeout: 60_000,
      }
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

  it("fetches real video information", async () => {
    await navigate("Home");
    await fill("Video URL", VIDEO_URL);
    await (await button("Fetch")).click();
    await expect(text(VIDEO_TITLE)).toBeDisplayed({ wait: 90_000 });
  });

  it("downloads the video to the chosen folder", async () => {
    await (await button("Download Video")).click();
    await expect(browser).toHaveUrl(expect.stringContaining("/downloads"), { wait: 15_000 });
    await expect(text("Completed")).toBeDisplayed({ wait: 5 * 60_000 });
    await expect(byLabel("Play")).toBeEnabled();
    const files = readdirSync(downloadDir).filter((f) => f.startsWith(VIDEO_TITLE));
    expect(files).toHaveLength(1);
    expect(statSync(path.join(downloadDir, files[0]!)).size).toBeGreaterThan(100_000);
  });

  it("lists the download in the library", async () => {
    await navigate("Library");
    await expect(text(VIDEO_TITLE)).toBeDisplayed({ wait: 30_000 });
  });

  it("opens the video in the editor and exports it with FFmpeg", async () => {
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

  it("persists a settings change across a reload", async () => {
    const updatesSwitch = () =>
      $(
        `//*[@role="group"][.//*[normalize-space(text())="Auto-check for updates"]]//button[@role="switch"]`
      );
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
});
