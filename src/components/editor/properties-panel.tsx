import { ChevronRight, Settings2, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipPropertiesTab } from "@/components/editor/clip-properties-tab";
import { FiltersTab } from "@/components/editor/filters-tab";
import { TextPropertiesTab } from "@/components/editor/text-properties-tab";
import { useEditorStore } from "@/stores/editorStore";
import { findClip } from "@/lib/editor/timeline";

/** Tabs of the properties panel. */
export type PropertiesTab = "properties" | "filters" | "text";

/** Props for {@link PropertiesPanel}. */
export interface PropertiesPanelProps {
  activeTab: PropertiesTab;
  onTabChange: (tab: PropertiesTab) => void;
  onCollapse: () => void;
}

/**
 * Right editor panel: edits the single selected clip. Shows a hint when no
 * clip (or more than one) is selected.
 */
export function PropertiesPanel({ activeTab, onTabChange, onCollapse }: PropertiesPanelProps) {
  const clip = useEditorStore((s) => {
    if (!s.project || s.selectedClipIds.length !== 1) return null;
    return findClip(s.project.tracks, s.selectedClipIds[0]!)?.clip ?? null;
  });
  // A non-text clip has no Text tab; fall back rather than render an empty panel.
  const tab = activeTab === "text" && clip?.type !== "text" ? "properties" : activeTab;

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-sm font-medium">Properties</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Hide properties panel"
          onClick={onCollapse}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {clip ? (
        <Tabs
          value={tab}
          onValueChange={(v) => onTabChange(v as PropertiesTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList variant="underline" className="flex-shrink-0 px-2">
            <TabsTrigger value="properties" className="flex-1">
              <Settings2 className="h-3.5 w-3.5" />
              Props
            </TabsTrigger>
            <TabsTrigger value="filters" className="flex-1">
              <Sparkles className="h-3.5 w-3.5" />
              Filters
            </TabsTrigger>
            {clip.type === "text" && (
              <TabsTrigger value="text" className="flex-1">
                <Type className="h-3.5 w-3.5" />
                Text
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent
            value="properties"
            className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
          >
            <ClipPropertiesTab clip={clip} />
          </TabsContent>
          <TabsContent value="filters" className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            <FiltersTab clip={clip} />
          </TabsContent>
          {clip.type === "text" && (
            <TabsContent value="text" className="m-0 min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
              <TextPropertiesTab clip={clip} />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center text-muted-foreground">
            <Settings2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-sm">Select a clip to edit</p>
          </div>
        </div>
      )}
    </div>
  );
}
