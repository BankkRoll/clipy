import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorStore } from "@/stores/editorStore";
import type { Clip, FilterType } from "@/types/editor";
import { FILTER_PRESETS, getFilterPreset, newFilter } from "@/lib/editor/filters";
import { patchClipProperties } from "@/components/editor/clip-updates";
import { findClip } from "@/lib/editor/timeline";

/** Props for {@link FiltersTab}. */
export interface FiltersTabProps {
  clip: Clip;
}

function liveFilters(clipId: string) {
  const project = useEditorStore.getState().project;
  return (project && findClip(project.tracks, clipId)?.clip.properties.filters) || [];
}

/**
 * "Filters" tab: add, adjust and remove color/blur/sharpen filters on a clip.
 */
export function FiltersTab({ clip }: FiltersTabProps) {
  const commitHistory = useEditorStore((s) => s.commitHistory);

  const addFilter = (type: FilterType) => {
    patchClipProperties(clip.id, { filters: [...liveFilters(clip.id), newFilter(type)] });
    commitHistory("Add filter");
  };

  const removeFilter = (filterId: string) => {
    patchClipProperties(clip.id, {
      filters: liveFilters(clip.id).filter((f) => f.id !== filterId),
    });
    commitHistory("Remove filter");
  };

  const setFilterValue = (filterId: string, value: number) => {
    patchClipProperties(clip.id, {
      filters: liveFilters(clip.id).map((f) =>
        f.id === filterId ? { ...f, params: { ...f.params, value } } : f
      ),
    });
  };

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Add Filter</Label>
        {/* Uncontrolled with a fixed empty value so picking the same filter twice still fires. */}
        <Select value="" onValueChange={(v) => addFilter(v as FilterType)}>
          <SelectTrigger className="h-8" aria-label="Add filter">
            <SelectValue placeholder="Select filter..." />
          </SelectTrigger>
          <SelectContent>
            {FILTER_PRESETS.map((filter) => (
              <SelectItem key={filter.id} value={filter.id}>
                {filter.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <div className="space-y-3">
        {clip.properties.filters.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No filters applied</p>
        ) : (
          clip.properties.filters.map((filter) => {
            const preset = getFilterPreset(filter.type);
            if (!preset) return null;
            const value = Number(filter.params.value);
            return (
              <div
                key={filter.id}
                className="space-y-2 rounded border border-border p-2"
                data-testid={`filter-${filter.type}`}
              >
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{preset.name}</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`Remove ${preset.name}`}
                    onClick={() => removeFilter(filter.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Slider
                    aria-label={preset.name}
                    value={[value]}
                    onValueChange={([v]) => v !== undefined && setFilterValue(filter.id, v)}
                    onValueCommit={([v]) => {
                      // Keyboard commits arrive before onValueChange; apply first.
                      if (v !== undefined) setFilterValue(filter.id, v);
                      commitHistory("Adjust filter");
                    }}
                    min={preset.min}
                    max={preset.max}
                    step={0.01}
                  />
                  <span className="w-12 text-right text-xs">{value.toFixed(2)}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
