/**
 * React hooks index - re-export all hooks
 */

// Tauri API hooks
export {
  useSystemInfo,
  useBinaryStatus,
  useCacheStats,
  useFileSystem,
  useTauriEvent,
  useNavigationEvent,
  useAppVersion,
} from "./useTauri";
export type { SystemInfo, BinaryStatus, CacheStats } from "./useTauri";

// Download hooks
export { useVideoInfo, useDownloadCommands, useDownloadSync } from "./useDownload";
export type {
  VideoInfo,
  VideoFormat,
  DownloadOptions,
  DownloadTask,
  DownloadStatus,
  DownloadProgress,
  DownloadDisplay,
} from "./useDownload";

// Library hooks
export { useLibrary, useLibraryStats } from "./useLibrary";
export type { LibraryVideo, LibraryStats } from "./useLibrary";

// Editor hooks
export {
  useVideoMetadata,
  useThumbnails,
  useWaveform,
  useProject,
  useExport,
  useExportOptions,
} from "./useEditor";
export type {
  VideoMetadata,
  Project,
  ProjectSettings,
  Track,
  Clip,
  ClipProperties,
  Transform,
  TextProperties,
  Filter,
  ExportSettings,
  ExportProgress,
  ExportFormat,
  ExportResolution,
} from "./useEditor";

// Settings hooks
export { useSettings, useTheme, applyBackendSettings } from "./useSettings";
export type {
  AppSettings,
  GeneralSettings,
  DownloadSettings,
  EditorSettings,
  AppearanceSettings,
  AdvancedSettings,
} from "./useSettings";
