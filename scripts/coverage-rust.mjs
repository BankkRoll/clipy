#!/usr/bin/env node
/**
 * Rust coverage runner.
 *
 * Runs the backend test suite once under cargo-llvm-cov, then emits lcov,
 * HTML and a JSON summary into coverage/rust/ and enforces the line threshold.
 * Kept in Node rather than an npm one-liner so it behaves the same on
 * Windows, macOS and Linux shells.
 *
 * Requires: `rustup component add llvm-tools-preview` and
 * `cargo install cargo-llvm-cov`, plus a built frontend (dist/) because
 * tauri::generate_context! checks for it at compile time.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

/** Minimum Rust line coverage (%) enforced in CI. Ratchet up, never down. */
const FAIL_UNDER_LINES = 80;

const root = path.resolve(import.meta.dirname, "..");
const manifest = path.join(root, "src-tauri", "Cargo.toml");
const outDir = path.join(root, "coverage", "rust");
mkdirSync(outDir, { recursive: true });

function cargo(args) {
  const res = spawnSync("cargo", ["llvm-cov", ...args, "--manifest-path", manifest], {
    stdio: "inherit",
    shell: process.platform === "win32",
    // Coverage needs instrumentation, not debuginfo; dropping it shrinks the
    // instrumented target dir several-fold.
    env: {
      ...process.env,
      CARGO_INCREMENTAL: "0",
      CARGO_PROFILE_DEV_DEBUG: "0",
      CARGO_PROFILE_TEST_DEBUG: "0",
    },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

cargo(["--all-features", "--no-report"]);
cargo(["report", "--lcov", "--output-path", path.join(outDir, "lcov.info")]);
cargo(["report", "--json", "--summary-only", "--output-path", path.join(outDir, "summary.json")]);
cargo(["report", "--html", "--output-dir", outDir]);
cargo(["report", "--summary-only", "--fail-under-lines", String(FAIL_UNDER_LINES)]);
