import { describe, it, expect } from "vitest";
import {
  PIXELS_PER_SECOND,
  MIN_TIMELINE_WIDTH,
  buildRulerMarkers,
  clampTime,
  collectSnapPoints,
  computeMoveStart,
  computeTrim,
  findActiveClip,
  findClip,
  getSourceTimeForClip,
  isCompatibleDrop,
  nextAppendStart,
  pixelToTime,
  rulerInterval,
  snapTime,
  timeToPixel,
  timelineWidth,
  trackIdAtY,
  trackTypeForClip,
} from "./timeline";
import { makeClip, makeTrack } from "@/test/editor-fixtures";

const identity = (t: number) => t;

describe("pixel/time conversion", () => {
  it("round-trips at any zoom", () => {
    expect(timeToPixel(2, 1)).toBe(2 * PIXELS_PER_SECOND);
    expect(timeToPixel(2, 2)).toBe(4 * PIXELS_PER_SECOND);
    expect(pixelToTime(timeToPixel(3.5, 0.5), 0.5)).toBeCloseTo(3.5);
  });

  it("timelineWidth never drops below the minimum", () => {
    expect(timelineWidth(0, 1)).toBe(MIN_TIMELINE_WIDTH);
    expect(timelineWidth(100, 1)).toBe(100 * PIXELS_PER_SECOND);
  });

  it("clampTime limits to [0, duration]", () => {
    expect(clampTime(-1, 10)).toBe(0);
    expect(clampTime(11, 10)).toBe(10);
    expect(clampTime(5, 10)).toBe(5);
  });
});

describe("findActiveClip", () => {
  const a = makeClip({ startTime: 0, endTime: 5 });
  const b = makeClip({ startTime: 5, endTime: 10 });
  const audio = makeClip({ type: "audio", startTime: 0, endTime: 10 });

  it("returns the clip covering the time on a track of the requested type", () => {
    const tracks = [makeTrack({ clips: [a, b] }), makeTrack({ type: "audio", clips: [audio] })];
    expect(findActiveClip(tracks, 2, "video")?.id).toBe(a.id);
    expect(findActiveClip(tracks, 5, "video")?.id).toBe(b.id);
    expect(findActiveClip(tracks, 3, "audio")?.id).toBe(audio.id);
    expect(findActiveClip(tracks, 10, "video")).toBeNull();
  });

  it("skips muted tracks so a lower visible track shows through", () => {
    const top = makeTrack({ muted: true, clips: [a] });
    const lower = makeClip({ startTime: 0, endTime: 5 });
    const tracks = [top, makeTrack({ clips: [lower] })];
    expect(findActiveClip(tracks, 1, "video")?.id).toBe(lower.id);
  });
});

describe("findClip", () => {
  it("finds a clip and its track, or null", () => {
    const clip = makeClip();
    const track = makeTrack({ clips: [clip] });
    expect(findClip([track], clip.id)?.track.id).toBe(track.id);
    expect(findClip([track], "nope")).toBeNull();
  });
});

describe("getSourceTimeForClip", () => {
  it("maps timeline time through trim-in and speed, capped at trim-out", () => {
    const clip = makeClip({ startTime: 10, endTime: 20, sourceStart: 5, sourceEnd: 30 });
    expect(getSourceTimeForClip(clip, 12)).toBe(7);
    const fast = makeClip({
      startTime: 10,
      endTime: 20,
      sourceStart: 5,
      sourceEnd: 12,
      properties: { speed: 2 },
    });
    expect(getSourceTimeForClip(fast, 12)).toBe(9);
    expect(getSourceTimeForClip(fast, 19)).toBe(12);
  });

  it("treats a zero speed as normal speed", () => {
    const clip = makeClip({ properties: { speed: 0 } });
    expect(getSourceTimeForClip(clip, 3)).toBe(3);
  });
});

