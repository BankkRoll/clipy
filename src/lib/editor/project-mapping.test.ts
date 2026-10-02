import { describe, it, expect } from "vitest";
import { fromBackendProject, toBackendProject } from "./project-mapping";
import { makeClip, makeProject, makeTrack } from "@/test/editor-fixtures";
import { createTextClip } from "./clips";

function sampleProject() {
  const video = makeClip({
    name: "Shot",
    startTime: 0,
    endTime: 8,
    properties: {
      filters: [{ id: "f1", type: "brightness", enabled: true, params: { value: 1.3 } }],
      transform: { x: 10, y: -5, scaleX: 1.5, scaleY: 1.5, rotation: 12 },
      fadeIn: 0.5,
    },
  });
  const text = { ...makeClip({ type: "text", sourcePath: "" }), ...createTextClip(2) };
  return makeProject([
    makeTrack({ id: "tv", type: "video", clips: [video] }),
    makeTrack({ id: "tt", type: "text", name: "Text 1", muted: true, locked: true, clips: [text] }),
  ]);
}

describe("project mapping", () => {
  it("renames type keys and uses null for absent text", () => {
    const backend = toBackendProject(sampleProject());
    const [videoTrack, textTrack] = backend.tracks;
    expect(videoTrack!.trackType).toBe("video");
    expect(videoTrack!.clips[0]!.clipType).toBe("video");
    expect(videoTrack!.clips[0]!.properties.filters[0]).toEqual({
      id: "f1",
      filterType: "brightness",
      enabled: true,
      params: { value: 1.3 },
    });
    expect(videoTrack!.clips[0]!.properties.text).toBeNull();
    expect(textTrack!.clips[0]!.properties.text?.content).toBe("Enter your text here");
    expect(textTrack).toMatchObject({ muted: true, locked: true, name: "Text 1" });
  });

  it("round-trips without loss", () => {
    const project = sampleProject();
    expect(fromBackendProject(toBackendProject(project))).toEqual(project);
  });

  it("survives a JSON round trip like save/load through the backend", () => {
    const project = sampleProject();
    const wire = JSON.parse(JSON.stringify(toBackendProject(project)));
    expect(fromBackendProject(wire)).toEqual(project);
  });
});
