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
} from './useTauri';
export type { SystemInfo, BinaryStatus, CacheStats } from './useTauri';

// Download hooks
export {
  useVideoInfo,
  useDownloadQueue,
  useDownload,
} from './useDownload';
export type {
  VideoInfo,
  VideoFormat,
  DownloadOptions,
  DownloadTask,
  DownloadStatus,
  DownloadProgress,
} from './useDownload';

// Library hooks
export {
  useLibrary,
  useLibraryStats,
  useLibraryVideo,
} from './useLibrary';
export type { LibraryVideo, LibraryStats } from './useLibrary';

// Editor hooks
export {
  useVideoMetadata,
  useThumbnails,
  useWaveform,
  useProject,
  useExport,
  useExportOptions,
} from './useEditor';
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
} from './useEditor';

// Settings hooks
export {
  useSettings,
  useTheme,
  useDownloadSettings,
} from './useSettings';
export type {
  AppSettings,
  GeneralSettings,
  DownloadSettings,
  EditorSettings,
  AppearanceSettings,
  AdvancedSettings,
} from './useSettings';
