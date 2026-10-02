import { describe, it, expect } from "vitest";
import {
  FILTER_PRESETS,
  activeSharpenAmount,
  buildCssFilter,
  getFilterPreset,
  newFilter,
  sharpenFilterId,
  sharpenKernel,
} from "./filters";
import type { Filter, FilterType } from "@/types/editor";

const f = (type: FilterType, value: number, enabled = true): Filter => ({
  id: `${type}-${value}`,
  type,
  enabled,
  params: { value },
});

describe("newFilter", () => {
  it("starts every preset at its neutral default (0 is not replaced by 1)", () => {
    for (const preset of FILTER_PRESETS) {
      expect(newFilter(preset.id).params.value).toBe(preset.default);
    }
    expect(newFilter("hue").params.value).toBe(0);
    expect(newFilter("blur").params.value).toBe(0);
    expect(newFilter("sharpen").params.value).toBe(0);
  });

  it("falls back to 1 for types without a preset", () => {
    expect(getFilterPreset("grayscale")).toBeUndefined();
    const filter = newFilter("grayscale");
    expect(filter).toMatchObject({ type: "grayscale", enabled: true, params: { value: 1 } });
    expect(filter.id).toBeTruthy();
  });
});

describe("buildCssFilter", () => {
  it("maps each filter type to its CSS function in order", () => {
    expect(
      buildCssFilter(
        [
          f("brightness", 1.2),
          f("contrast", 0.8),
          f("saturation", 2),
          f("hue", -90),
          f("blur", 3),
          f("grayscale", 1),
          f("sepia", 0.5),
          f("invert", 1),
        ],
        "c"
      )
    ).toBe(
      "brightness(1.2) contrast(0.8) saturate(2) hue-rotate(-90deg) blur(3px) grayscale(1) sepia(0.5) invert(1)"
    );
  });

  it("skips disabled filters and returns empty for none", () => {
    expect(buildCssFilter([f("blur", 3, false)], "c")).toBe("");
    expect(buildCssFilter([], "c")).toBe("");
  });

  it("references the clip's SVG filter for sharpen, only when above 0", () => {
    expect(buildCssFilter([f("sharpen", 5)], "a/b c")).toBe(`url(#${sharpenFilterId("a/b c")})`);
    expect(buildCssFilter([f("sharpen", 0)], "c")).toBe("");
    expect(sharpenFilterId("a/b c")).toBe("clipy-sharpen-a_b_c");
  });

  it("ignores unknown filter types", () => {
    expect(buildCssFilter([f("unknown" as FilterType, 1)], "c")).toBe("");
  });
});

describe("sharpen helpers", () => {
  it("builds a kernel that sums to 1 and grows with the amount", () => {
    const parse = (k: string) => k.split(" ").map(Number);
    const sum = (k: string) => parse(k).reduce((a, b) => a + b, 0);
    expect(sharpenKernel(0)).toBe("0 0 0 0 1 0 0 0 0");
    expect(sum(sharpenKernel(5))).toBeCloseTo(1);
    expect(parse(sharpenKernel(10))[4]).toBe(5);
    expect(sharpenKernel(-3)).toBe("0 0 0 0 1 0 0 0 0");
  });

  it("activeSharpenAmount returns the last enabled positive sharpen", () => {
    expect(activeSharpenAmount([f("blur", 2)])).toBeNull();
    expect(activeSharpenAmount([f("sharpen", 0)])).toBeNull();
    expect(activeSharpenAmount([f("sharpen", 2), f("sharpen", 4, false), f("sharpen", 3)])).toBe(3);
  });
});
