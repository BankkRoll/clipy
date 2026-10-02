import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Clip, TextProperties } from "@/types/editor";
import { patchText } from "@/components/editor/clip-updates";

/** Props for {@link TextPropertiesTab}. */
export interface TextPropertiesTabProps {
  clip: Clip;
}

const FONT_FAMILIES = [
  "Arial",
  "Helvetica",
  "Times New Roman",
  "Georgia",
  "Verdana",
  "Courier New",
  "Impact",
  "Comic Sans MS",
];

const FONT_WEIGHTS = [
  { value: "300", label: "Light" },
  { value: "400", label: "Normal" },
  { value: "500", label: "Medium" },
  { value: "600", label: "Semi Bold" },
  { value: "700", label: "Bold" },
  { value: "800", label: "Extra Bold" },
];

/**
 * "Text" tab for text clips: content, font, size, weight, colors and
 * alignment.
 */
export function TextPropertiesTab({ clip }: TextPropertiesTabProps) {
  const updateClip = useEditorStore((s) => s.updateClip);
  const commitHistory = useEditorStore((s) => s.commitHistory);
  const t: Partial<TextProperties> = clip.properties.text ?? {};

  return (
    <>
      <div className="space-y-2">
        <Label className="text-xs">Text Content</Label>
        <textarea
          aria-label="Text content"
          value={t.content ?? ""}
          onChange={(e) => {
            patchText(clip.id, { content: e.target.value });
            updateClip(clip.id, { name: e.target.value.slice(0, 20) || "Text" });
          }}
          onBlur={() => commitHistory("Edit text")}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Enter your text..."
        />
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Font Family</Label>
        <Select
          value={t.fontFamily || "Arial"}
          onValueChange={(fontFamily) => patchText(clip.id, { fontFamily }, "Change font")}
        >
          <SelectTrigger aria-label="Font family">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((font) => (
              <SelectItem key={font} value={font}>
                {font}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label className="text-xs">Font Size: {t.fontSize || 48}px</Label>
          <Slider
            aria-label="Font size"
            value={[t.fontSize || 48]}
            onValueChange={([v]) => v !== undefined && patchText(clip.id, { fontSize: v })}
            onValueCommit={() => commitHistory("Change font size")}
            min={12}
            max={200}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Font Weight</Label>
          <Select
            value={String(t.fontWeight || 400)}
            onValueChange={(value) =>
              patchText(clip.id, { fontWeight: parseInt(value, 10) }, "Change font weight")
            }
          >
            <SelectTrigger aria-label="Font weight">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <Label className="text-xs">Text Color</Label>
          <Input
            aria-label="Text color"
            type="color"
            value={t.color || "#ffffff"}
            onChange={(e) => patchText(clip.id, { color: e.target.value })}
            onBlur={() => commitHistory("Change text color")}
            className="h-8 w-full"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Background</Label>
          <div className="flex gap-1">
            <Input
              aria-label="Background color"
              type="color"
              value={
                !t.backgroundColor || t.backgroundColor === "transparent"
                  ? "#000000"
                  : t.backgroundColor
              }
              onChange={(e) => patchText(clip.id, { backgroundColor: e.target.value })}
              onBlur={() => commitHistory("Change text background")}
              className="h-8 w-full"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-[10px]"
              disabled={t.backgroundColor === "transparent"}
              onClick={() =>
                patchText(clip.id, { backgroundColor: "transparent" }, "Clear text background")
              }
            >
              None
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label className="text-xs">Horizontal Alignment</Label>
        <div className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <Button
              key={align}
              variant={t.align === align ? "default" : "outline"}
              size="sm"
              className="flex-1 capitalize"
              aria-pressed={t.align === align}
              onClick={() => patchText(clip.id, { align }, "Align text")}
            >
              {align}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Vertical Alignment</Label>
        <div className="flex gap-1">
          {(["top", "middle", "bottom"] as const).map((verticalAlign) => (
            <Button
              key={verticalAlign}
              variant={t.verticalAlign === verticalAlign ? "default" : "outline"}
              size="sm"
              className="flex-1 capitalize"
              aria-pressed={t.verticalAlign === verticalAlign}
              onClick={() => patchText(clip.id, { verticalAlign }, "Align text")}
            >
              {verticalAlign}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
