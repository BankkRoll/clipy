/**
 * WebdriverIO config for end-to-end tests against the real Clipy binary.
 *
 * tauri-driver (Windows: msedgedriver; Linux: WebKitWebDriver) drives the
 * actual app with its real Rust backend, real yt-dlp/FFmpeg and real network.
 * macOS has no WKWebView driver, so these run on Windows and Linux only.
 *
 * Prerequisites:
 * - `cargo install tauri-driver --locked --version ^2`
 * - Windows: msedgedriver matching the installed WebView2 on PATH (or set
 *   MSEDGEDRIVER_PATH). Linux: `webkit2gtk-driver` and `xvfb`.
 * - A built app: `pnpm tauri build --debug --no-bundle`
 *   (override with CLIPY_E2E_APP).
 *
 * The suite expects a fresh profile (no prior Clipy data), as on CI.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const exe = process.platform === "win32" ? "clipy.exe" : "clipy";
const application =
  process.env.CLIPY_E2E_APP ?? path.join(root, "src-tauri", "target", "debug", exe);

/** Scratch directory for downloads and exports; read by the specs. */
export const workDir = mkdtempSync(path.join(os.tmpdir(), "clipy-e2e-"));
process.env.CLIPY_E2E_WORKDIR = workDir;

let driver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  capabilities: [
    {
      // @ts-expect-error tauri-driver's vendor capability is not in the WebDriver typings.
      "tauri:options": { application },
    },
  ],
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  // Real downloads, binary installs and exports: generous but bounded.
  mochaOpts: { ui: "bdd", timeout: 10 * 60_000 },
  waitforTimeout: 30_000,

  onPrepare() {
    const args: string[] = [];
    if (process.env.MSEDGEDRIVER_PATH) args.push("--native-driver", process.env.MSEDGEDRIVER_PATH);
    driver = spawn("tauri-driver", args, { stdio: [null, process.stdout, process.stderr] });
  },

  async afterTest(test, _context, { passed }) {
    if (passed) return;
    const dir = path.join(root, "e2e", "artifacts");
    mkdirSync(dir, { recursive: true });
    const name = test.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    await browser.saveScreenshot(path.join(dir, `${name}.png`));
  },

  onComplete() {
    driver?.kill();
    rmSync(workDir, { recursive: true, force: true });
  },
};
