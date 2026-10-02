import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewOverlay } from "@/components/editor/preview-overlay";
import { makeClip, makeTrack } from "@/test/editor-fixtures";
import { createTextClip } from "@/lib/editor/clips";
import type { Clip, TextProperties, Track } from "@/types/editor";

function textClip(id: string, text: Partial<TextProperties>, overrides: Partial<Clip> = {}): Clip {
  const base = createTextClip(0);
  return {
    ...makeClip({ id }),
    ...base,
    id,
    ...overrides,
    properties: { ...base.properties, text: { ...base.properties.text!, ...text } },
  };
}

const textTrack = (clips: Clip[], extra: Partial<Track> = {}) =>
  makeTrack({ type: "text", clips, ...extra });

describe("PreviewOverlay", () => {
  it("renders nothing without active text", () => {
    const { container } = render(
      <PreviewOverlay
        tracks={[
          textTrack([textClip("x", {}, { startTime: 10, endTime: 12 })]),
          textTrack([textClip("m", {})], { muted: true }),
          makeTrack({ clips: [makeClip()] }),
          textTrack([textClip("e", { content: "" })]),
        ]}
        currentTime={1}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("positions plain text with alignment, background and transform", () => {
    const clip = textClip(
      "p",
      { align: "right", verticalAlign: "top", backgroundColor: "#112233" },
      {}
    );
    clip.properties.transform = { x: 96, y: 54, scaleX: 1, scaleY: 1, rotation: 10 };
    render(
      <PreviewOverlay
        tracks={[textTrack([clip])]}
        currentTime={1}
        canvas={{ width: 960, height: 540 }}
      />
    );
    const span = screen.getByTestId("overlay-text-p");
    expect(span).toHaveTextContent("Enter your text here");
    expect(span.style.transform).toBe("translate(10cqw, 10cqh) scale(1, 1) rotate(10deg)");
    expect(span.style.backgroundColor).toBe("rgb(17, 34, 51)");
    expect(span.style.padding).toBe("0.1em 0.3em");
    const box = span.parentElement!;
    expect(box.style.justifyContent).toBe("flex-end");
    expect(box.style.alignItems).toBe("flex-start");
  });

  it("supports left/bottom alignment and fades with the clip", () => {
    const clip = textClip("f", { align: "left", verticalAlign: "bottom" }, {});
    clip.properties.fadeIn = 2;
    render(<PreviewOverlay tracks={[textTrack([clip])]} currentTime={1} />);
    const box = screen.getByTestId("overlay-text-f").parentElement!;
    expect(box.style.justifyContent).toBe("flex-start");
    expect(box.style.alignItems).toBe("flex-end");
    expect(box.style.opacity).toBe("0.5");
  });

  it("highlights the active caption word with a box, not the whole line", () => {
    const clip = textClip("c", {
      captionWords: [
        { text: "one", start: 0, end: 1 },
        { text: "two", start: 1, end: 2 },
      ],
      highlightStyle: "box",
      highlightColor: "#34D399",
      outlineColor: "#000000",
    });
    render(<PreviewOverlay tracks={[textTrack([clip])]} currentTime={1.5} />);
    const line = screen.getByTestId("overlay-text-c");
    expect(line.style.backgroundColor).toBe("");
    expect(line.style.textShadow).toContain("#000000");
    const active = line.querySelector('[data-active="true"]') as HTMLElement;
    expect(active).toHaveTextContent("two");
    expect(active.style.backgroundColor).toBe("rgb(52, 211, 153)");
    expect(screen.getByText("one").style.backgroundColor).toBe("");
  });

  it("scales the active word for the scale style", () => {
    const clip = textClip("s", {
      captionWords: [{ text: "big", start: 0, end: 1 }],
      highlightStyle: "scale",
      highlightColor: "#ff0000",
    });
    render(<PreviewOverlay tracks={[textTrack([clip])]} currentTime={0.5} />);
    const word = screen.getByText("big");
    expect(word.style.transform).toBe("scale(1.15)");
    expect(word.style.color).toBe("rgb(255, 0, 0)");
  });
});
