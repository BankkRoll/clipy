/**
 * Video editor page.
 *
 * Responsibilities:
 * - make sure a project exists (also for `/editor/:projectId` deep links)
 * - import a library video passed as `?import=<id>`
 * - lay out the media, preview, properties and timeline panels
 * - wire toolbar, context menus and keyboard shortcuts to editor commands
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Film } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useEditorStore } from "@/stores/editorStore";
import { useLibrary } from "@/hooks/useLibrary";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { MediaPanel } from "@/components/editor/media-panel";
import { PreviewPlayer } from "@/components/editor/preview-player";
import { PlaybackControls } from "@/components/editor/playback-controls";
import { PropertiesPanel, type PropertiesTab } from "@/components/editor/properties-panel";
import { Timeline } from "@/components/editor/timeline";
import { ExportDialog } from "@/components/editor/export-dialog";
import { useEditorActions } from "@/components/editor/use-editor-actions";
import { useCaptionGeneration } from "@/components/editor/use-caption-generation";
import { useExportFlow } from "@/components/editor/use-export-flow";
import { useEditorShortcuts } from "@/components/editor/use-editor-shortcuts";
import { usePlaybackClock } from "@/components/editor/use-playback-clock";

function togglePanel(ref: React.RefObject<ImperativePanelHandle>) {
  // Both panels are always mounted, so the handle is set once rendered.
  const panel = ref.current!;
  if (panel.isCollapsed()) panel.expand();
  else panel.collapse();
}

/** The editor route component, mounted at `/editor` and `/editor/:projectId`. */
export function Editor() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const importVideoId = searchParams.get("import");

  const project = useEditorStore((s) => s.project);
  const createProject = useEditorStore((s) => s.createProject);

  // Panels collapse to a rail instead of disappearing, and can always be
  // brought back from the rail or the header toggle.
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const toggleLeftPanel = useCallback(() => togglePanel(leftPanelRef), []);
  const toggleRightPanel = useCallback(() => togglePanel(rightPanelRef), []);

  const [rightTab, setRightTab] = useState<PropertiesTab>("properties");
  const [showExportDialog, setShowExportDialog] = useState(false);

  const { videos: libraryVideos, loading: libraryLoading } = useLibrary();
  const { settings } = useSettings();
  const actions = useEditorActions();
  const captions = useCaptionGeneration();
  const exportFlow = useExportFlow(() => setShowExportDialog(false));
  usePlaybackClock();

  // The store is in-memory only, so a deep link (or reload) on
  // /editor/:projectId arrives with no project; start a fresh one rather
  // than waiting forever for a project that will never load.
  useEffect(() => {
    if (!project) createProject("Untitled Project");
  }, [project, createProject]);

  const importedRef = useRef<string | null>(null);
  const { addLibraryVideo } = actions;
  useEffect(() => {
    if (!importVideoId || !project || libraryLoading || importedRef.current === importVideoId) {
      return;
    }
    importedRef.current = importVideoId;
    const video = libraryVideos.find((v) => v.id === importVideoId);
    if (video) addLibraryVideo(video);
    else toast.error("That video is no longer in your library");
    void navigate(`/editor/${project.id}`, { replace: true });
  }, [importVideoId, project, libraryVideos, libraryLoading, navigate, addLibraryVideo]);

  const handleAddText = () => {
    actions.addText();
    setRightTab("text");
  };

  const { togglePlay, seek, seekRelative, undo, redo } = useEditorStore.getState();
  useEditorShortcuts({
    togglePlay,
    delete: () => void actions.deleteSelected(),
    save: () => void actions.saveProject(),
    undo,
    redo,
    copy: actions.copySelected,
    paste: () => actions.pasteClip(),
    cut: actions.cutSelected,
    duplicate: actions.duplicateSelected,
    split: actions.splitSelected,
    seekBack: () => seekRelative(-1),
    seekBackFar: () => seekRelative(-5),
    seekForward: () => seekRelative(1),
    seekForwardFar: () => seekRelative(5),
    seekStart: () => seek(0),
    seekEnd: () => seek(useEditorStore.getState().duration),
  });

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Film className="mx-auto h-12 w-12 animate-pulse text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">Initializing editor...</h2>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        <EditorToolbar
          onOpen={() => void actions.openProject()}
          onSave={() => void actions.saveProject()}
          onExport={() => setShowExportDialog(true)}
          onCopy={actions.copySelected}
          onPaste={() => actions.pasteClip()}
          onSplit={actions.splitSelected}
          onDelete={() => void actions.deleteSelected()}
          canPaste={actions.clipboard !== null}
        />

        <ResizablePanelGroup direction="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={75} minSize={30} className="min-h-0">
            <ResizablePanelGroup direction="horizontal" className="min-h-0">
              {!leftPanelOpen && (
                <div className="flex w-10 flex-shrink-0 flex-col items-center border-r border-border bg-card pt-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Show media panel"
                        onClick={toggleLeftPanel}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Show Media</TooltipContent>
                  </Tooltip>
                </div>
              )}

              <ResizablePanel
                ref={leftPanelRef}
                order={1}
                collapsible
                collapsedSize={0}
                defaultSize={20}
                minSize={14}
                maxSize={35}
                onCollapse={() => setLeftPanelOpen(false)}
                onExpand={() => setLeftPanelOpen(true)}
                className="min-w-0"
              >
                <MediaPanel
                  libraryVideos={libraryVideos}
                  libraryLoading={libraryLoading}
                  onImport={() => void actions.importFiles()}
                  onAddLibraryVideo={actions.addLibraryVideo}
                  onAddText={handleAddText}
                  captions={captions}
                  onCollapse={toggleLeftPanel}
                />
              </ResizablePanel>

              <ResizableHandle withHandle className={cn(!leftPanelOpen && "hidden")} />

              <ResizablePanel order={2} defaultSize={60} minSize={30} className="min-w-0">
                <div className="flex h-full flex-col">
                  <PreviewPlayer />
                  <PlaybackControls />
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle className={cn(!rightPanelOpen && "hidden")} />

              <ResizablePanel
                ref={rightPanelRef}
                order={3}
                collapsible
                collapsedSize={0}
                defaultSize={20}
                minSize={14}
                maxSize={35}
                onCollapse={() => setRightPanelOpen(false)}
                onExpand={() => setRightPanelOpen(true)}
                className="min-w-0"
              >
                <PropertiesPanel
                  activeTab={rightTab}
                  onTabChange={setRightTab}
                  onCollapse={toggleRightPanel}
                />
              </ResizablePanel>

              {!rightPanelOpen && (
                <div className="flex w-10 flex-shrink-0 flex-col items-center border-l border-border bg-card pt-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Show properties panel"
                        onClick={toggleRightPanel}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">Show Properties</TooltipContent>
                  </Tooltip>
                </div>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={25} minSize={12} maxSize={60} className="min-h-0">
            <Timeline
              actions={actions}
              canPaste={actions.clipboard !== null}
              snap={{
                snapToClips: settings?.editor.snapToClips ?? true,
                snapToPlayhead: settings?.editor.snapToPlayhead ?? false,
              }}
            />
          </ResizablePanel>
        </ResizablePanelGroup>

        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          projectName={project.name}
          onExport={(s) => void exportFlow.startExport(s)}
          onCancel={() => void exportFlow.cancelExport()}
          exporting={exportFlow.exporting}
          exportProgress={exportFlow.progress}
          settings={settings}
        />
      </div>
    </TooltipProvider>
  );
}
