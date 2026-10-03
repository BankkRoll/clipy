import { useEffect, useRef } from "react";
import { UpdateDialog } from "./update-dialog";
import { useUpdaterStore, type UpdaterStatus } from "@/stores/updaterStore";

/** Delay before the launch-time check so it never competes with startup work. */
export const AUTO_CHECK_DELAY_MS = 5_000;

const DIALOG_STATUS: Partial<Record<UpdaterStatus, "idle" | "downloading" | "ready" | "error">> = {
  available: "idle",
  downloading: "downloading",
  ready: "ready",
  error: "error",
};

/**
 * Mounts the app-update dialog and runs the launch-time check.
 *
 * @param autoCheck - `general.checkForUpdates` from backend settings; the
 *   check runs once, only after settings have loaded and only when enabled.
 */
export function AppUpdater({ autoCheck }: { autoCheck: boolean | undefined }) {
  const state = useUpdaterStore();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!autoCheck || checkedRef.current) return;
    checkedRef.current = true;
    const timer = setTimeout(() => {
      void useUpdaterStore.getState().checkForUpdate();
    }, AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoCheck]);

  const dialogStatus = DIALOG_STATUS[state.status];
  if (!state.newVersion || !dialogStatus) return null;

  return (
    <UpdateDialog
      open={state.open}
      // The dialog has no trigger, so Radix only ever calls this to close it.
      onOpenChange={state.dismiss}
      type="app"
      currentVersion={state.currentVersion}
      newVersion={state.newVersion}
      releaseNotes={state.notes}
      downloadProgress={state.progress}
      downloadStatus={dialogStatus}
      {...(state.error ? { errorMessage: state.error } : {})}
      onUpdate={() => void state.install()}
      onLater={state.dismiss}
      onSkip={state.skip}
      onRestart={() => void state.restart()}
    />
  );
}
