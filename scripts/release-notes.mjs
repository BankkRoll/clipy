#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section for one version, for use as GitHub release
 * notes. Exits non-zero if the section is missing or empty so a release can't
 * go out without notes.
 *
 * Usage: node scripts/release-notes.mjs <version>
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("usage: release-notes.mjs <version>");
  process.exit(2);
}

const root = path.resolve(import.meta.dirname, "..");
const lines = readFileSync(path.join(root, "CHANGELOG.md"), "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
if (start === -1) {
  console.error(`No CHANGELOG section for ${version}`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
const body = lines
  .slice(start + 1, end === -1 ? undefined : end)
  // Link reference definitions belong to the whole file, not one section.
  .filter((l) => !/^\[[^\]]+\]:\s/.test(l))
  .join("\n")
  .trim();

if (!body) {
  console.error(`CHANGELOG section for ${version} is empty`);
  process.exit(1);
}

const assets = [
  "",
  "---",
  "",
  "**Verify your download:** every asset is listed in `SHA256SUMS.txt` and has a",
  "signed build-provenance attestation: `gh attestation verify <file> --repo BankkRoll/clipy`.",
  "",
  "Builds are not code-signed. On Windows choose *More info → Run anyway* in SmartScreen;",
  "on macOS run `xattr -dr com.apple.quarantine /Applications/Clipy.app` after copying the app.",
];
console.log(body + "\n" + assets.join("\n"));
