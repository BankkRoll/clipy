import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

const check = vi.fn();
const relaunch = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }));

import {
  SKIPPED_VERSION_KEY,
  releaseNotesFromBody,
  resetUpdaterStore,
  useUpdaterStore,
} from "@/stores/updaterStore";

type Install = (onEvent: (e: DownloadEvent) => void) => Promise<void>;

function fakeUpdate(install: Install = async () => {}) {
  return {
    version: "2.1.0",
    currentVersion: "2.0.0",
    body: "## What's new\n- Faster exports\n\n* Smaller installer\n---",
    downloadAndInstall: vi.fn(install),
  };
}

const store = () => useUpdaterStore.getState();

beforeEach(() => {
  check.mockReset();
  relaunch.mockReset();
  resetUpdaterStore();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("releaseNotesFromBody", () => {
  it("keeps bullet text and drops headings, rules and blanks", () => {
    expect(releaseNotesFromBody("## H\n- a\r\n* b\n\nplain\n---")).toEqual(["a", "b", "plain"]);
    expect(releaseNotesFromBody(undefined)).toEqual([]);
  });
});

describe("checkForUpdate", () => {
  it("opens the dialog with version and notes when an update exists", async () => {
    check.mockResolvedValue(fakeUpdate());
    await expect(store().checkForUpdate()).resolves.toBe("available");
    expect(store()).toMatchObject({
      status: "available",
      open: true,
      currentVersion: "2.0.0",
      newVersion: "2.1.0",
      notes: ["Faster exports", "Smaller installer"],
    });
  });

  it("reports up to date when there is no update", async () => {
    check.mockResolvedValue(null);
    await expect(store().checkForUpdate()).resolves.toBe("up-to-date");
    expect(store().open).toBe(false);
  });

  it("records failures", async () => {
    check.mockRejectedValue("offline");
    await expect(store().checkForUpdate()).resolves.toBe("error");
    expect(store()).toMatchObject({ status: "error", error: "offline" });
  });

  it("refuses to start a second check while one is running", async () => {
    let resolve!: (v: null) => void;
    check.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = store().checkForUpdate();
    await expect(store().checkForUpdate()).resolves.toBe("busy");
    resolve(null);
    await first;
  });

  it("honours a skipped version for automatic checks only", async () => {
    localStorage.setItem(SKIPPED_VERSION_KEY, "2.1.0");
    check.mockResolvedValue(fakeUpdate());
    await expect(store().checkForUpdate()).resolves.toBe("skipped");
    expect(store().open).toBe(false);
    await expect(store().checkForUpdate({ manual: true })).resolves.toBe("available");
  });

  it("treats unavailable storage as nothing skipped", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    check.mockResolvedValue(fakeUpdate());
    await expect(store().checkForUpdate()).resolves.toBe("available");
    getItem.mockRestore();
  });
});

describe("install", () => {
  it("does nothing without a pending update", async () => {
    await store().install();
    expect(store().status).toBe("idle");
  });

  it("tracks download progress and ends ready", async () => {
    const progress: number[] = [];
    const update = fakeUpdate(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 200 } });
      onEvent({ event: "Progress", data: { chunkLength: 50 } });
      progress.push(store().progress);
      onEvent({ event: "Progress", data: { chunkLength: 150 } });
      progress.push(store().progress);
      onEvent({ event: "Finished" });
    });
    check.mockResolvedValue(update);
    await store().checkForUpdate();
    await store().install();
    expect(progress).toEqual([25, 100]);
    expect(store()).toMatchObject({ status: "ready", progress: 100 });
  });

  it("ignores progress when the size is unknown", async () => {
    check.mockResolvedValue(
      fakeUpdate(async (onEvent) => {
        onEvent({ event: "Started", data: {} });
        onEvent({ event: "Progress", data: { chunkLength: 10 } });
        expect(store().progress).toBe(0);
      })
    );
    await store().checkForUpdate();
    await store().install();
    expect(store().status).toBe("ready");
  });

  it("records install failures", async () => {
    check.mockResolvedValue(
      fakeUpdate(async () => {
        throw "signature mismatch";
      })
    );
    await store().checkForUpdate();
    await store().install();
    expect(store()).toMatchObject({ status: "error", error: "signature mismatch" });
  });
});

describe("restart, dismiss and skip", () => {
  it("relaunches, recording a failure", async () => {
    relaunch.mockResolvedValueOnce(undefined);
    await store().restart();
    expect(relaunch).toHaveBeenCalledTimes(1);
    relaunch.mockRejectedValueOnce("denied");
    await store().restart();
    expect(store()).toMatchObject({ status: "error", error: "denied" });
  });

  it("dismiss closes the dialog only", async () => {
    check.mockResolvedValue(fakeUpdate());
    await store().checkForUpdate();
    store().dismiss();
    expect(store()).toMatchObject({ open: false, status: "available" });
  });

  it("skip remembers the version and closes", async () => {
    check.mockResolvedValue(fakeUpdate());
    await store().checkForUpdate();
    store().skip();
    expect(localStorage.getItem(SKIPPED_VERSION_KEY)).toBe("2.1.0");
    expect(store()).toMatchObject({ open: false, status: "idle" });
  });

  it("skip survives unavailable storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    check.mockResolvedValue(fakeUpdate());
    await store().checkForUpdate();
    expect(() => store().skip()).not.toThrow();
    setItem.mockRestore();
  });
});
