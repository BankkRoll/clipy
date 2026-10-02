/**
 * Turn a Whisper transcription into timeline text clips.
 *
 * Word timings from the backend are relative to the start of the SOURCE
 * media. They are mapped onto the timeline through the video clip's trim-in
 * point and playback speed, and lines that fall outside the clip's trimmed
 * range are dropped.
 */
import type { Clip, CaptionWordTiming } from "@/types/editor";
import {
  getCaptionStyle,
  groupWordsIntoLines,
  type CaptionStyleId,
  type RawCaptionResult,
} from "@/types/captions";
import { defaultClipProperties, type NewClip } from "./clips";

/** Shortest caption a line becomes, in seconds, so single short words stay readable. */
export const MIN_CAPTION_DURATION = 0.4;

/** Font size of generated captions, authored against a 1080p canvas. */
export const CAPTION_FONT_SIZE = 54;

/**
 * Build one text clip per caption line.
 *
 * @param raw - Result of the `generate_captions` command.
 * @param styleId - Caption style preset to apply.
 * @param videoClip - Clip that was transcribed; positions the captions.
 * @returns Text clip payloads in timeline order.
 */
export function buildCaptionClips(
  raw: RawCaptionResult,
  styleId: CaptionStyleId,
  videoClip: Clip
): NewClip[] {
  const style = getCaptionStyle(styleId);
  const { lines, words } = groupWordsIntoLines(
    raw.words.map((w) => ({
      text: w.text,
      startMs: w.start_ms,
      endMs: w.end_ms,
      confidence: w.confidence,
    })),
    style.maxWordsPerLine
  );

  const speed = videoClip.properties.speed || 1;
  const toTimeline = (sourceSeconds: number) =>
    videoClip.startTime + (sourceSeconds - videoClip.sourceStart) / speed;
  const casing = (text: string) => (style.uppercase ? text.toUpperCase() : text);

  const clips: NewClip[] = [];
  for (const line of lines) {
    const lineStartSrc = line.startMs / 1000;
    const lineEndSrc = line.endMs / 1000;
    if (lineEndSrc <= videoClip.sourceStart || lineStartSrc >= videoClip.sourceEnd) continue;

    const start = Math.max(videoClip.startTime, toTimeline(lineStartSrc));
    const end = Math.max(
      Math.min(videoClip.endTime, toTimeline(lineEndSrc)),
      start + MIN_CAPTION_DURATION
    );

    const captionWords: CaptionWordTiming[] = line.wordIndices.map((wi) => {
      const w = words[wi]!;
      return {
        text: casing(w.text),
        start: toTimeline(w.startMs / 1000) - start,
        end: toTimeline(w.endMs / 1000) - start,
      };
    });

    clips.push({
      type: "text",
      name: line.text.slice(0, 24) || "Caption",
      startTime: start,
      endTime: end,
      sourceStart: 0,
      sourceEnd: end - start,
      sourcePath: "",
      thumbnails: [],
      properties: defaultClipProperties({
        content: casing(line.text),
        fontFamily: style.fontFamily,
        fontSize: CAPTION_FONT_SIZE,
        fontWeight: style.fontWeight,
        color: style.baseColor,
        backgroundColor: "transparent",
        align: "center",
        verticalAlign: "bottom",
        highlightStyle: style.highlight,
        outlineColor: style.outlineColor,
        ...(style.highlight !== "none" && { highlightColor: style.activeColor }),
        captionWords,
      }),
    });
  }
  return clips;
}