describe("snapping", () => {
  const dragged = makeClip({ startTime: 0, endTime: 4 });
  const other = makeClip({ startTime: 10, endTime: 15 });
  const tracks = [makeTrack({ clips: [dragged, other] })];

  it("collects 0, duration and other clip edges, excluding the dragged clip", () => {
    const points = collectSnapPoints(tracks, { zoom: 1, duration: 30, excludeClipId: dragged.id });
    expect(points).toEqual([0, 30, 10, 15]);
  });

  it("omits clip edges when snapToClips is off and adds the playhead when on", () => {
    expect(
      collectSnapPoints(tracks, {
        zoom: 1,
        duration: 30,
        snapToClips: false,
        snapToPlayhead: true,
        playhead: 7,
      })
    ).toEqual([0, 30, 7]);
    expect(
      collectSnapPoints(tracks, { zoom: 1, duration: 30, snapToClips: false, snapToPlayhead: true })
    ).toEqual([0, 30]);
  });

  it("snaps to the nearest point within the pixel threshold", () => {
    // threshold at zoom 1 = 10px / 50px/s = 0.2s
    expect(snapTime(9.9, tracks, { zoom: 1, duration: 30 })).toBe(10);
    expect(snapTime(9.5, tracks, { zoom: 1, duration: 30 })).toBe(9.5);
    // At higher zoom the threshold in seconds shrinks.
    expect(snapTime(9.9, tracks, { zoom: 10, duration: 30 })).toBe(9.9);
  });

  it("prefers the closest of several candidate points", () => {
    const close = [makeTrack({ clips: [makeClip({ startTime: 1, endTime: 1.1 })] })];
    expect(snapTime(1.08, close, { zoom: 1, duration: 30 })).toBe(1.1);
  });

  it("honours snapToPlayhead", () => {
    const opts = { zoom: 1, duration: 30, snapToClips: false, playhead: 7 };
    expect(snapTime(7.1, tracks, { ...opts, snapToPlayhead: true })).toBe(7);
    expect(snapTime(7.1, tracks, { ...opts, snapToPlayhead: false })).toBe(7.1);
  });
});

describe("computeMoveStart", () => {
  const snapTo = (point: number) => (t: number) => (Math.abs(t - point) < 0.2 ? point : t);

  it("clamps at 0 and applies the delta", () => {
    expect(computeMoveStart(2, -5, 3, identity)).toBe(0);
    expect(computeMoveStart(2, 1.5, 3, identity)).toBe(3.5);
  });

  it("snaps the start edge first", () => {
    expect(computeMoveStart(0, 4.9, 3, snapTo(5))).toBe(5);
  });

  it("falls back to snapping the end edge", () => {
    // start 6.9 does not snap; end 9.9 snaps to 10 -> start 7
    expect(computeMoveStart(0, 6.9, 3, snapTo(10))).toBe(7);
  });

  it("never returns a negative start when the end snaps early", () => {
    expect(computeMoveStart(0, 0.1, 3, () => 1)).toBe(1);
    expect(computeMoveStart(0, 0, 3, (t) => (t === 0 ? 0 : 1))).toBe(0);
  });
});

describe("computeTrim", () => {
  it("trims the start edge and moves the source in-point", () => {
    const clip = makeClip({ startTime: 2, endTime: 10, sourceStart: 2, sourceEnd: 10 });
    expect(
      computeTrim({ clip, edge: "start", initialTime: 2, deltaTime: 1, snap: identity })
    ).toEqual({ startTime: 3, sourceStart: 3 });
  });

  it("scales the source change by playback speed", () => {
    const clip = makeClip({
      startTime: 2,
      endTime: 10,
      sourceStart: 4,
      sourceEnd: 20,
      properties: { speed: 2 },
    });
    expect(
      computeTrim({ clip, edge: "start", initialTime: 2, deltaTime: 1, snap: identity })
    ).toEqual({ startTime: 3, sourceStart: 6 });
    expect(
      computeTrim({ clip, edge: "end", initialTime: 10, deltaTime: -2, snap: identity })
    ).toEqual({ endTime: 8, sourceEnd: 16 });
  });

  it("cannot extend a media clip before the start of its source", () => {
    const clip = makeClip({ startTime: 5, endTime: 10, sourceStart: 1, sourceEnd: 6 });
    const update = computeTrim({
      clip,
      edge: "start",
      initialTime: 5,
      deltaTime: -4,
      snap: identity,
    });
    expect(update).toEqual({ startTime: 4, sourceStart: 0 });
  });

  it("lets image/text clips extend back to 0", () => {
    const clip = makeClip({
      type: "image",
      startTime: 5,
      endTime: 10,
      sourceStart: 0,
      sourceEnd: 5,
    });
    expect(
      computeTrim({ clip, edge: "start", initialTime: 5, deltaTime: -9, snap: identity }).startTime
    ).toBe(0);
  });

  it("keeps a minimum duration on both edges and applies snapping", () => {
    const clip = makeClip({ startTime: 0, endTime: 1, sourceStart: 0, sourceEnd: 1 });
    expect(
      computeTrim({ clip, edge: "start", initialTime: 0, deltaTime: 5, snap: identity }).startTime
    ).toBeCloseTo(0.9);
    expect(
      computeTrim({ clip, edge: "end", initialTime: 1, deltaTime: -5, snap: identity }).endTime
    ).toBe(0.1);
    expect(
      computeTrim({ clip, edge: "end", initialTime: 1, deltaTime: 0.95, snap: () => 2 })
    ).toEqual({
      endTime: 2,
      sourceEnd: 2,
    });
    expect(
      computeTrim({ clip, edge: "end", initialTime: 1, deltaTime: 0.5, snap: () => 0 }).endTime
    ).toBe(0.1);
  });
});

