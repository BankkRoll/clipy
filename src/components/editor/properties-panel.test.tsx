import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PropertiesPanel, type PropertiesTab } from "@/components/editor/properties-panel";
import { useEditorStore } from "@/stores/editorStore";
import { allClips, loadEditor, makeClip, makeProject, makeTrack } from "@/test/editor-fixtures";
import { createTextClip } from "@/lib/editor/clips";
import { patchClipProperties, patchText, patchTransform } from "@/components/editor/clip-updates";

function Harness({ initialTab = "properties" }: { initialTab?: PropertiesTab }) {
  const [tab, setTab] = useState<PropertiesTab>(initialTab);
  return <PropertiesPanel activeTab={tab} onTabChange={setTab} onCollapse={onCollapse} />;
}
const onCollapse = vi.fn();

function setup(initialTab?: PropertiesTab) {
  const user = userEvent.setup();
  render(<Harness {...(initialTab ? { initialTab } : {})} />);
  return { user };
}

const clip = (id: string) => allClips().find((c) => c.id === id)!;
const slider = (label: string) =>
  document.querySelector(`[aria-label="${label}"] [role="slider"]`) as HTMLElement;
const lastHistory = () => useEditorStore.getState().history.at(-1)!.description;

beforeEach(() => {
  const text = { ...makeClip({ id: "t" }), ...createTextClip(0), id: "t" };
  loadEditor(
    makeProject([
      makeTrack({ id: "tv", clips: [makeClip({ id: "v", name: "Shot" })] }),
      makeTrack({ id: "tt", type: "text", clips: [text] }),
    ])
  );
  onCollapse.mockReset();
});

describe("PropertiesPanel", () => {
  it("prompts for a selection and collapses on request", async () => {
    const { user } = setup();
    expect(screen.getByText("Select a clip to edit")).toBeInTheDocument();
    act(() => {
      useEditorStore.getState().selectClip("v");
      useEditorStore.getState().selectClip("t", true);
    });
    expect(screen.getByText("Select a clip to edit")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide properties panel" }));
    expect(onCollapse).toHaveBeenCalled();
  });

  it("falls back to the Props tab for non-text clips", () => {
    act(() => useEditorStore.getState().selectClip("v"));
    setup("text");
    expect(screen.queryByRole("tab", { name: /Text/ })).toBeNull();
    expect(screen.getByLabelText("Clip name")).toHaveValue("Shot");
  });

  it("renames a clip and commits on blur", async () => {
    act(() => useEditorStore.getState().selectClip("v"));
    const { user } = setup();
    const name = screen.getByLabelText("Clip name");
    await user.clear(name);
    await user.type(name, "Intro");
    fireEvent.blur(name);
    expect(clip("v").name).toBe("Intro");
    expect(lastHistory()).toBe("Rename clip");
  });

  it("edits volume, opacity, speed and fades with sliders, committing on release", () => {
    act(() => useEditorStore.getState().selectClip("v"));
    setup();
    fireEvent.keyDown(slider("Volume"), { key: "ArrowRight" });
    expect(clip("v").properties.volume).toBeCloseTo(1.01);
    expect(lastHistory()).toBe("Change volume");
    fireEvent.keyDown(slider("Opacity"), { key: "ArrowLeft" });
    expect(clip("v").properties.opacity).toBeCloseTo(0.99);
    fireEvent.keyDown(slider("Speed"), { key: "ArrowRight" });
    expect(clip("v").properties.speed).toBeCloseTo(1.25);
    expect(screen.getByText("125%")).toBeInTheDocument();
    fireEvent.keyDown(slider("Fade in"), { key: "ArrowRight" });
    expect(clip("v").properties.fadeIn).toBeCloseTo(0.1);
    expect(lastHistory()).toBe("Change fade in");
    fireEvent.keyDown(slider("Fade out"), { key: "End" });
    expect(clip("v").properties.fadeOut).toBe(5);
    expect(lastHistory()).toBe("Change fade out");
  });

  it("edits and resets the transform", async () => {
    act(() => useEditorStore.getState().selectClip("v"));
    const { user } = setup();
    fireEvent.change(screen.getByLabelText("X Position"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Y Position"), { target: { value: "-40" } });
    fireEvent.change(screen.getByLabelText("Scale X"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Scale Y"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "45" } });
    fireEvent.blur(screen.getByLabelText("Rotation"));
    expect(clip("v").properties.transform).toEqual({
      x: 120,
      y: -40,
      scaleX: 1.5,
      scaleY: 1,
      rotation: 45,
    });
    expect(lastHistory()).toBe("Change transform");

    await user.click(screen.getByRole("button", { name: /Reset Transform/ }));
    expect(clip("v").properties.transform).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
    expect(lastHistory()).toBe("Reset transform");
  });

  it("adds filters at their neutral value, adjusts and removes them", async () => {
    act(() => useEditorStore.getState().selectClip("v"));
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Filters/ }));
    expect(screen.getByText("No filters applied")).toBeInTheDocument();

    for (const name of ["Hue Shift", "Brightness"]) {
      await user.click(screen.getByRole("combobox", { name: "Add filter" }));
      await user.click(await screen.findByRole("option", { name }));
    }
    const filters = clip("v").properties.filters;
    expect(filters.map((f) => [f.type, f.params.value])).toEqual([
      ["hue", 0],
      ["brightness", 1],
    ]);
    expect(lastHistory()).toBe("Add filter");

    fireEvent.keyDown(slider("Hue Shift"), { key: "ArrowRight" });
    expect(clip("v").properties.filters[0]!.params.value).toBeCloseTo(0.01);
    expect(lastHistory()).toBe("Adjust filter");

    await user.click(screen.getByRole("button", { name: "Remove Hue Shift" }));
    expect(clip("v").properties.filters.map((f) => f.type)).toEqual(["brightness"]);
    expect(lastHistory()).toBe("Remove filter");
  });

  it("skips filters without a UI preset", async () => {
    act(() => {
      patchClipProperties("v", {
        filters: [{ id: "g", type: "grayscale", enabled: true, params: { value: 1 } }],
      });
      useEditorStore.getState().selectClip("v");
    });
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Filters/ }));
    expect(screen.queryByTestId("filter-grayscale")).toBeNull();
    expect(screen.queryByText("No filters applied")).toBeNull();
  });
});

