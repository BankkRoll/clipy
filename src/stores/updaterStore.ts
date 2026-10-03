/**
 * App self-update state.
 *
 * Wraps the Tauri updater plugin, which fetches `latest.json` from GitHub
 * Releases and verifies every package against the minisign public key in
 * tauri.conf.json before installing. Responsibilities:
 * - check for updates (automatic on launch, or manual from Settings)
 * - download + install with progress, then relaunch
 * - remember a version the user chose to skip (automatic checks only)
 */
import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { logger } from "@/lib/logger";

/** Lifecycle of an update check/install. */
export type UpdaterStatus =
  "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

/** What a finished check found; returned so callers can toast. */
export type CheckOutcome = "available" | "up-to-date" | "skipped" | "busy" | "error";

/** localStorage key for the version the user asked not to be reminded about. */
export const SKIPPED_VERSION_KEY = "clipy-skipped-update";

/** Shape of the updater store. */
export interface UpdaterState {
  status: UpdaterStatus;
  /** Whether the update dialog is showing. */
  open: boolean;
  currentVersion: string;
  newVersion: string;
  /** Release notes, one entry per non-empty line of the release body. */
  notes: string[];
  /** Download progress, 0-100. */
  progress: number;
  error: string | null;
  /**
   * Check for an update. Automatic checks respect a skipped version; manual
   * checks always report.
   */
  checkForUpdate: (opts?: { manual?: boolean }) => Promise<CheckOutcome>;
  /** Download and install the found update. */
  install: () => Promise<void>;
  /** Relaunch into the installed version. */
  restart: () => Promise<void>;
  /** Close the dialog, keeping any download running. */
  dismiss: () => void;
  /** Close the dialog and stop automatic reminders for this version. */
  skip: () => void;
}

// The Update object is a backend resource handle, not serializable state.
let pending: Update | null = null;

function readSkipped(): string | null {
  try {
    return localStorage.getItem(SKIPPED_VERSION_KEY);
  } catch {
    return null;
  }
}

function writeSkipped(version: string): void {
  try {
    localStorage.setItem(SKIPPED_VERSION_KEY, version);
  } catch {
    // Storage can be unavailable (private mode, cleared site data); skipping is
    // a convenience, so failing silently just means the reminder comes back.
  }
}

/** Split a Markdown release body into display lines, dropping headings and blanks. */
export function releaseNotesFromBody(body: string | undefined): string[] {
  if (!body) return [];
  return body
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter((line) => line && !line.startsWith("#") && line !== "---");
}

const INITIAL = {
  status: "idle" as UpdaterStatus,
  open: false,
  currentVersion: "",
  newVersion: "",
  notes: [] as string[],
  progress: 0,
  error: null as string | null,
};

/** App update store; see the module docs. */
export const useUpdaterStore = create<UpdaterState>()((set, get) => ({
  ...INITIAL,

  checkForUpdate: async ({ manual = false } = {}) => {
    const { status } = get();
    if (status === "checking" || status === "downloading") return "busy";
    set({ status: "checking", error: null });
    try {
      const update = await check();
      if (!update) {
        set({ status: "up-to-date" });
        return "up-to-date";
      }
      if (!manual && readSkipped() === update.version) {
        set({ status: "idle" });
        return "skipped";
      }
      pending = update;
      set({
        status: "available",
        open: true,
        currentVersion: update.currentVersion,
        newVersion: update.version,
        notes: releaseNotesFromBody(update.body),
        progress: 0,
      });
      return "available";
    } catch (err) {
      logger.error("Updater", "Update check failed", err);
      set({ status: "error", error: String(err) });
      return "error";
    }
  },

  install: async () => {
    if (!pending) return;
    set({ status: "downloading", progress: 0, error: null, open: true });
    let total = 0;
    let received = 0;
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          if (total > 0) set({ progress: Math.min(100, (received / total) * 100) });
        } else {
          set({ progress: 100 });
        }
      });
      set({ status: "ready", progress: 100 });
    } catch (err) {
      logger.error("Updater", "Update install failed", err);
      set({ status: "error", error: String(err) });
    }
  },

  restart: async () => {
    try {
      await relaunch();
    } catch (err) {
      logger.error("Updater", "Relaunch failed", err);
      set({ status: "error", error: String(err) });
    }
  },

  dismiss: () => set({ open: false }),

  skip: () => {
    writeSkipped(get().newVersion);
    set({ open: false, status: "idle" });
  },
}));

/** Reset the store and drop any pending update. Test-only. */
export function resetUpdaterStore(): void {
  pending = null;
  useUpdaterStore.setState(INITIAL);
}
