import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEXT_DURATION,
  createMediaClip,
  createTextClip,
  defaultClipProperties,
  defaultTransform,
  pastedClip,
} from "./clips";
import { makeClip } from "@/test/editor-fixtures";

describe("clip factories", () => {
  it("defaultTransform is the identity", () => {
    expect(defaultTransform()).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 });
  });

  it("defaultClipProperties only includes text when given", () => {
    expect(defaultClipProperties()).not.toHaveProperty("text");
    expect(defaultClipProperties().volume).toBe(1);
    const text = createTextClip(0).properties.text!;
    expect(defaultClipProperties(text).text).toBe(text);
  });

  it("createMediaClip spans the whole source at full volume", () => {
    const clip = createMediaClip({
      type: "video",
      name: "a.mp4",
      sourcePath: "/a.mp4",
      startTime: 4,
      duration: 6,
    });
    expect(clip).toMatchObject({
      type: "video",
      startTime: 4,
      endTime: 10,
      sourceStart: 0,
      sourceEnd: 6,
      sourcePath: "/a.mp4",
    });
    // Imported video used to start muted (volume 0).
    expect(clip.properties.volume).toBe(1);
  });

  it("createTextClip starts at the given time with default text", () => {
    const clip = createTextClip(3);
    expect(clip.startTime).toBe(3);
    expect(clip.endTime).toBe(3 + DEFAULT_TEXT_DURATION);
    expect(clip.properties.text?.content).toBe("Enter your text here");
  });

  it("pastedClip strips ids, deep-copies and repositions", () => {
    const original = makeClip({ name: "Shot", startTime: 2, endTime: 5 });
    const pasted = pastedClip(original, 10);
    expect(pasted).not.toHaveProperty("id");
    expect(pasted).not.toHaveProperty("trackId");
    expect(pasted).toMatchObject({ name: "Shot (pasted)", startTime: 10, endTime: 13 });
    expect(pasted.properties).not.toBe(original.properties);
    expect(pasted.properties).toEqual(original.properties);
  });
});
