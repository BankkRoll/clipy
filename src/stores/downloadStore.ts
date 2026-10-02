/**
 * Download store: the frontend's single view of the download queue.
 *
 * Responsibilities:
 * - hold every download the user started (or the backend reports) this session
 * - fold `download-progress` events into rows ({@link DownloadState.applyProgress})
 * - merge the backend queue (`get_downloads`) on startup so a reload does not
 *   lose in-flight downloads ({@link DownloadState.syncFromBackend})
 *
 * It is intentionally not persisted: the backend queue is the durable copy for
 * the app session, and the library holds finished downloads permanently.
 */
import { create } from "zustand";
import type { Download, DownloadProgress, DownloadStatus, DownloadTask } from "@/types/download";

/** Shown when the backend reports a failure without saying why. */
export const UNKNOWN_FAILURE_REASON = "Download failed (no reason reported)";

const FINISHED: ReadonlySet<DownloadStatus> = new Set(["completed", "failed", "cancelled"]);
const RUNNING: ReadonlySet<DownloadStatus> = new Set(["downloading", "fetching", "processing"]);

/** Shape of the download store. */
export interface DownloadState {
  downloads: Download[];
  /** Number of downloads currently transferring or post-processing. */
  activeDownloads: number;
  /**
   * Ids the user removed from the list. The backend keeps finished tasks for
   * the session, so these are skipped when re-syncing.
   */
  dismissedIds: string[];

  /** Add a download the backend has already accepted under `id`. */
  addDownloadWithId: (id: string, download: Omit<Download, "id" | "createdAt">) => void;
  /** Shallow-merge fields into one download. */
  updateDownload: (id: string, updates: Partial<Download>) => void;
  /** Fold one `download-progress` event into the matching row. */
  applyProgress: (progress: DownloadProgress) => void;
  /** Set a status (and failure reason) directly. */
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  /** Remove a row and remember it so a backend re-sync does not restore it. */
  removeDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  /** Drop every completed, failed and cancelled row. */
  clearCompleted: () => void;
  /** Merge the backend queue into the store. */
  syncFromBackend: (tasks: DownloadTask[]) => void;
}

function countActive(downloads: Download[]): number {
  return downloads.filter((d) => RUNNING.has(d.status)).length;
}

function qualityLabel(task: DownloadTask): string {
  if (task.options?.audioOnly) return "Audio";
  return /^\d+$/.test(task.quality) ? `${task.quality}p` : task.quality;
}

function fromTask(task: DownloadTask): Download {
  const completed = task.status === "completed";
  return {
    id: task.id,
    videoId: task.videoId,
    title: task.title,
    thumbnail: task.thumbnail,
    url: task.url,
    status: task.status,
    progress: completed ? 100 : task.progress,
    downloadedBytes: task.downloadedBytes,
    totalBytes: task.totalBytes,
    speed: task.speed,
    eta: task.eta,
    quality: qualityLabel(task),
    format: task.format,
    outputPath: task.outputPath,
    // NOTE: the backend overwrites outputPath with the real file only on
    // completion; before that it is the output directory.
    filePath: completed && task.outputPath ? task.outputPath : undefined,
    error: task.error,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    duration: task.duration,
    channel: task.channel,
  };
}

/** Zustand hook for the download store. */
export const useDownloadStore = create<DownloadState>((set) => {
  const mutate = (fn: (downloads: Download[]) => Download[]) =>
    set((state) => {
      const downloads = fn(state.downloads);
      return { downloads, activeDownloads: countActive(downloads) };
    });

  const patch = (id: string, fn: (d: Download) => Download) =>
    mutate((downloads) => downloads.map((d) => (d.id === id ? fn(d) : d)));

  return {
    downloads: [],
    activeDownloads: 0,
    dismissedIds: [],

    addDownloadWithId: (id, download) =>
      mutate((downloads) => [
        ...downloads.filter((d) => d.id !== id),
        { ...download, id, createdAt: new Date().toISOString() },
      ]),

    updateDownload: (id, updates) => patch(id, (d) => ({ ...d, ...updates })),

    applyProgress: (p) =>
      patch(p.downloadId, (d) => {
        if (!FINISHED.has(p.status)) {
          return {
            ...d,
            status: p.status,
            progress: p.progress,
            downloadedBytes: p.downloadedBytes,
            totalBytes: p.totalBytes,
            speed: p.speed,
            eta: p.eta,
            phase: p.phase,
            message: p.message,
            error: null,
          };
        }
        const completed = p.status === "completed";
        return {
          ...d,
          status: p.status,
          progress: completed ? 100 : p.progress,
          speed: 0,
          eta: 0,
          phase: undefined,
          message: undefined,
          filePath: p.filePath ?? d.filePath,
          completedAt: completed ? new Date().toISOString() : d.completedAt,
          error: p.status === "failed" ? (p.message ?? d.error) : null,
        };
      }),

    setStatus: (id, status, error) =>
      patch(id, (d) => ({
        ...d,
        status,
        error: error ?? null,
        completedAt: status === "completed" ? new Date().toISOString() : d.completedAt,
        progress: status === "completed" ? 100 : d.progress,
      })),

    removeDownload: (id) =>
      set((state) => {
        const downloads = state.downloads.filter((d) => d.id !== id);
        return {
          downloads,
          activeDownloads: countActive(downloads),
          dismissedIds: [...state.dismissedIds, id],
        };
      }),

    pauseDownload: (id) =>
      patch(id, (d) => (d.status === "downloading" ? { ...d, status: "paused" } : d)),

    resumeDownload: (id) =>
      patch(id, (d) => (d.status === "paused" ? { ...d, status: "pending" } : d)),

    cancelDownload: (id) => patch(id, (d) => ({ ...d, status: "cancelled" })),

    retryDownload: (id) =>
      patch(id, (d) =>
        d.status === "failed" || d.status === "cancelled"
          ? { ...d, status: "pending", error: null, progress: 0 }
          : d
      ),

    clearCompleted: () => mutate((downloads) => downloads.filter((d) => !FINISHED.has(d.status))),

    syncFromBackend: (tasks) =>
      set((state) => {
        const dismissed = new Set(state.dismissedIds);
        const byId = new Map(state.downloads.map((d) => [d.id, d]));

        for (const task of tasks) {
          if (dismissed.has(task.id)) continue;
          const incoming = fromTask(task);
          const existing = byId.get(task.id);
          byId.set(
            task.id,
            existing
              ? {
                  ...existing,
                  status: incoming.status,
                  progress: incoming.progress,
                  downloadedBytes: incoming.downloadedBytes,
                  totalBytes: incoming.totalBytes,
                  speed: incoming.speed,
                  eta: incoming.eta,
                  error: incoming.error ?? existing.error,
                  completedAt: incoming.completedAt ?? existing.completedAt,
                  filePath: incoming.filePath ?? existing.filePath,
                }
              : incoming
          );
        }

        const downloads = [...byId.values()];
        return { downloads, activeDownloads: countActive(downloads) };
      }),
  };
});
