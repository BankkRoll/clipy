/**
 * Auto-caption flow: transcribe the first video clip with the on-device
 * Whisper pipeline and drop one text clip per caption line onto a new
 * "Text" track, as a single undo step.
 */
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import { useTauriEvent } from "@/hooks/useTauri";
import { logger } from "@/lib/logger";
import { buildCaptionClips } from "@/lib/editor/captions";
import type { CaptionStyleId, RawCaptionResult } from "@/types/captions";

/** Payload of the backend `caption-progress` event. */
export interface CaptionProgressEvent {
  stage: string;
  /** 0..1, or negative when the stage has no measurable progress. */
  progress: number;
  message: string;
}

/** State and trigger returned by {@link useCaptionGeneration}. */
export interface CaptionGeneration {
  generating: boolean;
  /** 0..1, or `null` while indeterminate. */
  progress: number | null;
  /** Human-readable current stage. */
  stage: string | null;
  generate: (opts: { model: string; styleId: CaptionStyleId }) => Promise<void>;
}

/**
 * Hook wiring the captions panel to `generate_captions`.
 *
 * @returns Generation state and the `generate` trigger.
 */
export function useCaptionGeneration(): CaptionGeneration {
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);

  useTauriEvent<CaptionProgressEvent>("caption-progress", (p) => {
    setStage(p.message);
    setProgress(p.progress >= 0 ? p.progress : null);
  });

  const generate = useCallback(
    async ({ model, styleId }: { model: string; styleId: CaptionStyleId }) => {
      const project = useEditorStore.getState().project;
      const videoClip = project?.tracks.flatMap((t) => t.clips).find((c) => c.type === "video");
      if (!videoClip) {
        toast.error("Add a video to the timeline first");
        return;
      }
      setGenerating(true);
      setProgress(null);
      try {
        const raw = await invoke<RawCaptionResult>("generate_captions", {
          sourcePath: videoClip.sourcePath,
          model,
        });
        const clips = buildCaptionClips(raw, styleId, videoClip);
        if (clips.length === 0) {
          toast.error("No speech detected in this clip");
          return;
        }

        const store = useEditorStore.getState();
        store.batch("Generate captions", () => {
          const trackId = store.addTrack("text");
          for (const clip of clips) store.addClip(trackId, clip);
        });
        toast.success(`Added ${clips.length} captions`);
      } catch (e) {
        logger.error("Editor", "Caption generation failed:", e);
        toast.error(`Caption generation failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setGenerating(false);
        setProgress(null);
        setStage(null);
      }
    },
    []
  );

  return { generating, progress, stage, generate };
}
