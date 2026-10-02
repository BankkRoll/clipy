import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DownloadItem, DownloadProgress } from "@/components/downloads";
import { downloadFixture } from "@/test/fixtures";
import type { DownloadPhase, DownloadStatus } from "@/types/download";

type ProgressProps = Parameters<typeof DownloadProgress>[0];

function progress(props: Partial<ProgressProps> = {}) {
  return render(
    <DownloadProgress
      status="downloading"
      progress={42}
      downloadedBytes={0}
      totalBytes={0}
      speed={0}
      eta={0}
      {...props}
    />
  );
}

describe("DownloadProgress", () => {
  it.each([
    ["merging", "Merging video and audio..."],
    ["embedding_metadata", "Embedding metadata..."],
    ["processing", "Processing..."],
  ] as const)("shows the %s phase as post-processing", (phase, label) => {
    progress({ phase });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("shows a generic processing label and prefers the backend message", () => {
    const { rerender } = progress({ status: "processing" });
    expect(screen.getByText("Processing video...")).toBeInTheDocument();
    rerender(
      <DownloadProgress
        status="processing"
        progress={0}
        downloadedBytes={0}
        totalBytes={0}
        speed={0}
        eta={0}
        message="Re-encoding to H.264"
      />
    );
    expect(screen.getByText("Re-encoding to H.264")).toBeInTheDocument();
  });

  it("shows fetching state from status or phase", () => {
    const { rerender } = progress({ status: "fetching" });
    expect(screen.getByText("Fetching video information...")).toBeInTheDocument();
    rerender(
      <DownloadProgress
        status="downloading"
        phase="fetching"
        message="Resolving formats"
        progress={0}
        downloadedBytes={0}
        totalBytes={0}
        speed={0}
        eta={0}
      />
    );
    expect(screen.getByText("Resolving formats")).toBeInTheDocument();
  });

  it.each(["pending", "paused", "completed", "failed", "cancelled"] as DownloadStatus[])(
    "renders nothing while %s",
    (status) => {
      const { container } = progress({ status });
      expect(container).toBeEmptyDOMElement();
    }
  );

  it("shows bytes, speed, ETA and a clamped percentage", () => {
    progress({ progress: 120, downloadedBytes: 1024, totalBytes: 2048, speed: 512, eta: 75 });
    expect(screen.getByText("1 KB / 2 KB")).toBeInTheDocument();
    expect(screen.getByText("512 Bytes/s")).toBeInTheDocument();
    expect(screen.getByText("1:15 left")).toBeInTheDocument();
    expect(screen.getByText("100% complete")).toBeInTheDocument();
    expect(screen.getByText("Downloading...")).toBeInTheDocument();
  });

  it("handles unknown totals and absurd ETAs", () => {
    const { rerender } = progress({ downloadedBytes: 2048, eta: 100000 });
    expect(screen.getByText("2 KB downloaded")).toBeInTheDocument();
    expect(screen.queryByText(/left$/)).toBeNull();
    rerender(
      <DownloadProgress
        status="downloading"
        progress={0}
        downloadedBytes={0}
        totalBytes={0}
        speed={0}
        eta={0}
      />
    );
    expect(screen.getByText("Starting...")).toBeInTheDocument();
  });

  it.each([
    ["downloading_video", "Downloading video..."],
    ["downloading_audio", "Downloading audio..."],
    ["downloading_subtitles", "Downloading subtitles..."],
    ["complete", "Complete"],
  ] as [DownloadPhase, string][])("labels the %s phase", (phase, label) => {
    progress({ phase });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("DownloadItem", () => {
  const handlers = () => ({
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onResume: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    onRemove: vi.fn(),
    onOpenFolder: vi.fn(),
    onViewLibrary: vi.fn(),
  });

  it("falls back to a placeholder when the thumbnail fails or is missing", () => {
    const { rerender } = render(<DownloadItem download={downloadFixture()} {...handlers()} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
    rerender(
      <DownloadItem download={downloadFixture({ id: "x", thumbnail: "" })} {...handlers()} />
    );
    expect(screen.getByTestId("thumbnail-placeholder")).toBeInTheDocument();
  });

  it("shows meta details only when known", () => {
    const { rerender } = render(
      <DownloadItem
        download={downloadFixture({ channel: "", duration: 0, completedAt: null })}
        {...handlers()}
      />
    );
    expect(screen.queryByText("Rick Astley")).toBeNull();
    rerender(
      <DownloadItem
        download={downloadFixture({
          status: "completed",
          completedAt: new Date().toISOString(),
        })}
        {...handlers()}
      />
    );
    expect(screen.getByText("Rick Astley")).toBeInTheDocument();
    expect(screen.getByText("3:33")).toBeInTheDocument();
    expect(screen.getByText("just now")).toBeInTheDocument();
    expect(screen.getByText("Download completed successfully!")).toBeInTheDocument();
  });
});
