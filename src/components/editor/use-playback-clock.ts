/**
 * Drives the editor playhead while playing, using animation frames.
 */
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";

/**
 * Advance `currentTime` by wall-clock time each animation frame while the
 * store says it is playing. At the end of the timeline playback stops and
 * the playhead rewinds to 0.
 */
export function usePlaybackClock(): void {
  const isPlaying = useEditorStore((s) => s.isPlaying);

  useEffect(() => {
    if (!isPlaying) return;
    let frame = 0;
    let last = performance.now();

    const tick = () => {
      const now = performance.now();
      const delta = (now - last) / 1000;
      last = now;

      const state = useEditorStore.getState();
      if (!state.isPlaying) return;
      const next = state.currentTime + delta;
      if (next >= state.duration) {
        state.pause();
        state.seek(0);
        return;
      }
      state.seek(next);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying]);
}
