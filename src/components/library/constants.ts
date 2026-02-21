export type ViewMode = "grid" | "list";

export type SortOption =
  | "downloadedAt-desc"
  | "downloadedAt-asc"
  | "title-asc"
  | "title-desc"
  | "fileSize-desc"
  | "fileSize-asc";

export const SORT_OPTIONS = [
  { value: "downloadedAt-desc", label: "Newest first" },
  { value: "downloadedAt-asc", label: "Oldest first" },
  { value: "title-asc", label: "Title A-Z" },
  { value: "title-desc", label: "Title Z-A" },
  { value: "fileSize-desc", label: "Largest first" },
  { value: "fileSize-asc", label: "Smallest first" },
] as const;

export const VIDEO_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "webm", "m4v"];
