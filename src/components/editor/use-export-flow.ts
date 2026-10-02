/**
 * Export flow: start `export_project`, surface its outcome exactly once.
 *
 * The backend reports the outcome twice (the `export-progress` event with a
 * terminal status, and the command's resolve/reject), in no guaranteed order.
 * A per-run "settled" flag makes whichever arrives first produce the toast.
 */
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import { useExport, type ExportProgress } from "@/hooks/useEditor";
import { logger } from "@/lib/logger";
import { toBackendProject } from "@/lib/editor/project-mapping";
import { buildExportSettings, type ExportDialogSettings } from "@/lib/editor/export";

/** State and commands returned by {@link useExportFlow}. */
export interface ExportFlow {
  exporting: boolean;
  progress: ExportProgress | null;
  /** Starts an export; resolves once it finishes, fails or is cancelled. */
  startExport: (settings: ExportDialogSettings) => Promise<void>;
  cancelExport: () => Promise<void>;
}

/**
 * Hook driving the export dialog.
 *
 * @param onFinished - Called after a successful export (e.g. to close the dialog).
 * @returns Export state and commands.
 */
export function useExportFlow(onFinished?: () => void): ExportFlow {
  const { exporting, progress, startExport: runExport, cancelExport: runCancel } = useExport();
  const settledRef = useRef(true);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const succeed = useCallback((path?: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    toast.success(path ? `Export complete: ${path}` : "Export complete");
    onFinishedRef.current?.();
  }, []);

  const fail = useCallback((message: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    toast.error(`Export failed: ${message}`);
  }, []);

  useEffect(() => {
    if (progress?.status === "completed") succeed();
    else if (progress?.status === "failed") fail(progress.error ?? "Unknown error");
  }, [progress, succeed, fail]);

  const startExport = useCallback(
    async (settings: ExportDialogSettings) => {
      const project = useEditorStore.getState().project;
      if (!project || !settings.outputPath) {
        toast.error("Please select an output location");
        return;
      }
      settledRef.current = false;
      try {
        const path = await runExport(
          toBackendProject(project),
          buildExportSettings(settings, project.settings.fps)
        );
        succeed(path);
      } catch (err) {
        logger.error("Editor", "Export failed:", err);
        // useExport normalizes every failure to an Error.
        fail((err as Error).message);
      }
    },
    [runExport, succeed, fail]
  );

  const cancelExport = useCallback(async () => {
    settledRef.current = true;
    try {
      await runCancel();
      toast.info("Export cancelled");
    } catch (err) {
      logger.error("Editor", "Cancel export failed:", err);
      toast.error("Failed to cancel export");
    }
  }, [runCancel]);

  return { exporting, progress, startExport, cancelExport };
}
