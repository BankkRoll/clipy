import { ipcMain } from "electron";
import {
  createSuccessResponse,
  EditorExportResponse,
  EditorMergeResponse,
  EditorOpenResponse,
  EditorSaveResponse,
  EditorSplitResponse,
  EditorTrimResponse
} from "../../../types/api";
import {
  EDITOR_EXPORT_CHANNEL,
  EDITOR_MERGE_CHANNEL,
  EDITOR_OPEN_CHANNEL,
  EDITOR_SAVE_CHANNEL,
  EDITOR_SPLIT_CHANNEL,
  EDITOR_TRIM_CHANNEL,
} from "./editor-channels";

export function addEditorEventListeners() {
  ipcMain.handle(EDITOR_OPEN_CHANNEL, async (event, filePath: string): Promise<EditorOpenResponse> => {
    console.log("Opening file for editing:", filePath);
    return createSuccessResponse({ filePath, duration: 0, metadata: {} });
  });

  ipcMain.handle(EDITOR_SAVE_CHANNEL, async (event, projectData: any): Promise<EditorSaveResponse> => {
    console.log("Saving editor project:", projectData);
    return createSuccessResponse({ status: "saved", projectPath: "" });
  });

  ipcMain.handle(EDITOR_EXPORT_CHANNEL, async (event, projectData: any, outputPath: string): Promise<EditorExportResponse> => {
    console.log("Exporting video:", projectData, "to:", outputPath);
    return createSuccessResponse({ status: "exporting", outputPath });
  });

  ipcMain.handle(EDITOR_TRIM_CHANNEL, async (event, filePath: string, startTime: number, endTime: number): Promise<EditorTrimResponse> => {
    console.log("Trimming video:", filePath, "from", startTime, "to", endTime);
    return createSuccessResponse({ status: "trimmed", outputPath: "" });
  });

  ipcMain.handle(EDITOR_SPLIT_CHANNEL, async (event, filePath: string, splitTime: number): Promise<EditorSplitResponse> => {
    console.log("Splitting video:", filePath, "at", splitTime);
    return createSuccessResponse({ status: "split", outputPaths: [] });
  });

  ipcMain.handle(EDITOR_MERGE_CHANNEL, async (event, filePaths: string[], outputPath: string): Promise<EditorMergeResponse> => {
    console.log("Merging videos:", filePaths, "to:", outputPath);
    return createSuccessResponse({ status: "merged", outputPath });
  });
} 