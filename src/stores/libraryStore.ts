import { create } from "zustand";
import { type LibraryVideo } from "@/types/video";

type SortField = "title" | "downloadedAt" | "fileSize" | "duration";
type SortOrder = "asc" | "desc";

interface LibraryState {
  videos: LibraryVideo[];
  isLoading: boolean;
  searchQuery: string;
  sortField: SortField;
  sortOrder: SortOrder;
  selectedIds: string[];

  // Actions
  setVideos: (videos: LibraryVideo[]) => void;
  addVideo: (video: LibraryVideo) => void;
  removeVideo: (id: string) => void;
  updateVideo: (id: string, updates: Partial<LibraryVideo>) => void;
  setSearchQuery: (query: string) => void;
  setSorting: (field: SortField, order: SortOrder) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelected: () => void;
  getFilteredVideos: () => LibraryVideo[];
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  videos: [],
  isLoading: false,
  searchQuery: "",
  sortField: "downloadedAt",
  sortOrder: "desc",
  selectedIds: [],

  setVideos: (videos) => set({ videos }),

  addVideo: (video) =>
    set((state) => ({
      videos: [video, ...state.videos],
    })),

  removeVideo: (id) =>
    set((state) => ({
      videos: state.videos.filter((v) => v.id !== id),
      selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
    })),

  updateVideo: (id, updates) =>
    set((state) => ({
      videos: state.videos.map((v) => (v.id === id ? { ...v, ...updates } : v)),
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSorting: (field, order) => set({ sortField: field, sortOrder: order }),

  toggleSelection: (id) =>
    set((state) => ({
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    })),

  selectAll: () =>
    set((state) => ({
      selectedIds: state.videos.map((v) => v.id),
    })),

  clearSelection: () => set({ selectedIds: [] }),

  deleteSelected: () =>
    set((state) => ({
      videos: state.videos.filter((v) => !state.selectedIds.includes(v.id)),
      selectedIds: [],
    })),

  getFilteredVideos: () => {
    const { videos, searchQuery, sortField, sortOrder } = get();

    let filtered = videos;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (v) => v.title.toLowerCase().includes(query) || v.channel.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "title":
          comparison = a.title.localeCompare(b.title);
          break;
        case "downloadedAt":
          comparison = new Date(a.downloadedAt).getTime() - new Date(b.downloadedAt).getTime();
          break;
        case "fileSize":
          comparison = a.fileSize - b.fileSize;
          break;
        case "duration":
          comparison = a.duration - b.duration;
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  },
}));
