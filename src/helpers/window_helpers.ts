import type { ElectronWindow } from "../types/window";

declare global {
  interface Window {
    electronWindow: ElectronWindow;
  }
}

export async function minimizeWindow() {
  await window.electronWindow.minimize();
}
export async function maximizeWindow() {
  await window.electronWindow.maximize();
}
export async function closeWindow() {
  await window.electronWindow.close();
}
