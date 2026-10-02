import { describe, it, expect } from "vitest";
import { MEDIA_DIALOG_FILTERS, classifyMediaExtension, fileNameFromPath } from "./media";

describe("classifyMediaExtension", () => {
  it.each([
    ["C:\\clips\\Intro.MP4", "video"],
    ["/x/y.webm", "video"],
    ["song.m4a", "audio"],
    ["voice.WAV", "audio"],
    ["photo.jpeg", "image"],
    ["sticker.webp", "image"],
  ])("%s -> %s", (path, kind) => {
    expect(classifyMediaExtension(path)).toBe(kind);
  });

  it("rejects unknown and extension-less files", () => {
    expect(classifyMediaExtension("notes.txt")).toBeNull();
    expect(classifyMediaExtension("README")).toBeNull();
    // A dot in a directory name must not be mistaken for an extension.
    expect(classifyMediaExtension("/v1.mp4/file")).toBeNull();
  });
});

describe("fileNameFromPath", () => {
  it("handles both separators and empty input", () => {
    expect(fileNameFromPath("C:\\a\\b.mp4")).toBe("b.mp4");
    expect(fileNameFromPath("/a/b.mp4")).toBe("b.mp4");
    expect(fileNameFromPath("")).toBe("Media");
  });
});

describe("MEDIA_DIALOG_FILTERS", () => {
  it("the combined filter includes every per-type extension", () => {
    const [all, ...rest] = MEDIA_DIALOG_FILTERS;
    for (const f of rest) {
      for (const ext of f.extensions) expect(all!.extensions).toContain(ext);
    }
  });
});
