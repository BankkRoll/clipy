import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACKNOWLEDGEMENTS, REPOSITORY_URL, SETTINGS_TABS } from "@/components/settings";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const npmDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const cargo = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

/** How each credited project is actually shipped or used. */
const EVIDENCE: Record<string, () => boolean> = {
  "yt-dlp": () => source("src-tauri/src/services/ytdlp.rs").includes("yt-dlp"),
  FFmpeg: () => existsSync(resolve(root, "src-tauri/src/services/ffmpeg.rs")),
  SponsorBlock: () => source("src-tauri/src/services/ytdlp.rs").includes("sponsorblock"),
  Tauri: () => /^tauri\s*=/m.test(cargo) && "@tauri-apps/api" in npmDeps,
  React: () => "react" in npmDeps,
  "React Router": () => "react-router-dom" in npmDeps,
  Vite: () => "vite" in npmDeps,
  "Tailwind CSS": () => "tailwindcss" in npmDeps,
  "shadcn/ui": () => existsSync(resolve(root, "components.json")),
  "Radix UI": () => Object.keys(npmDeps).some((d) => d.startsWith("@radix-ui/")),
  cmdk: () => "cmdk" in npmDeps,
  Zustand: () => "zustand" in npmDeps,
  Lucide: () => "lucide-react" in npmDeps,
  Sonner: () => "sonner" in npmDeps,
};

describe("acknowledgements", () => {
  it("credit exactly the projects with evidence of use", () => {
    expect(ACKNOWLEDGEMENTS.map((a) => a.name).sort()).toEqual(Object.keys(EVIDENCE).sort());
  });

  it.each(ACKNOWLEDGEMENTS.map((a) => [a.name]))("%s is really a dependency", (name) => {
    expect(EVIDENCE[name]!()).toBe(true);
  });

  it("does not credit hls.js, which is not a dependency", () => {
    expect("hls.js" in npmDeps).toBe(false);
    expect(ACKNOWLEDGEMENTS.some((a) => a.name === "hls.js")).toBe(false);
  });

  it("link only to https pages", () => {
    for (const a of ACKNOWLEDGEMENTS) expect(a.url).toMatch(/^https:\/\//);
  });
});

describe("settings constants", () => {
  it("points at the canonical repository", () => {
    expect(REPOSITORY_URL).toBe("https://github.com/BankkRoll/clipy");
  });

  it("lists every tab once", () => {
    const values = SETTINGS_TABS.map((t) => t.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
