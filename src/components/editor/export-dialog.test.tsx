import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportDialog, type ExportDialogProps } from "@/components/editor/export-dialog";
import { mockBackend } from "@/test/tauri";
import type { AppSettings } from "@/hooks/useSettings";

const settings = {
  download: { crfQuality: 26, encodingPreset: "fast", videoCodec: "h265" },
  advanced: { hardwareAcceleration: false, hardwareAccelerationType: "nvenc" },
  editor: { snapToClips: true, snapToPlayhead: true },
} as unknown as AppSettings;

function setup(props: Partial<ExportDialogProps> = {}) {
  const onExport = vi.fn();
  const onCancel = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <ExportDialog
      open
      onOpenChange={onOpenChange}
      projectName="Cut"
      onExport={onExport}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onExport, onCancel, onOpenChange, user, ...utils };
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("ExportDialog", () => {
  it("prefills encoder options from backend settings", async () => {
    const { user, onExport } = setup({ settings });
    expect(screen.getByTestId("crf-value")).toHaveTextContent("26");
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Video codec" })).toHaveTextContent("H.265/HEVC");

    await user.type(screen.getByLabelText("Output location"), "C:\\o.mp4");
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport).toHaveBeenCalledWith({
      format: "mp4",
      videoCodec: "h265",
      audioCodec: "aac",
      audioBitrate: "192",
      resolution: "original",
      frameRate: "original",
      crfQuality: 26,
      encodingPreset: "fast",
      hardwareAcceleration: false,
      hardwareAccelerationType: "nvenc",
      outputPath: "C:\\o.mp4",
    });
  });

  it("uses defaults while settings are not loaded", () => {
    setup();
    expect(screen.getByTestId("crf-value")).toHaveTextContent("23");
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("switching to WebM moves codecs to compatible ones and disables the rest", async () => {
    const { user, onExport } = setup();
    await choose(user, "Format", "WebM");
    expect(screen.getByRole("combobox", { name: "Video codec" })).toHaveTextContent("VP9");

    await user.click(screen.getByRole("combobox", { name: "Video codec" }));
    expect(await screen.findByRole("option", { name: "H.264" })).toHaveAttribute("data-disabled");
    expect(screen.getByRole("option", { name: "AV1" })).not.toHaveAttribute("data-disabled");
    await user.click(screen.getByRole("option", { name: "AV1" }));

    await user.click(screen.getByRole("button", { name: /Advanced Settings/ }));
    expect(screen.getByRole("combobox", { name: "Audio codec" })).toHaveTextContent("Opus");

    await user.type(screen.getByLabelText("Output location"), "C:\\o.webm");
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({
      format: "webm",
      videoCodec: "av1",
      audioCodec: "opus",
    });
  });

  it("MKV accepts any codec and keeps the current choice", async () => {
    const { user } = setup();
    await choose(user, "Format", "MKV");
    expect(screen.getByRole("combobox", { name: "Video codec" })).toHaveTextContent("H.264");
  });

  it("blocks an incompatible prefilled combination with an explanation", async () => {
    const vp9 = {
      ...settings,
      download: { ...settings.download, videoCodec: "vp9" },
    } as AppSettings;
    const { user } = setup({ settings: vp9 });
    expect(screen.getByRole("alert")).toHaveTextContent("MP4 does not support the VP9 video codec");
    await user.type(screen.getByLabelText("Output location"), "C:\\o.mp4");
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("browses for an output file with the format's extension", async () => {
    const backend = mockBackend({ "plugin:dialog|save": () => "C:\\picked.mp4" });
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Browse for output file" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Output location")).toHaveValue("C:\\picked.mp4")
    );
    expect(backend.callsTo("plugin:dialog|save")[0]!.args.options).toMatchObject({
      defaultPath: "Cut.mp4",
      filters: [
        { name: "Video", extensions: ["mp4"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    backend.on("plugin:dialog|save", () => null);
    await user.click(screen.getByRole("button", { name: "Browse for output file" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|save")).toHaveLength(2));
    expect(screen.getByLabelText("Output location")).toHaveValue("C:\\picked.mp4");
  });

  it("advanced settings: preset, hardware acceleration, audio and output options", async () => {
    const { user, onExport } = setup();
    await user.click(screen.getByRole("button", { name: /Advanced Settings/ }));
    await choose(user, "Encoding speed", "Slow");
    await choose(user, "Acceleration type", "NVIDIA NVENC");
    await user.click(screen.getByRole("switch", { name: "Hardware acceleration" }));
    expect(screen.queryByRole("combobox", { name: "Acceleration type" })).toBeNull();
    await choose(user, "Audio codec", "FLAC");
    await choose(user, "Audio bitrate", "320 kbps");
    await choose(user, "Resolution", "720p HD");
    await choose(user, "Frame rate", "60 fps");
    fireEvent.keyDown(document.querySelector('[aria-label="Quality"] [role="slider"]')!, {
      key: "Home",
    });
    expect(screen.getByText("Excellent")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Output location"), "x.mp4");
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({
      encodingPreset: "slow",
      hardwareAcceleration: false,
      audioCodec: "flac",
      audioBitrate: "320",
      resolution: "720p",
      frameRate: "60",
      crfQuality: 18,
    });
  });

  it("closes from the footer Cancel button", async () => {
    const { user, onOpenChange } = setup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows progress while exporting and cancels", async () => {
    const { user, onCancel, rerender } = setup({
      exporting: true,
      exportProgress: { status: "preparing", progress: 0 },
    });
    expect(screen.getByText("Preparing export...")).toBeInTheDocument();
    expect(screen.queryByText(/ETA/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Export" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel Export" }));
    expect(onCancel).toHaveBeenCalled();

    rerender(
      <ExportDialog
        open
        onOpenChange={vi.fn()}
        onExport={vi.fn()}
        onCancel={onCancel}
        exporting
        exportProgress={{ status: "finalizing", progress: 99.6, estimatedTime: 61 }}
      />
    );
    expect(screen.getByText("Finalizing...")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("ETA: 2m")).toBeInTheDocument();
    expect(screen.getByText(/Configure export settings for "Untitled"/)).toBeInTheDocument();

    rerender(
      <ExportDialog open onOpenChange={vi.fn()} onExport={vi.fn()} onCancel={onCancel} exporting />
    );
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
