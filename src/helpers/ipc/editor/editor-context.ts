import type { EditorManagerContext } from "../../../types/editor";
import {
  EDITOR_EXPORT_CHANNEL,
  EDITOR_MERGE_CHANNEL,
  EDITOR_OPEN_CHANNEL,
  EDITOR_SAVE_CHANNEL,
  EDITOR_SPLIT_CHANNEL,
  EDITOR_TRIM_CHANNEL,
} from "./editor-channels";

export function exposeEditorContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  const editorManager: EditorManagerContext = {
    open: (filePath: string) => ipcRenderer.invoke(EDITOR_OPEN_CHANNEL, filePath),
    save: (projectData: any) => ipcRenderer.invoke(EDITOR_SAVE_CHANNEL, projectData),
    export: (projectData: any, outputPath: string) => ipcRenderer.invoke(EDITOR_EXPORT_CHANNEL, projectData, outputPath),
    trim: (filePath: string, startTime: number, endTime: number) => ipcRenderer.invoke(EDITOR_TRIM_CHANNEL, filePath, startTime, endTime),
    split: (filePath: string, splitTime: number) => ipcRenderer.invoke(EDITOR_SPLIT_CHANNEL, filePath, splitTime),
    merge: (filePaths: string[], outputPath: string) => ipcRenderer.invoke(EDITOR_MERGE_CHANNEL, filePaths, outputPath),
  };
  contextBridge.exposeInMainWorld("editorManager", editorManager);
} 