import { describe, it, expect } from "vitest";
import { useDownloadStore } from "@/stores/downloadStore";
import { downloadFixture, downloadTaskFixture, progressFixture } from "@/test/fixtures";
import type { Download } from "@/types/download";

const store = () => useDownloadStore.getState();

function seed(...downloads: Download[]) {
  useDownloadStore.setState({ downloads });
}

function get(id = "d1") {
  return store().downloads.find((d) => d.id === id);
}

describe("addDownloadWithId", () => {
  it("adds a row under the backend id and counts it when running", () => {
    const { id: _id, createdAt: _c, ...rest } = downloadFixture({ status: "downloading" });
    store().addDownloadWithId("abc", rest);
    expect(get("abc")?.title).toBe("Never Gonna Give You Up");
    expect(get("abc")?.createdAt).toEqual(expect.any(String));
    expect(store().activeDownloads).toBe(1);
  });

  it("replaces an existing row with the same id instead of duplicating it", () => {
    seed(downloadFixture({ id: "abc", title: "old" }));
    const {
      id: _id,
      createdAt: _c,
      ...rest
    } = downloadFixture({ title: "new", status: "pending" });
    store().addDownloadWithId("abc", rest);
    expect(store().downloads).toHaveLength(1);
    expect(get("abc")?.title).toBe("new");
    expect(store().activeDownloads).toBe(0);
  });
});

describe("updateDownload", () => {
  it("merges fields into the matching row only", () => {
    seed(downloadFixture(), downloadFixture({ id: "d2" }));
    store().updateDownload("d1", { title: "changed" });
    expect(get()?.title).toBe("changed");
    expect(get("d2")?.title).toBe("Never Gonna Give You Up");
  });
});

describe("applyProgress", () => {
  it("copies in-flight progress, phase and message", () => {
    seed(downloadFixture({ status: "pending", error: "stale" }));
    store().applyProgress(progressFixture({ phase: "merging", message: "Merging..." }));
    expect(get()).toMatchObject({
      status: "downloading",
      progress: 42,
      downloadedBytes: 4200,
      totalBytes: 10000,
      speed: 1024,
      eta: 30,
      phase: "merging",
      message: "Merging...",
      error: null,
    });
    expect(store().activeDownloads).toBe(1);
  });

  it("records the real file path and 100% on completion", () => {
    seed(downloadFixture({ phase: "merging", message: "x" }));
    store().applyProgress(
      progressFixture({ status: "completed", progress: 99, filePath: "C:\\v\\a.mp4" })
    );
    expect(get()).toMatchObject({
      status: "completed",
      progress: 100,
      filePath: "C:\\v\\a.mp4",
      speed: 0,
      eta: 0,
      phase: undefined,
      message: undefined,
      error: null,
    });
    expect(get()?.completedAt).toEqual(expect.any(String));
    expect(store().activeDownloads).toBe(0);
  });

  it("keeps a previously known file path when the event has none", () => {
    seed(downloadFixture({ filePath: "C:\\v\\a.mp4" }));
    store().applyProgress(progressFixture({ status: "completed" }));
    expect(get()?.filePath).toBe("C:\\v\\a.mp4");
  });

  it("stores the failure message as the error", () => {
    seed(downloadFixture());
    store().applyProgress(progressFixture({ status: "failed", message: "HTTP 403" }));
    expect(get()).toMatchObject({ status: "failed", error: "HTTP 403", progress: 42 });
    expect(get()?.completedAt).toBeNull();
  });

  it("keeps an existing error when a failure arrives without a message", () => {
    seed(downloadFixture({ error: "earlier reason" }));
    store().applyProgress(progressFixture({ status: "failed" }));
    expect(get()?.error).toBe("earlier reason");
  });

  it("clears the error on cancellation", () => {
    seed(downloadFixture({ error: "x" }));
    store().applyProgress(progressFixture({ status: "cancelled" }));
    expect(get()).toMatchObject({ status: "cancelled", error: null });
  });

  it("ignores events for unknown downloads", () => {
    seed(downloadFixture());
    store().applyProgress(progressFixture({ downloadId: "nope" }));
    expect(get()?.status).toBe("downloading");
    expect(get()?.progress).toBe(0);
  });
});

describe("setStatus", () => {
  it("sets status and error and recomputes the active count", () => {
    seed(downloadFixture({ status: "processing" }));
    expect(store().activeDownloads).toBe(0); // seeding bypasses the counter
    store().setStatus("d1", "failed", "boom");
    expect(get()).toMatchObject({ status: "failed", error: "boom" });
    expect(store().activeDownloads).toBe(0);
  });

  it("forces 100% and a completion time on completed", () => {
    seed(downloadFixture({ progress: 50 }));
    store().setStatus("d1", "completed");
    expect(get()).toMatchObject({ status: "completed", progress: 100, error: null });
    expect(get()?.completedAt).toEqual(expect.any(String));
  });

  it("keeps progress and completedAt for non-completed statuses", () => {
    seed(downloadFixture({ progress: 50, completedAt: "t" }));
    store().setStatus("d1", "processing");
    expect(get()).toMatchObject({ progress: 50, completedAt: "t" });
    expect(store().activeDownloads).toBe(1);
  });
});

