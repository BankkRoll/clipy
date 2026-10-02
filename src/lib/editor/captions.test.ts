import { describe, it, expect } from "vitest";
import { MIN_CAPTION_DURATION, buildCaptionClips } from "./captions";
import { makeClip } from "@/test/editor-fixtures";
import type { RawCaptionResult } from "@/types/captions";

const raw = (words: [string, number, number][]): RawCaptionResult => ({
  language: "en",
  model: "base.en",
  words: words.map(([text, start_ms, end_ms]) => ({ text, start_ms, end_ms, confidence: 0.9 })),
});

describe("buildCaptionClips", () => {
  it("offsets lines by the clip's timeline position and trim-in", () => {
    const video = makeClip({ startTime: 10, endTime: 30, sourceStart: 2, sourceEnd: 22 });
    const clips = buildCaptionClips(
      raw([
        ["hello", 3000, 3500],
        ["world", 3500, 4000],
      ]),
      "clean",
      video
    );
    expect(clips).toHaveLength(1);
    const [clip] = clips;
    expect(clip!.startTime).toBe(11);
    expect(clip!.endTime).toBe(12);
    expect(clip!.properties.text?.content).toBe("hello world");
    expect(clip!.properties.text?.captionWords).toEqual([
      { text: "hello", start: 0, end: 0.5 },
      { text: "world", start: 0.5, end: 1 },
    ]);
    // "clean" has no highlight, so no highlight color is attached.
    expect(clip!.properties.text).not.toHaveProperty("highlightColor");
    expect(clip!.properties.text?.highlightStyle).toBe("none");
  });

  it("applies style casing, highlight and outline without a whole-line box", () => {
    const video = makeClip({ startTime: 0, endTime: 10 });
    const [clip] = buildCaptionClips(raw([["go", 0, 500]]), "opus", video);
    const text = clip!.properties.text!;
    expect(text.highlightStyle).toBe("box");
    expect(text.highlightColor).toBe("#34D399");
    expect(text.outlineColor).toBe("#000000");
    expect(text.backgroundColor).toBe("transparent");

    const [loud] = buildCaptionClips(raw([["go", 0, 500]]), "hormozi", video);
    expect(loud!.properties.text?.content).toBe("GO");
    expect(loud!.properties.text?.captionWords?.[0]?.text).toBe("GO");
  });

  it("splits lines by the style's word limit and enforces a minimum duration", () => {
    const video = makeClip({ startTime: 0, endTime: 60 });
    const words: [string, number, number][] = Array.from({ length: 5 }, (_, i) => [
      `w${i}`,
      i * 50,
      i * 50 + 40,
    ]);
    const clips = buildCaptionClips(raw(words), "hormozi", video); // 4 words per line
    expect(clips).toHaveLength(2);
    expect(clips[0]!.endTime - clips[0]!.startTime).toBe(MIN_CAPTION_DURATION);
    expect(clips[0]!.sourceEnd).toBe(MIN_CAPTION_DURATION);
  });

  it("drops lines outside the clip's trimmed source and maps through speed", () => {
    const video = makeClip({
      startTime: 0,
      endTime: 5,
      sourceStart: 10,
      sourceEnd: 20,
      properties: { speed: 2 },
    });
    const clips = buildCaptionClips(
      raw([
        ["before", 1000, 2000],
        ["inside", 12000, 14000],
        ["after", 25000, 26000],
      ]),
      "clean",
      video
    );
    expect(clips).toHaveLength(1);
    expect(clips[0]!.startTime).toBe(1);
    expect(clips[0]!.endTime).toBe(2);
  });

  it("falls back to a generic name for empty text", () => {
    const video = makeClip({ startTime: 0, endTime: 10 });
    const [clip] = buildCaptionClips(raw([["  ", 0, 500]]), "clean", video);
    expect(clip!.name).toBe("Caption");
  });

  it("treats a zero clip speed as 1x", () => {
    const video = makeClip({ startTime: 0, endTime: 10, properties: { speed: 0 } });
    const [clip] = buildCaptionClips(raw([["a", 1000, 2000]]), "clean", video);
    expect(clip!.startTime).toBe(1);
  });
});
