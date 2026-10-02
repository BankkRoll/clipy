#!/usr/bin/env node
/**
 * Prints a Markdown coverage table for the frontend (istanbul json-summary)
 * and backend (llvm-cov JSON summary). Used for the CI job summary; missing
 * reports are reported rather than failing, since the gates live elsewhere.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pct = (n) => `${Number(n).toFixed(2)}%`;
const rows = [];

const fe = path.join(root, "coverage", "frontend", "coverage-summary.json");
if (existsSync(fe)) {
  const t = JSON.parse(readFileSync(fe, "utf8")).total;
  rows.push(["Frontend (istanbul)", t.lines.pct, t.statements.pct, t.functions.pct, t.branches.pct]);
} else {
  rows.push(["Frontend (istanbul)", "n/a", "n/a", "n/a", "n/a"]);
}

const be = path.join(root, "coverage", "rust", "summary.json");
if (existsSync(be)) {
  const t = JSON.parse(readFileSync(be, "utf8")).data[0].totals;
  rows.push(["Backend (llvm-cov)", t.lines.percent, t.regions.percent, t.functions.percent, "n/a"]);
} else {
  rows.push(["Backend (llvm-cov)", "n/a", "n/a", "n/a", "n/a"]);
}

console.log("## Coverage\n");
console.log("| Suite | Lines | Statements / Regions | Functions | Branches |");
console.log("|---|---|---|---|---|");
for (const [name, ...vals] of rows) {
  console.log(`| ${name} | ${vals.map((v) => (typeof v === "number" ? pct(v) : v)).join(" | ")} |`);
}