describe("Text tab", () => {
  beforeEach(() => {
    act(() => useEditorStore.getState().selectClip("t"));
  });

  it("edits content and renames the clip, without the stale preview note", async () => {
    const { user } = setup("text");
    expect(screen.queryByText(/Preview shows text properties only/)).toBeNull();
    const content = screen.getByLabelText("Text content");
    await user.clear(content);
    expect(clip("t").name).toBe("Text");
    await user.type(content, "Hello world");
    fireEvent.blur(content);
    expect(clip("t").properties.text!.content).toBe("Hello world");
    expect(clip("t").name).toBe("Hello world");
    expect(lastHistory()).toBe("Edit text");
  });

  it("font family, weight and alignment changes are undoable", async () => {
    const { user } = setup("text");
    await user.click(screen.getByRole("combobox", { name: "Font family" }));
    await user.click(await screen.findByRole("option", { name: "Georgia" }));
    expect(clip("t").properties.text!.fontFamily).toBe("Georgia");
    expect(lastHistory()).toBe("Change font");

    await user.click(screen.getByRole("combobox", { name: "Font weight" }));
    await user.click(await screen.findByRole("option", { name: "Bold" }));
    expect(clip("t").properties.text!.fontWeight).toBe(700);

    await user.click(screen.getByRole("button", { name: "right" }));
    await user.click(screen.getByRole("button", { name: "top" }));
    expect(clip("t").properties.text).toMatchObject({ align: "right", verticalAlign: "top" });
    expect(screen.getByRole("button", { name: "right" })).toHaveAttribute("aria-pressed", "true");

    act(() => useEditorStore.getState().undo());
    expect(clip("t").properties.text!.verticalAlign).toBe("middle");
  });

  it("font size slider and colors", async () => {
    const { user } = setup("text");
    fireEvent.keyDown(slider("Font size"), { key: "ArrowRight" });
    expect(clip("t").properties.text!.fontSize).toBe(49);
    expect(lastHistory()).toBe("Change font size");

    fireEvent.input(screen.getByLabelText("Text color"), { target: { value: "#ff0000" } });
    fireEvent.blur(screen.getByLabelText("Text color"));
    expect(clip("t").properties.text!.color).toBe("#ff0000");
    expect(lastHistory()).toBe("Change text color");

    const none = screen.getByRole("button", { name: "None" });
    expect(none).toBeDisabled();
    expect(screen.getByLabelText("Background color")).toHaveValue("#000000");
    fireEvent.input(screen.getByLabelText("Background color"), { target: { value: "#00ff00" } });
    fireEvent.blur(screen.getByLabelText("Background color"));
    expect(clip("t").properties.text!.backgroundColor).toBe("#00ff00");
    expect(screen.getByLabelText("Background color")).toHaveValue("#00ff00");
    await user.click(none);
    expect(clip("t").properties.text!.backgroundColor).toBe("transparent");
  });

  it("tolerates a text clip without text properties", () => {
    act(() => patchClipProperties("t", { text: undefined as never }));
    setup("text");
    expect(screen.getByLabelText("Text content")).toHaveValue("");
    expect(screen.getByText("Font Size: 48px")).toBeInTheDocument();
  });
});

describe("clip-updates helpers", () => {
  it("are no-ops for unknown clips, missing text or no project", () => {
    const before = JSON.stringify(useEditorStore.getState().project);
    patchClipProperties("missing", { volume: 0 });
    patchTransform("missing", { x: 1 });
    patchText("missing", { content: "x" });
    patchText("v", { content: "x" }, "Edit");
    expect(JSON.stringify(useEditorStore.getState().project)).toBe(before);
    useEditorStore.getState().closeProject();
    patchClipProperties("v", { volume: 0 });
    expect(useEditorStore.getState().project).toBeNull();
  });
});