describe("ruler", () => {
  it("picks finer intervals as zoom increases (0.25s reachable above 4x)", () => {
    expect(rulerInterval(0.2)).toBe(10);
    expect(rulerInterval(0.4)).toBe(5);
    expect(rulerInterval(0.8)).toBe(2);
    expect(rulerInterval(1)).toBe(1);
    expect(rulerInterval(3)).toBe(0.5);
    expect(rulerInterval(5)).toBe(0.25);
  });

  it("builds evenly spaced markers without float drift, alternating majors", () => {
    const markers = buildRulerMarkers(1, 5);
    expect(markers.map((m) => m.time)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(markers.map((m) => m.major)).toEqual([true, false, true, false, true]);
    expect(markers[0]!.label).toBe("0:00");
  });

  it("marks every tick major for coarse intervals", () => {
    expect(buildRulerMarkers(20, 0.4).every((m) => m.major)).toBe(true);
  });
});

describe("placement and drop rules", () => {
  it("nextAppendStart is the latest clip end, or 0", () => {
    expect(nextAppendStart([])).toBe(0);
    expect(
      nextAppendStart([
        makeTrack({ clips: [makeClip({ endTime: 5 })] }),
        makeTrack({ clips: [makeClip({ endTime: 12 })] }),
      ])
    ).toBe(12);
  });

  it("trackTypeForClip puts images on video tracks", () => {
    expect(trackTypeForClip("image")).toBe("video");
    expect(trackTypeForClip("audio")).toBe("audio");
  });

  it("isCompatibleDrop enforces type, lock and different-track rules", () => {
    const video = makeTrack({ id: "v2", type: "video" });
    const effect = makeTrack({ id: "e", type: "effect" });
    const audio = makeTrack({ id: "a", type: "audio" });
    const text = makeTrack({ id: "t", type: "text" });
    const locked = makeTrack({ id: "lv", type: "video", locked: true });
    expect(isCompatibleDrop("video", video, "v1")).toBe(true);
    expect(isCompatibleDrop("image", effect, "v1")).toBe(true);
    expect(isCompatibleDrop("video", audio, "v1")).toBe(false);
    expect(isCompatibleDrop("audio", audio, "a0")).toBe(true);
    expect(isCompatibleDrop("text", text, "t0")).toBe(true);
    expect(isCompatibleDrop("text", video, "t0")).toBe(false);
    expect(isCompatibleDrop("video", video, "v2")).toBe(false);
    expect(isCompatibleDrop("video", locked, "v1")).toBe(false);
  });

  it("trackIdAtY hit-tests lane rectangles", () => {
    const lane = (top: number, bottom: number) =>
      ({ getBoundingClientRect: () => ({ top, bottom }) }) as unknown as Element;
    const lanes: [string, Element][] = [
      ["a", lane(0, 50)],
      ["b", lane(50, 100)],
    ];
    expect(trackIdAtY(lanes, 25)).toBe("a");
    expect(trackIdAtY(lanes, 75)).toBe("b");
    expect(trackIdAtY(lanes, 150)).toBeNull();
  });
});
