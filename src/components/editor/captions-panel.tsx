import { useState } from "react";
import { Captions, Sparkles, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CAPTION_STYLE_PRESETS, type CaptionStyleId } from "@/types/captions";

interface CaptionsPanelProps {
  hasVideo: boolean;
  /** Trigger transcription of the active video clip. Wired by the editor. */
  onGenerate?: (opts: { model: string; styleId: CaptionStyleId }) => Promise<void>;
  generating?: boolean;
  /** Whisper transcription progress 0..1, or null when not running. */
  progress?: number | null;
  /** Human-readable current stage (e.g. "Transcribing 42%"). */
  stageLabel?: string | null;
}

const MODELS = [
  { id: "tiny.en", label: "Tiny — fastest", note: "~75 MB" },
  { id: "base.en", label: "Base — recommended", note: "~142 MB" },
  { id: "small.en", label: "Small — most accurate", note: "~466 MB" },
];

export function CaptionsPanel({
  hasVideo,
  onGenerate,
  generating = false,
  progress = null,
  stageLabel = null,
}: CaptionsPanelProps) {
  const [model, setModel] = useState("base.en");
  const [styleId, setStyleId] = useState<CaptionStyleId>("hormozi");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" />
          Auto Captions
        </div>
        <p className="text-xs text-muted-foreground">
          Transcribe speech on-device with Whisper and add word-perfect captions.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Model</Label>
        <Select value={model} onValueChange={setModel} disabled={generating}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                <span className="flex w-full items-center justify-between gap-3">
                  <span>{m.label}</span>
                  <span className="text-xs text-muted-foreground">{m.note}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Caption style</Label>
        <div className="grid grid-cols-2 gap-2">
          {CAPTION_STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setStyleId(preset.id)}
              className={cn(
                "flex aspect-video flex-col items-center justify-center gap-1 rounded-lg border p-2 transition-colors",
                styleId === preset.id
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-primary/50"
              )}
            >
              <span
                className="text-sm font-extrabold leading-none"
                style={{
                  color: preset.activeColor,
                  WebkitTextStroke: `1px ${preset.outlineColor}`,
                  fontFamily: preset.fontFamily,
                  textTransform: preset.uppercase ? "uppercase" : "none",
                }}
              >
                {preset.sampleText}
              </span>
              <span className="text-[10px] text-muted-foreground">{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        disabled={!hasVideo || generating || !onGenerate}
        onClick={() => onGenerate?.({ model, styleId })}
      >
        {generating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {stageLabel ?? "Working…"}
          </>
        ) : (
          <>
            <Wand2 className="mr-2 h-4 w-4" />
            Generate Captions
          </>
        )}
      </Button>

      {generating && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full bg-primary transition-all",
                progress == null && "animate-pulse"
              )}
              style={{ width: progress != null ? `${Math.round(progress * 100)}%` : "100%" }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {stageLabel ?? "Preparing…"}
            {progress == null && " (first run downloads the model — this can take a minute)"}
          </p>
        </div>
      )}

      {!hasVideo && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Captions className="h-3.5 w-3.5" />
          Add a video to the timeline first.
        </p>
      )}
    </div>
  );
}
