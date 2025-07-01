import { app, BrowserWindow } from "electron";
import path from "path";

import { loadConfig } from "./helpers/config_helpers";
import registerListeners from "./helpers/ipc/listeners-register";
import { initializeLogging } from "./helpers/logger";

const config = loadConfig();
if (!config.editor.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

const inDevelopment = process.env.NODE_ENV === "development";

function createWindow() {
  const preload = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    titleBarStyle: "hidden",
  });
  registerListeners(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.whenReady().then(() => {
  initializeLogging();
  console.log('Log files will be saved in:', app.getPath('userData'));
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
