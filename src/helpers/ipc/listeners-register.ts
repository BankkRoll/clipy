import { BrowserWindow } from "electron";
import { addConfigEventListeners } from "./config/config-listeners";
import { addDownloadEventListeners } from "./download/download-listeners";
import { addEditorEventListeners } from "./editor/editor-listeners";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addThemeEventListeners();
  addDownloadEventListeners();
  addEditorEventListeners();
  addConfigEventListeners();
}
