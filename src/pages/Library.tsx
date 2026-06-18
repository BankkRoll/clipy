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
  VIDEO_EXTENSIONS,
  type ViewMode,
  type SortOption,
} from "@/components/library";
import { useLibrary, useLibraryStats, useFileSystem } from "@/hooks";
import { toast } from "sonner";
import { open, ask, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { logger } from "@/lib/logger";

export function Library() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("downloadedAt-desc");
  const [playingVideo, setPlayingVideo] = useState<LibraryVideo | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<LibraryVideo | null>(null);

  const { showInFolder } = useFileSystem();
  const { videos, loading, refresh, deleteVideo, importVideo, renameVideo, bulkDelete } =
    useLibrary();
  const { stats, refresh: refreshStats } = useLibraryStats();

  // Memoized filtered and sorted videos
  const filteredVideos = useMemo(() => {
    return videos
      .filter((v) => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (
          v.title.toLowerCase().includes(query) ||
          v.channel.toLowerCase().includes(query)
        );
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
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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

  const handleOpenInEditor = useCallback((videoId: string) => {
    navigate(`/editor?import=${videoId}`);
  }, [navigate]);

  const handleOpenFolder = useCallback(async (filePath: string) => {
    try {
      await showInFolder(filePath);
    } catch (err) {
      logger.error("Library", "Failed to open folder:", err);
      toast.error("Failed to show file in folder");
    }
  }, [showInFolder]);

  const handleDelete = useCallback(async (videoId: string) => {
    const confirmed = await ask("Are you sure you want to remove this video from your library?", {
      title: "Remove Video",
      kind: "warning",
    });

    if (confirmed) {
      try {
        await deleteVideo(videoId, false);
        setSelectedIds((prev) => prev.filter((id) => id !== videoId));
        await refreshStats();
        toast.success("Video removed from library");
      } catch {
        toast.error("Failed to delete video");
      }
    }
  }, [deleteVideo, refreshStats]);

  const handleRename = useCallback((video: LibraryVideo) => {
    setRenameTarget(video);
  }, []);

  const handleConfirmRename = useCallback(async (newTitle: string) => {
    if (!renameTarget) return;
    try {
      await renameVideo(renameTarget.id, newTitle);
      toast.success("Video renamed");
    } catch {
      toast.error("Failed to rename video");
    }
  }, [renameTarget, renameVideo]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    const deleteFiles = await ask(
      `Remove ${selectedIds.length} video(s) from your library?\n\nClick "Yes" to also delete the files from disk, or "No" to only remove the library entries.`,
      { title: "Delete selected", kind: "warning" }
    );
    // ask() is yes/no; treat "yes" as delete-files. Still confirm removal happens either way.
    try {
      const count = await bulkDelete(selectedIds, deleteFiles);
      setSelectedIds([]);
      await refreshStats();
      toast.success(`Removed ${count} video(s) from library`);
    } catch {
      toast.error("Failed to delete selected videos");
    }
  }, [selectedIds, bulkDelete, refreshStats]);

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
    navigate("/");
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
            <Button variant="ghost" size="icon" onClick={clearSelection}>
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

      <RenameDialog
        open={renameTarget !== null}
        initialTitle={renameTarget?.title ?? ""}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
        onConfirm={handleConfirmRename}
      />

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
