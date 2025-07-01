import type { ThemeMode } from './theme';

export interface ElectronWindow {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
}

export interface RendererEvents {
  'download-progress-update': (progress: import('./download').DownloadProgress) => void;
  'download-completed': (progress: import('./download').DownloadProgress) => void;
  'download-failed': (progress: import('./download').DownloadProgress) => void;
  'theme-changed': (theme: ThemeMode) => void;
  'window-state-changed': (state: WindowState) => void;
}

export interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
  isFocused: boolean;
  bounds: WindowBounds;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppConfig {
  window: WindowConfig;
  download: import('./download').DownloadConfig;
  editor: EditorConfig;
}

export interface WindowConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  titleBarStyle: 'default' | 'hidden' | 'hiddenInset';
  frame: boolean;
  resizable: boolean;
}

export interface EditorConfig {
  defaultFrameRate: number;
  defaultAudioSampleRate: number;
  maxUndoHistory: number;
  autoSaveInterval: number;
} 