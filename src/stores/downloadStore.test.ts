import { describe, it, expect, beforeEach } from "vitest";
import { useDownloadStore } from "@/stores/downloadStore";
import { type Download } from "@/types/download";

// Helper: build the payload for addDownloadWithId (everything except id + createdAt).
function makeDownload(overrides: Partial<Omit<Download, "id" | "createdAt">> = {}): Omit<
  Download,
  "id" | "createdAt"
> {
  return {
    videoId: "vid",
    title: "Test Video",
    thumbnail: "",
    url: "https://youtu.be/abc",
    status: "pending",
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speed: 0,
    eta: 0,
    quality: "1080",
    format: "mp4",
    outputPath: "",
    error: null,
    completedAt: null,
    duration: 0,
    channel: "",
    ...overrides,
  };
}

// Reset store state before every test for isolation.
beforeEach(() => {
  useDownloadStore.setState({ downloads: [], history: [], activeDownloads: 0 });
});

describe("addDownload", () => {
  it("adds a pending download and returns an id", () => {
    const full = makeDownload();
    const { status, progress, ...rest } = full;
    void status;
    void progress;
    const id = useDownloadStore.getState().addDownload(rest);

    const { downloads } = useDownloadStore.getState();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.id).toBe(id);
    expect(downloads[0]?.status).toBe("pending");
    expect(downloads[0]?.progress).toBe(0);
  });
});

describe("addDownloadWithId", () => {
  it("adds a download with the provided id", () => {
    useDownloadStore.getState().addDownloadWithId("my-id", makeDownload());
    const { downloads } = useDownloadStore.getState();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.id).toBe("my-id");
  });

  it("increments activeDownloads when status is downloading", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "downloading" }));
    expect(useDownloadStore.getState().activeDownloads).toBe(1);
  });

  it("does not increment activeDownloads for pending status", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload({ status: "pending" }));
    expect(useDownloadStore.getState().activeDownloads).toBe(0);
  });
});

describe("updateProgress", () => {
  it("updates progress fields and sets status to downloading", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().updateProgress("a", 50, 500, 100, 10, 1000);

    const d = useDownloadStore.getState().downloads[0];
    expect(d?.progress).toBe(50);
    expect(d?.downloadedBytes).toBe(500);
    expect(d?.speed).toBe(100);
    expect(d?.eta).toBe(10);
    expect(d?.totalBytes).toBe(1000);
    expect(d?.status).toBe("downloading");
  });

  it("preserves existing totalBytes when omitted", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload({ totalBytes: 2000 }));
    useDownloadStore.getState().updateProgress("a", 25, 500, 50, 20);
    expect(useDownloadStore.getState().downloads[0]?.totalBytes).toBe(2000);
  });

  it("only affects the matching download", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().addDownloadWithId("b", makeDownload());
    useDownloadStore.getState().updateProgress("a", 50, 500, 100, 10);

    expect(useDownloadStore.getState().downloads[1]?.progress).toBe(0);
  });
});

describe("setStatus", () => {
  it("sets the status and recomputes activeDownloads", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "downloading" }));
    expect(useDownloadStore.getState().activeDownloads).toBe(1);

    useDownloadStore.getState().setStatus("a", "completed");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("completed");
    expect(useDownloadStore.getState().activeDownloads).toBe(0);
  });

  it("forces progress to 100 and sets completedAt when completed", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload({ progress: 40 }));
    useDownloadStore.getState().setStatus("a", "completed");

    const d = useDownloadStore.getState().downloads[0];
    expect(d?.progress).toBe(100);
    expect(d?.completedAt).not.toBeNull();
  });

  it("stores an error message when provided", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().setStatus("a", "failed", "boom");
    expect(useDownloadStore.getState().downloads[0]?.error).toBe("boom");
  });

  it("counts processing downloads as active", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().setStatus("a", "processing");
    expect(useDownloadStore.getState().activeDownloads).toBe(1);
  });
});

describe("removeDownload", () => {
  it("removes the matching download", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().addDownloadWithId("b", makeDownload());
    useDownloadStore.getState().removeDownload("a");

    const { downloads } = useDownloadStore.getState();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.id).toBe("b");
  });
});

describe("pause / resume / cancel / retry", () => {
  it("pauses only a downloading download", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "downloading" }));
    useDownloadStore.getState().pauseDownload("a");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("paused");
  });

  it("does not pause a pending download", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload({ status: "pending" }));
    useDownloadStore.getState().pauseDownload("a");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("pending");
  });

  it("resumes a paused download back to pending", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload({ status: "paused" }));
    useDownloadStore.getState().resumeDownload("a");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("pending");
  });

  it("cancels any download", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "downloading" }));
    useDownloadStore.getState().cancelDownload("a");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("cancelled");
  });

  it("retries a failed download, resetting error and progress", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "failed", progress: 80, error: "x" }));
    useDownloadStore.getState().retryDownload("a");

    const d = useDownloadStore.getState().downloads[0];
    expect(d?.status).toBe("pending");
    expect(d?.error).toBeNull();
    expect(d?.progress).toBe(0);
  });

  it("does not retry a completed download", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("a", makeDownload({ status: "completed" }));
    useDownloadStore.getState().retryDownload("a");
    expect(useDownloadStore.getState().downloads[0]?.status).toBe("completed");
  });
});

describe("clearCompleted", () => {
  it("moves finished downloads to history and keeps active ones", () => {
    useDownloadStore
      .getState()
      .addDownloadWithId("done", makeDownload({ status: "completed" }));
    useDownloadStore
      .getState()
      .addDownloadWithId("fail", makeDownload({ status: "failed" }));
    useDownloadStore
      .getState()
      .addDownloadWithId("active", makeDownload({ status: "downloading" }));

    useDownloadStore.getState().clearCompleted();

    const { downloads, history } = useDownloadStore.getState();
    expect(downloads.map((d) => d.id)).toEqual(["active"]);
    expect(history.map((d) => d.id).sort()).toEqual(["done", "fail"]);
  });
});

describe("clearHistory", () => {
  it("empties the history", () => {
    useDownloadStore.getState().addDownloadWithId("done", makeDownload({ status: "completed" }));
    useDownloadStore.getState().clearCompleted();
    expect(useDownloadStore.getState().history.length).toBeGreaterThan(0);

    useDownloadStore.getState().clearHistory();
    expect(useDownloadStore.getState().history).toEqual([]);
  });
});

describe("moveToHistory", () => {
  it("moves a download into history and removes it from downloads", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().moveToHistory("a");

    const { downloads, history } = useDownloadStore.getState();
    expect(downloads).toHaveLength(0);
    expect(history.map((d) => d.id)).toEqual(["a"]);
  });

  it("is a no-op for an unknown id", () => {
    useDownloadStore.getState().addDownloadWithId("a", makeDownload());
    useDownloadStore.getState().moveToHistory("missing");
    expect(useDownloadStore.getState().downloads).toHaveLength(1);
    expect(useDownloadStore.getState().history).toHaveLength(0);
  });
});
