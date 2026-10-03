import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, X, Trash2 } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import {
  LibraryHeader,
  VideoGridCard,
  VideoListRow,
  EmptyLibrary,
  RenameDialog,
  DeleteVideosDialog,
  VIDEO_EXTENSIONS,
  type DeleteChoice,
  type ViewMode,
  type SortOption,
} from "@/components/library";
import { useLibrary, useLibraryStats, useFileSystem, useTauriEvent } from "@/hooks";
import { toast } from "sonner";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { logger } from "@/lib/logger";

/** Library page: browse, play, rename, import/export and remove downloaded videos. */
export function Library() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("downloadedAt-desc");
  const [playingVideo, setPlayingVideo] = useState<LibraryVideo | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<LibraryVideo | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<string[]>([]);

  const { showInFolder } = useFileSystem();
  const { videos, loading, refresh, deleteVideo, importVideo, renameVideo, bulkDelete } =
    useLibrary();
  const { stats, refresh: refreshStats } = useLibraryStats();

  // Auto-refresh the library the instant a download completes (backend emits
  // "library-updated" after adding the video to the DB).
  useTauriEvent("library-updated", () => {
    void refresh();
    void refreshStats();
  });

  // Memoized filtered and sorted videos
  const filteredVideos = useMemo(() => {
    return videos
      .filter((v) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return v.title.toLowerCase().includes(query) || v.channel.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const [field, order] = sortOption.split("-");
        let comparison = 0;

        switch (field) {
          case "title":
            comparison = a.title.localeCompare(b.title);
            break;
          case "downloadedAt":
            comparison = new Date(a.downloadedAt).getTime() - new Date(b.downloadedAt).getTime();
            break;
          case "fileSize":
            comparison = a.fileSize - b.fileSize;
            break;
        }

        return order === "asc" ? comparison : -comparison;
      });
  }, [videos, searchQuery, sortOption]);

  const selectionMode = selectedIds.length > 0;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(filteredVideos.map((v) => v.id));
  }, [filteredVideos]);

  const handlePlayVideo = useCallback((video: LibraryVideo) => {
    setPlayingVideo(video);
  }, []);

  const handleClosePlayer = useCallback(() => {
    setPlayingVideo(null);
  }, []);

  const handleOpenInEditor = useCallback(
    (videoId: string) => {
      void navigate(`/editor?import=${videoId}`);
    },
    [navigate]
  );

  const handleOpenFolder = useCallback(
    async (filePath: string) => {
      try {
        await showInFolder(filePath);
      } catch (err) {
        logger.error("Library", "Failed to open folder:", err);
        toast.error("Failed to show file in folder");
      }
    },
    [showInFolder]
  );

  const handleDelete = useCallback((videoId: string) => {
    setDeleteTargets([videoId]);
  }, []);

  const handleRename = useCallback((video: LibraryVideo) => {
    setRenameTarget(video);
  }, []);

  const handleConfirmRename = useCallback(
    async (id: string, newTitle: string) => {
      try {
        await renameVideo(id, newTitle);
        toast.success("Video renamed");
      } catch {
        toast.error("Failed to rename video");
      }
    },
    [renameVideo]
  );

  const handleBulkDelete = useCallback(() => {
    setDeleteTargets(selectedIds);
  }, [selectedIds]);

  const handleDeleteChoice = useCallback(
    async (choice: DeleteChoice) => {
      const targets = deleteTargets;
      setDeleteTargets([]);
      if (choice === "cancel") return;

      const deleteFiles = choice === "files";
      try {
        if (targets.length === 1) {
          await deleteVideo(targets[0]!, deleteFiles);
        } else {
          await bulkDelete(targets, deleteFiles);
        }
        setSelectedIds((prev) => prev.filter((id) => !targets.includes(id)));
        await refreshStats();
        toast.success(
          `${deleteFiles ? "Deleted" : "Removed"} ${targets.length} video${targets.length === 1 ? "" : "s"}${deleteFiles ? "" : " from library"}`
        );
      } catch (err) {
        logger.error("Library", "Delete failed:", err);
        toast.error("Failed to delete videos");
      }
    },
    [deleteTargets, deleteVideo, bulkDelete, refreshStats]
  );

  const handleImport = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Video Files",
            extensions: VIDEO_EXTENSIONS,
          },
        ],
      });

      if (!selected) return;

      const files = Array.isArray(selected) ? selected : [selected];
      for (const filePath of files) {
        try {
          await importVideo(filePath);
          toast.success(`Imported: ${filePath.split(/[/\\]/).pop()}`);
        } catch {
          toast.error(`Failed to import: ${filePath.split(/[/\\]/).pop()}`);
        }
      }
      await refreshStats();
    } catch (err) {
      logger.error("Library", "Import error:", err);
    }
  }, [importVideo, refreshStats]);

  const handleExport = useCallback(async () => {
    try {
      const path = await save({
        defaultPath: "clipy-library.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("export_library_to_file", { path });
      toast.success("Library exported");
    } catch (err) {
      logger.error("Library", "Export error:", err);
      toast.error("Failed to export library");
    }
  }, []);

  const handleDownload = useCallback(() => {
    void navigate("/");
  }, [navigate]);

  return (
    <div className="flex h-full flex-col">
      <LibraryHeader
        stats={stats}
        loading={loading}
        searchQuery={searchQuery}
        sortOption={sortOption}
        viewMode={viewMode}
        onRefresh={refresh}
        onImport={handleImport}
        onExport={handleExport}
        onSearchChange={setSearchQuery}
        onSortChange={setSortOption}
        onViewModeChange={setViewMode}
      />

      {selectionMode && (
        <div className="flex items-center justify-between border-b border-border bg-accent/40 px-6 py-2">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={clearSelection}
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">{selectedIds.length} selected</span>
            <Button variant="link" size="sm" onClick={selectAllVisible} className="h-auto p-0">
              Select all
            </Button>
          </div>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete selected
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6">
        {loading && videos.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">Loading library...</p>
            </div>
          </div>
        ) : filteredVideos.length === 0 ? (
          <EmptyLibrary
            searchQuery={searchQuery}
            onDownload={handleDownload}
            onImport={handleImport}
          />
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredVideos.map((video) => (
              <VideoGridCard
                key={video.id}
                video={video}
                selectionMode={selectionMode}
                selected={selectedIds.includes(video.id)}
                onToggleSelect={() => toggleSelect(video.id)}
                onPlay={() => handlePlayVideo(video)}
                onEdit={() => handleOpenInEditor(video.id)}
                onOpenFolder={() => handleOpenFolder(video.filePath)}
                onDelete={() => handleDelete(video.id)}
                onRename={() => handleRename(video)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredVideos.map((video) => (
              <VideoListRow
                key={video.id}
                video={video}
                selectionMode={selectionMode}
                selected={selectedIds.includes(video.id)}
                onToggleSelect={() => toggleSelect(video.id)}
                onPlay={() => handlePlayVideo(video)}
                onEdit={() => handleOpenInEditor(video.id)}
                onOpenFolder={() => handleOpenFolder(video.filePath)}
                onDelete={() => handleDelete(video.id)}
                onRename={() => handleRename(video)}
              />
            ))}
          </div>
        )}
      </div>

      {renameTarget && (
        // The dialog has no trigger, so every open-state change is a close.
        <RenameDialog
          open
          initialTitle={renameTarget.title}
          onOpenChange={() => setRenameTarget(null)}
          onConfirm={(title) => handleConfirmRename(renameTarget.id, title)}
        />
      )}

      <DeleteVideosDialog count={deleteTargets.length} onChoose={handleDeleteChoice} />

      {playingVideo && (
        <VideoPlayer
          src={playingVideo.filePath}
          title={playingVideo.title}
          subtitle={playingVideo.channel}
          poster={playingVideo.thumbnail}
          onClose={handleClosePlayer}
          autoPlay
        />
      )}
    </div>
  );
}
