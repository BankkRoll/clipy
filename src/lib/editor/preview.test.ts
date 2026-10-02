import { describe, it, expect } from "vitest";
import {
  buildTransformCss,
  captionWordStyle,
  describeMediaError,
  fadeFactor,
  mediaElementVolume,
  outlineShadow,
  previewOpacity,
} from "./preview";
import { makeClip } from "@/test/editor-fixtures";
import type { TextProperties } from "@/types/editor";

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

describe("describeMediaError", () => {
  it.each([
    [4, "Media format not supported or file not found"],
    [2, "Network error loading media"],
    [3, "Media decoding failed"],
    [1, "Failed to load media"],
    [undefined, "Failed to load media"],
  ])("code %s", (code, message) => {
    expect(describeMediaError(code)).toBe(message);
  });
});

describe("caption styling", () => {
  const text: TextProperties = {
    content: "hi",
    fontFamily: "Arial",
    fontSize: 48,
    fontWeight: 400,
    color: "#fff",
    backgroundColor: "transparent",
    align: "center",
    verticalAlign: "bottom",
    highlightColor: "#ff0",
  };

  it("outlineShadow draws an outline only for a visible color", () => {
    expect(outlineShadow(undefined)).toBe("0 2px 4px rgba(0,0,0,0.5)");
    expect(outlineShadow("transparent")).toBe("0 2px 4px rgba(0,0,0,0.5)");
    const outlined = outlineShadow("#000");
    expect(outlined.match(/#000/g)).toHaveLength(8);
  });

  it("inactive words are unstyled", () => {
    expect(captionWordStyle(text, false)).not.toHaveProperty("color");
    expect(captionWordStyle({ ...text, highlightStyle: "none" }, true)).not.toHaveProperty("color");
    const { highlightColor: _h, ...noColor } = text;
    expect(captionWordStyle(noColor, true)).not.toHaveProperty("color");
  });

  it("defaults to a color highlight", () => {
    expect(captionWordStyle(text, true)).toMatchObject({ color: "#ff0" });
    expect(captionWordStyle({ ...text, highlightStyle: "color" }, true)).toMatchObject({
      color: "#ff0",
    });
  });

  it("box puts the background behind the active word only", () => {
    const style = captionWordStyle({ ...text, highlightStyle: "box" }, true);
    expect(style).toMatchObject({ backgroundColor: "#ff0" });
    expect(style).not.toHaveProperty("color");
  });

  it("scale enlarges the active word", () => {
    expect(captionWordStyle({ ...text, highlightStyle: "scale" }, true)).toMatchObject({
      color: "#ff0",
      transform: "scale(1.15)",
    });
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
