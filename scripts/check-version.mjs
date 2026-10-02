#!/usr/bin/env node
/**
 * Verifies every place that declares the app version agrees with the release
 * version, and that CHANGELOG.md has a section for it.
 *
 * Usage: node scripts/check-version.mjs <version>   (e.g. 2.0.0)
 * With no argument, checks the files agree with package.json.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const pkg = JSON.parse(read("package.json")).version;
const expected = process.argv[2] ?? pkg;

const found = {
  "package.json": pkg,
  "src-tauri/tauri.conf.json": JSON.parse(read("src-tauri/tauri.conf.json")).version,
  "src-tauri/Cargo.toml": read("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m)?.[1],
};

let ok = true;
for (const [file, version] of Object.entries(found)) {
  if (version !== expected) {
    console.error(`${file}: version ${version} != ${expected}`);
    ok = false;
  }
}

const changelog = read("CHANGELOG.md");
const heading = new RegExp(`^## \\[${expected.replace(/\./g, "\\.")}\\]`, "m");
if (!heading.test(changelog)) {
  console.error(`CHANGELOG.md: no "## [${expected}]" section`);
  ok = false;
}

if (!ok) process.exit(1);
console.log(`Version ${expected} is consistent across package.json, tauri.conf.json, Cargo.toml and CHANGELOG.md`);
