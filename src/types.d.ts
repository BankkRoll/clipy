declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

import type { ConfigManagerContext } from './helpers/ipc/config/config-context';
import type { DownloadManagerContext } from './types/download';
import type { EditorManagerContext } from './types/editor';
import type { ThemeModeContext } from './types/theme';
import type { ElectronWindow } from './types/window';

declare global {
  interface Window {
    themeMode: ThemeModeContext;
    electronWindow: ElectronWindow;
    downloadManager: DownloadManagerContext;
    editorManager: EditorManagerContext;
    configManager: ConfigManagerContext;
  }
}