describe("removeDownload", () => {
  it("removes the row and remembers it as dismissed", () => {
    seed(downloadFixture(), downloadFixture({ id: "d2" }));
    store().removeDownload("d1");
    expect(store().downloads.map((d) => d.id)).toEqual(["d2"]);
    expect(store().dismissedIds).toEqual(["d1"]);
  });
});

describe("pause / resume / cancel / retry", () => {
  it("pauses only a downloading row", () => {
    seed(downloadFixture(), downloadFixture({ id: "d2", status: "pending" }));
    store().pauseDownload("d1");
    store().pauseDownload("d2");
    expect(get()?.status).toBe("paused");
    expect(get("d2")?.status).toBe("pending");
  });

  it("resumes only a paused row back to pending", () => {
    seed(downloadFixture({ status: "paused" }), downloadFixture({ id: "d2" }));
    store().resumeDownload("d1");
    store().resumeDownload("d2");
    expect(get()?.status).toBe("pending");
    expect(get("d2")?.status).toBe("downloading");
  });

  it("cancels any row", () => {
    seed(downloadFixture({ status: "pending" }));
    store().cancelDownload("d1");
    expect(get()?.status).toBe("cancelled");
  });

  it("retries failed and cancelled rows, resetting error and progress", () => {
    seed(
      downloadFixture({ status: "failed", error: "x", progress: 50 }),
      downloadFixture({ id: "d2", status: "cancelled" }),
      downloadFixture({ id: "d3", status: "completed" })
    );
    store().retryDownload("d1");
    store().retryDownload("d2");
    store().retryDownload("d3");
    expect(get()).toMatchObject({ status: "pending", error: null, progress: 0 });
    expect(get("d2")?.status).toBe("pending");
    expect(get("d3")?.status).toBe("completed");
  });
});

describe("clearCompleted", () => {
  it("drops finished rows and keeps the rest", () => {
    seed(
      downloadFixture({ id: "a", status: "completed" }),
      downloadFixture({ id: "b", status: "failed" }),
      downloadFixture({ id: "c", status: "cancelled" }),
      downloadFixture({ id: "d", status: "downloading" })
    );
    store().clearCompleted();
    expect(store().downloads.map((d) => d.id)).toEqual(["d"]);
    expect(store().activeDownloads).toBe(1);
  });
});

describe("syncFromBackend", () => {
  it("adds unknown tasks, labelling quality and keeping the directory as outputPath", () => {
    store().syncFromBackend([
      downloadTaskFixture(),
      downloadTaskFixture({ id: "a", quality: "best", options: { audioOnly: true } as never }),
      downloadTaskFixture({ id: "b", quality: "best" }),
    ]);
    expect(get()).toMatchObject({
      quality: "1080p",
      outputPath: "C:\\Users\\me\\Videos\\Clipy",
      filePath: undefined,
      progress: 10,
    });
    expect(get("a")?.quality).toBe("Audio");
    expect(get("b")?.quality).toBe("best");
    expect(store().activeDownloads).toBe(3);
  });

  it("treats a completed task's outputPath as the final file", () => {
    store().syncFromBackend([
      downloadTaskFixture({ status: "completed", progress: 97, outputPath: "C:\\v\\a.mp4" }),
    ]);
    expect(get()).toMatchObject({ progress: 100, filePath: "C:\\v\\a.mp4" });
  });

  it("does not invent a file path for a completed task without one", () => {
    store().syncFromBackend([downloadTaskFixture({ status: "completed", outputPath: "" })]);
    expect(get()?.filePath).toBeUndefined();
  });

  it("merges live fields into known rows without touching display fields", () => {
    seed(downloadFixture({ quality: "Audio", error: "kept", completedAt: "t0", filePath: "f" }));
    store().syncFromBackend([
      downloadTaskFixture({ status: "paused", progress: 55, quality: "best" }),
    ]);
    expect(get()).toMatchObject({
      quality: "Audio",
      status: "paused",
      progress: 55,
      error: "kept",
      completedAt: "t0",
      filePath: "f",
    });
  });

  it("prefers the backend error and completion time when present", () => {
    seed(downloadFixture());
    store().syncFromBackend([
      downloadTaskFixture({ status: "failed", error: "disk full", completedAt: "t1" }),
    ]);
    expect(get()).toMatchObject({ error: "disk full", completedAt: "t1" });
  });

  it("skips tasks the user dismissed", () => {
    seed(downloadFixture());
    store().removeDownload("d1");
    store().syncFromBackend([downloadTaskFixture()]);
    expect(store().downloads).toEqual([]);
  });

  it("keeps rows the backend no longer reports", () => {
    seed(downloadFixture({ id: "local", status: "cancelled" }));
    store().syncFromBackend([]);
    expect(get("local")).toBeDefined();
  });
});
