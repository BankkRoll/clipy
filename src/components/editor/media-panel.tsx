import { useState } from "react";
import {
  Captions,
  ChevronLeft,
  Film,
  Loader2,
  Music,
  Plus,
  Type,
  Upload,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaptionsPanel } from "@/components/editor/captions-panel";
import type { CaptionGeneration } from "@/components/editor/use-caption-generation";
import { useEditorStore } from "@/stores/editorStore";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { formatDuration } from "@/lib/utils";

type MediaTab = "media" | "captions" | "text" | "audio";

/** Props for {@link MediaPanel}. */
export interface MediaPanelProps {
  libraryVideos: LibraryVideo[];
  libraryLoading: boolean;
  onImport: () => void;
  onAddLibraryVideo: (video: LibraryVideo) => void;
  onAddText: () => void;
  captions: CaptionGeneration;
  onCollapse: () => void;
}

/**
 * Left editor panel: downloaded library + disk import, auto-captions, text
 * overlays, and track creation.
 */
export function MediaPanel({
  libraryVideos,
  libraryLoading,
  onImport,
  onAddLibraryVideo,
  onAddText,
  captions,
  onCollapse,
}: MediaPanelProps) {
  const [tab, setTab] = useState<MediaTab>("media");
  const addTrack = useEditorStore((s) => s.addTrack);
  const hasVideo = useEditorStore(
    (s) => s.project?.tracks.some((t) => t.clips.some((c) => c.type === "video")) ?? false
  );

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">Media</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Hide media panel"
          onClick={onCollapse}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as MediaTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList variant="underline" className="flex-shrink-0 px-2">
          <TabsTrigger value="media">
            <Film className="h-3.5 w-3.5" />
            Media
          </TabsTrigger>
          <TabsTrigger value="captions">
            <Captions className="h-3.5 w-3.5" />
            Captions
          </TabsTrigger>
          <TabsTrigger value="text">
            <Type className="h-3.5 w-3.5" />
            Text
          </TabsTrigger>
          <TabsTrigger value="audio">
            <Music className="h-3.5 w-3.5" />
            Audio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="media" className="m-0 min-h-0 flex-1 overflow-y-auto p-2">
          <Button
            variant="outline"
            size="sm"
            className="mb-2 w-full justify-start"
            onClick={onImport}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import from disk
          </Button>
          <div className="grid grid-cols-2 gap-2">
            {libraryLoading ? (
              <div className="col-span-2 flex items-center justify-center py-8" role="status">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : libraryVideos.length === 0 ? (
              <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                <Film className="mx-auto mb-2 h-8 w-8 opacity-50" />
                <p>No media yet</p>
              </div>
            ) : (
              libraryVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  className="group relative overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-primary/60"
                  onClick={() => onAddLibraryVideo(video)}
                  title={video.title}
                >
                  <div className="aspect-video bg-muted">
                    {video.thumbnail && (
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                      <Plus className="h-7 w-7 text-white" />
                    </div>
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">
                      {formatDuration(video.duration)}
                    </span>
                  </div>
                  <p className="truncate p-1.5 text-[11px] font-medium">{video.title}</p>
                </button>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="captions" className="m-0 min-h-0 flex-1 overflow-y-auto p-3">
          <CaptionsPanel
            hasVideo={hasVideo}
            onGenerate={captions.generate}
            generating={captions.generating}
            progress={captions.progress}
            stageLabel={captions.stage}
          />
        </TabsContent>

        <TabsContent value="text" className="m-0 min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <p className="text-xs font-medium text-muted-foreground">Text</p>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={onAddText}>
            <Type className="mr-2 h-4 w-4" />
            Add Text Overlay
          </Button>
        </TabsContent>

        <TabsContent value="audio" className="m-0 min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          <p className="text-xs font-medium text-muted-foreground">Audio</p>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => addTrack("audio")}
          >
            <Music className="mr-2 h-4 w-4" />
            Add Audio Track
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start"
            onClick={() => addTrack("video")}
          >
            <Video className="mr-2 h-4 w-4" />
            Add Video Track
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
