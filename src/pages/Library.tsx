import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import {
  LibraryHeader,
  VideoGridCard,
  VideoListRow,
  EmptyLibrary,
  VIDEO_EXTENSIONS,
  type ViewMode,
  type SortOption,
} from "@/components/library";
import { useLibrary, useLibraryStats, useFileSystem } from "@/hooks";
import { toast } from "sonner";
import { open, ask } from "@tauri-apps/plugin-dialog";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { logger } from "@/lib/logger";

export function Library() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("downloadedAt-desc");
  const [playingVideo, setPlayingVideo] = useState<LibraryVideo | null>(null);

  const { showInFolder } = useFileSystem();
  const { videos, loading, refresh, deleteVideo, importVideo } = useLibrary();
  const { stats } = useLibraryStats();

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        toast.success("Video removed from library");
      } catch {
        toast.error("Failed to delete video");
      }
    }
  }, [deleteVideo]);

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
    } catch (err) {
      logger.error("Library", "Import error:", err);
    }
  }, [importVideo]);

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
        onSearchChange={setSearchQuery}
        onSortChange={setSortOption}
        onViewModeChange={setViewMode}
      />

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
                onPlay={() => handlePlayVideo(video)}
                onEdit={() => handleOpenInEditor(video.id)}
                onOpenFolder={() => handleOpenFolder(video.filePath)}
                onDelete={() => handleDelete(video.id)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredVideos.map((video) => (
              <VideoListRow
                key={video.id}
                video={video}
                onPlay={() => handlePlayVideo(video)}
                onEdit={() => handleOpenInEditor(video.id)}
                onOpenFolder={() => handleOpenFolder(video.filePath)}
                onDelete={() => handleDelete(video.id)}
              />
            ))}
          </div>
        )}
      </div>

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
