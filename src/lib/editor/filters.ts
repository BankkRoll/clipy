/**
 * Clip filter presets and their live-preview approximation in CSS.
 *
 * Export renders filters with FFmpeg; the preview only needs to be close.
 * Sharpen has no CSS equivalent, so it is previewed with an SVG convolution
 * filter referenced by id (see {@link sharpenKernel}).
 */
import type { Filter, FilterType } from "@/types/editor";
import { generateId } from "@/lib/utils";

/** A filter the user can add from the Filters tab. */
export interface FilterPreset {
  id: FilterType;
  name: string;
  min: number;
  max: number;
  /** Neutral value: applying the filter at this value changes nothing. */
  default: number;
}

/** Filters offered in the UI, with slider ranges and neutral defaults. */
export const FILTER_PRESETS: readonly FilterPreset[] = [
  { id: "brightness", name: "Brightness", min: 0, max: 2, default: 1 },
  { id: "contrast", name: "Contrast", min: 0, max: 2, default: 1 },
  { id: "saturation", name: "Saturation", min: 0, max: 2, default: 1 },
  { id: "hue", name: "Hue Shift", min: -180, max: 180, default: 0 },
  { id: "blur", name: "Blur", min: 0, max: 20, default: 0 },
  { id: "sharpen", name: "Sharpen", min: 0, max: 10, default: 0 },
];

/**
 * Look up the preset for a filter type.
 *
 * @param type - Filter type.
 * @returns The preset, or `undefined` for types not offered in the UI.
 */
export function getFilterPreset(type: FilterType): FilterPreset | undefined {
  return FILTER_PRESETS.find((f) => f.id === type);
}

/**
 * Create an enabled filter at its neutral value.
 *
 * @param type - Filter type to add.
 * @returns A new filter with a fresh id.
 */
export function newFilter(type: FilterType): Filter {
  return {
    id: generateId(),
    type,
    enabled: true,
    // `??` not `||`: hue/blur/sharpen are neutral at 0, which is falsy.
    params: { value: getFilterPreset(type)?.default ?? 1 },
  };
}

/**
 * DOM id of the SVG sharpen filter for a clip.
 *
 * @param clipId - Clip the filter belongs to.
 * @returns An id safe to use in `url(#...)`.
 */
export function sharpenFilterId(clipId: string): string {
  return `clipy-sharpen-${clipId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

/**
 * 3x3 sharpening kernel (unsharp-style Laplacian) for an amount in 0..10.
 *
 * @param amount - Sharpen slider value.
 * @returns `kernelMatrix` attribute value for `feConvolveMatrix`.
 */
export function sharpenKernel(amount: number): string {
  const s = Math.max(0, amount) * 0.1;
  const r = (n: number) => Number(n.toFixed(4));
  return [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0].map(r).join(" ");
}

/**
 * Active sharpen amount on a clip, if any.
 *
 * @param filters - Clip filters.
 * @returns The amount of the last enabled sharpen filter above 0, else `null`.
 */
export function activeSharpenAmount(filters: Filter[]): number | null {
  let amount: number | null = null;
  for (const f of filters) {
    const v = Number(f.params.value);
    if (f.enabled && f.type === "sharpen" && v > 0) amount = v;
  }
  return amount;
}

/**
 * Build a CSS `filter` value approximating the clip's enabled filters.
 *
 * @param filters - Clip filters, applied in order.
 * @param clipId - Clip id, used to reference its SVG sharpen filter.
 * @returns A space-separated CSS filter list (empty string for none).
 * @example
 * buildCssFilter([{ type: "blur", enabled: true, params: { value: 2 } }], "c1"); // "blur(2px)"
 */
export function buildCssFilter(filters: Filter[], clipId: string): string {
  return filters
    .filter((f) => f.enabled)
    .map((f) => {
      const v = Number(f.params.value);
      switch (f.type) {
        case "brightness":
          return `brightness(${v})`;
        case "contrast":
          return `contrast(${v})`;
        case "saturation":
          return `saturate(${v})`;
        case "hue":
          return `hue-rotate(${v}deg)`;
        case "blur":
          return `blur(${v}px)`;
        case "grayscale":
          return `grayscale(${v})`;
        case "sepia":
          return `sepia(${v})`;
        case "invert":
          return `invert(${v})`;
        case "sharpen":
          return v > 0 ? `url(#${sharpenFilterId(clipId)})` : "";
      }
    })
    .filter(Boolean)
    .join(" ");
}
