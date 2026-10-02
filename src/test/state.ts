/**
 * Reset helpers for app-wide state that outlives a single render: zustand
 * stores, web storage and the logger's debug flag.
 */
import { useDownloadStore } from "@/stores/downloadStore";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { logger } from "@/lib/logger";

/**
 * Restore the download, theme and UI stores to their initial state and clear
 * web storage. Runs after every test (see setup.ts).
 */
export function resetAppState(): void {
  useDownloadStore.setState(useDownloadStore.getInitialState(), true);
  useThemeStore.setState(useThemeStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  localStorage.clear();
  sessionStorage.clear();
  logger.setDebugMode(false);
}
