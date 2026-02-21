export const FILTER_PRESETS = [
  { id: "brightness", name: "Brightness", min: 0, max: 2, default: 1 },
  { id: "contrast", name: "Contrast", min: 0, max: 2, default: 1 },
  { id: "saturation", name: "Saturation", min: 0, max: 2, default: 1 },
  { id: "hue", name: "Hue Shift", min: -180, max: 180, default: 0 },
  { id: "blur", name: "Blur", min: 0, max: 20, default: 0 },
  { id: "sharpen", name: "Sharpen", min: 0, max: 10, default: 0 },
] as const;

export const PIXELS_PER_SECOND = 50;
export const SNAP_THRESHOLD = 10;

export const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Courier New",
  "Impact",
  "Comic Sans MS",
] as const;

export const FONT_WEIGHTS = [
  { value: 300, label: "Light" },
  { value: 400, label: "Normal" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Extra Bold" },
] as const;

export const MEDIA_EXTENSIONS = {
  video: ["mp4", "mkv", "avi", "mov", "webm"],
  audio: ["mp3", "wav", "ogg", "m4a"],
  image: ["jpg", "jpeg", "png", "gif", "webp"],
} as const;

export type FilterPreset = typeof FILTER_PRESETS[number];
