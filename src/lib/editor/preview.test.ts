import { describe, it, expect } from "vitest";
import { buildTransformCss, fadeFactor, mediaElementVolume, previewOpacity } from "./preview";
import { makeClip } from "@/test/editor-fixtures";

const canvas = { width: 1920, height: 1080 };

describe("buildTransformCss", () => {
  it("is undefined for the identity transform", () => {
    expect(buildTransformCss({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }, canvas)).toBe(
      undefined
    );
  });

  it("expresses canvas offsets as container-relative units", () => {
    expect(
      buildTransformCss({ x: 192, y: -108, scaleX: 2, scaleY: 0.5, rotation: 45 }, canvas)
    ).toBe("translate(10cqw, -10cqh) scale(2, 0.5) rotate(45deg)");
  });
});

describe("fades", () => {
  const clip = makeClip({
    startTime: 10,
    endTime: 20,
    properties: { fadeIn: 2, fadeOut: 4, opacity: 0.5 },
  });

  it("ramps in, holds, and ramps out", () => {
    expect(fadeFactor(clip, 10)).toBe(0);
    expect(fadeFactor(clip, 11)).toBe(0.5);
    expect(fadeFactor(clip, 14)).toBe(1);
    expect(fadeFactor(clip, 18)).toBe(0.5);
    expect(fadeFactor(clip, 21)).toBe(0);
  });

  it("is 1 without fades", () => {
    expect(fadeFactor(makeClip(), 0)).toBe(1);
  });

  it("previewOpacity multiplies opacity by the fade", () => {
    expect(previewOpacity(clip, 11)).toBe(0.25);
    expect(previewOpacity(clip, 15)).toBe(0.5);
    expect(previewOpacity(makeClip({ properties: { opacity: 3 } }), 1)).toBe(1);
  });
});

describe("mediaElementVolume", () => {
  it("is 0 when muted and honours a 0 clip volume", () => {
    const clip = makeClip();
    expect(mediaElementVolume({ master: 1, muted: true, clip, time: 1 })).toBe(0);
    const silent = makeClip({ properties: { volume: 0 } });
    expect(mediaElementVolume({ master: 1, muted: false, clip: silent, time: 1 })).toBe(0);
  });

  it("clamps boosted clip volume to the media element maximum", () => {
    const loud = makeClip({ properties: { volume: 2 } });
    expect(mediaElementVolume({ master: 1, muted: false, clip: loud, time: 1 })).toBe(1);
    expect(mediaElementVolume({ master: 0.25, muted: false, clip: loud, time: 1 })).toBe(0.5);
  });

  it("applies the fade envelope", () => {
    const clip = makeClip({ startTime: 0, endTime: 10, properties: { fadeIn: 2 } });
    expect(mediaElementVolume({ master: 1, muted: false, clip, time: 1 })).toBe(0.5);
  });
});
