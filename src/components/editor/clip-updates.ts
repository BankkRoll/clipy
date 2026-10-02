/**
 * Property-panel write helpers. Each reads the clip fresh from the store so
 * rapid slider events never merge into a stale copy of the properties.
 */
import { useEditorStore } from "@/stores/editorStore";
import type { ClipProperties, TextProperties, Transform } from "@/types/editor";
import { findClip } from "@/lib/editor/timeline";

function liveClip(clipId: string) {
  const project = useEditorStore.getState().project;
  return project ? findClip(project.tracks, clipId)?.clip : undefined;
}

/**
 * Merge `patch` into a clip's properties (no history entry).
 *
 * @param clipId - Clip to update.
 * @param patch - Properties to replace.
 */
export function patchClipProperties(clipId: string, patch: Partial<ClipProperties>): void {
  const clip = liveClip(clipId);
  if (!clip) return;
  useEditorStore.getState().updateClip(clipId, { properties: { ...clip.properties, ...patch } });
}

/**
 * Merge `patch` into a clip's transform (no history entry).
 *
 * @param clipId - Clip to update.
 * @param patch - Transform fields to replace.
 */
export function patchTransform(clipId: string, patch: Partial<Transform>): void {
  const clip = liveClip(clipId);
  if (!clip) return;
  patchClipProperties(clipId, { transform: { ...clip.properties.transform, ...patch } });
}

/**
 * Merge `patch` into a text clip's text properties, optionally committing an
 * undo step for discrete edits (selects, buttons).
 *
 * @param clipId - Text clip to update.
 * @param patch - Text fields to replace.
 * @param commit - History description to record, if any.
 */
export function patchText(clipId: string, patch: Partial<TextProperties>, commit?: string): void {
  const clip = liveClip(clipId);
  if (!clip?.properties.text) return;
  patchClipProperties(clipId, { text: { ...clip.properties.text, ...patch } });
  if (commit) useEditorStore.getState().commitHistory(commit);
}
