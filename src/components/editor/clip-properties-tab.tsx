import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useEditorStore } from "@/stores/editorStore";
import type { Clip, Transform } from "@/types/editor";
import { defaultTransform } from "@/lib/editor/clips";
import { patchClipProperties, patchTransform } from "@/components/editor/clip-updates";

/** Props for {@link ClipPropertiesTab}. */
export interface ClipPropertiesTabProps {
  clip: Clip;
}

function PercentSlider({
  label,
  value,
  onChange,
  commit,
  min = 0,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  commit: string;
  min?: number;
  max: number;
  step?: number;
}) {
  const commitHistory = useEditorStore((s) => s.commitHistory);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Slider
          aria-label={label}
          value={[value * 100]}
          onValueChange={([v]) => v !== undefined && onChange(v / 100)}
          onValueCommit={() => commitHistory(commit)}
          min={min}
          max={max}
          step={step}
        />
        <span className="w-12 text-right text-xs">{Math.round(value * 100)}%</span>
      </div>
    </div>
  );
}

const TRANSFORM_FIELDS: { key: keyof Transform; label: string; step?: string; fallback: number }[] =
  [
    { key: "x", label: "X Position", fallback: 0 },
    { key: "y", label: "Y Position", fallback: 0 },
    { key: "scaleX", label: "Scale X", step: "0.1", fallback: 1 },
    { key: "scaleY", label: "Scale Y", step: "0.1", fallback: 1 },
  ];

/**
 * "Props" tab: name, volume, opacity, speed, fades and transform of a clip.
 */
export function ClipPropertiesTab({ clip }: ClipPropertiesTabProps) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const p = clip.properties;

  const numberInput = (key: keyof Transform, fallback: number, label: string, step?: string) => (
    <Input
      aria-label={label}
      type="number"
      {...(step ? { step } : {})}
      value={p.transform[key]}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value);
        patchTransform(clip.id, { [key]: Number.isFinite(parsed) ? parsed : fallback });
      }}
      onBlur={() => commitHistory("Change transform")}
      className="h-7 text-xs"
    />
  );

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Clip Name</Label>
        <Input
          aria-label="Clip name"
          value={clip.name}
          onChange={(e) => updateClip(clip.id, { name: e.target.value })}
          onBlur={() => commitHistory("Rename clip")}
          className="h-8"
        />
      </div>

      <Separator />

      <PercentSlider
        label="Volume"
        value={p.volume}
        onChange={(volume) => patchClipProperties(clip.id, { volume })}
        commit="Change volume"
        max={200}
      />
      <PercentSlider
        label="Opacity"
        value={p.opacity}
        onChange={(opacity) => patchClipProperties(clip.id, { opacity })}
        commit="Change opacity"
        max={100}
      />
      <PercentSlider
        label="Speed"
        value={p.speed}
        onChange={(speed) => patchClipProperties(clip.id, { speed })}
        commit="Change speed"
        min={25}
        max={400}
        step={25}
      />

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Fade In (seconds)</Label>
        <Slider
          aria-label="Fade in"
          value={[p.fadeIn]}
          onValueChange={([v]) => v !== undefined && patchClipProperties(clip.id, { fadeIn: v })}
          onValueCommit={() => commitHistory("Change fade in")}
          max={5}
          step={0.1}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Fade Out (seconds)</Label>
        <Slider
          aria-label="Fade out"
          value={[p.fadeOut]}
          onValueChange={([v]) => v !== undefined && patchClipProperties(clip.id, { fadeOut: v })}
          onValueCommit={() => commitHistory("Change fade out")}
          max={5}
          step={0.1}
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Transform</Label>
        <div className="grid grid-cols-2 gap-2">
          {TRANSFORM_FIELDS.map((f) => (
            <div key={f.key}>
              <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
              {numberInput(f.key, f.fallback, f.label, f.step)}
            </div>
          ))}
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Rotation (degrees)</Label>
          {numberInput("rotation", 0, "Rotation")}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full"
          onClick={() => {
            patchClipProperties(clip.id, { transform: defaultTransform() });
            commitHistory("Reset transform");
          }}
        >
          <RotateCcw className="mr-2 h-3 w-3" />
          Reset Transform
        </Button>
      </div>
    </>
  );
}
