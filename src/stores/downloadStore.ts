import { create } from "zustand";
import { type Download, type DownloadStatus } from "@/types/download";
import { generateId } from "@/lib/utils";

interface DownloadState {
  downloads: Download[];
  history: Download[];
  activeDownloads: number;

  // Actions
  addDownload: (download: Omit<Download, "id" | "createdAt" | "status" | "progress">) => string;
  addDownloadWithId: (id: string, download: Omit<Download, "id" | "createdAt">) => void;
  updateDownload: (id: string, updates: Partial<Download>) => void;
  updateProgress: (
    id: string,
    progress: number,
    downloadedBytes: number,
    speed: number,
    eta: number,
    totalBytes?: number
  ) => void;
  setStatus: (id: string, status: DownloadStatus, error?: string) => void;
  removeDownload: (id: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  clearCompleted: () => void;
  clearHistory: () => void;
  moveToHistory: (id: string) => void;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  downloads: [],
  history: [],
  activeDownloads: 0,

  addDownload: (download) => {
    const id = generateId();
    const newDownload: Download = {
      ...download,
      id,
      status: "pending",
      progress: 0,
      downloadedBytes: 0,
      speed: 0,
      eta: 0,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    set((state) => ({
      downloads: [...state.downloads, newDownload],
    }));

    return id;
  },

  addDownloadWithId: (id, download) => {
    const newDownload: Download = {
      ...download,
      id,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({
      downloads: [...state.downloads, newDownload],
      activeDownloads: state.activeDownloads + (download.status === "downloading" ? 1 : 0),
    }));
  },

  updateDownload: (id, updates) => {
    set((state) => ({
      downloads: state.downloads.map((d) => (d.id === id ? { ...d, ...updates } : d)),
    }));
  },

  updateProgress: (id, progress, downloadedBytes, speed, eta, totalBytes) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id
          ? {
              ...d,
              progress,
              downloadedBytes,
              totalBytes: totalBytes ?? d.totalBytes,
              speed,
              eta,
              status: "downloading" as DownloadStatus,
            }
          : d
      ),
    }));
  },

  setStatus: (id, status, error) => {
    set((state) => {
      const downloads = state.downloads.map((d) =>
        d.id === id
          ? {
              ...d,
              status,
              error: error ?? null,
              completedAt: status === "completed" ? new Date().toISOString() : d.completedAt,
              // Set progress to 100% when completed
              progress: status === "completed" ? 100 : d.progress,
            }
          : d
      );

      const activeDownloads = downloads.filter(
        (d) => d.status === "downloading" || d.status === "processing"
      ).length;

      return { downloads, activeDownloads };
    });

    // Note: Downloads stay visible - user manually clears them
  },

  removeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.filter((d) => d.id !== id),
    }));
  },

  pauseDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id && d.status === "downloading" ? { ...d, status: "paused" as DownloadStatus } : d
      ),
    }));
  },

  resumeDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id && d.status === "paused" ? { ...d, status: "pending" as DownloadStatus } : d
      ),
    }));
  },

  cancelDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id ? { ...d, status: "cancelled" as DownloadStatus } : d
      ),
    }));
  },

  retryDownload: (id) => {
    set((state) => ({
      downloads: state.downloads.map((d) =>
        d.id === id && (d.status === "failed" || d.status === "cancelled")
          ? { ...d, status: "pending" as DownloadStatus, error: null, progress: 0 }
          : d
      ),
    }));
  },

  clearCompleted: () => {
    set((state) => {
      // Move completed downloads to history before removing
      const completed = state.downloads.filter(
        (d) => d.status === "completed" || d.status === "cancelled" || d.status === "failed"
      );
      const remaining = state.downloads.filter(
        (d) => d.status !== "completed" && d.status !== "cancelled" && d.status !== "failed"
      );

      return {
        downloads: remaining,
        history: [...completed, ...state.history].slice(0, 100),
      };
    });
  },

  clearHistory: () => {
    set({ history: [] });
  },

  moveToHistory: (id) => {
    const download = get().downloads.find((d) => d.id === id);
    if (download) {
      set((state) => ({
        history: [download, ...state.history].slice(0, 100),
        downloads: state.downloads.filter((d) => d.id !== id),
      }));
    }
  },
}));
