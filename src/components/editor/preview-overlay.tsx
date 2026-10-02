import { useMemo } from "react";
import type { Clip, ProjectSettings, Track } from "@/types/editor";
import {
  buildTransformCss,
  captionWordStyle,
  outlineShadow,
  previewOpacity,
} from "@/lib/editor/preview";

/** Props for {@link PreviewOverlay}. */
export interface PreviewOverlayProps {
  tracks: Track[];
  currentTime: number;
  /** Project canvas size; transform offsets are relative to it. */
  canvas?: Pick<ProjectSettings, "width" | "height">;
}

const DEFAULT_CANVAS = { width: 1920, height: 1080 };
/**
 * Renders text overlays and karaoke captions on top of the preview media.
 * Absolutely fills the preview box; each active text clip is positioned by
 * alignment plus its transform, and faded by opacity and fade in/out.
 * Pointer events are off so it never blocks the video.
 */
export function PreviewOverlay({
  tracks,
  currentTime,
  canvas = DEFAULT_CANVAS,
}: PreviewOverlayProps) {
  const activeTextClips = useMemo(() => {
    const out: Clip[] = [];
    for (const track of tracks) {
      if (track.type !== "text" || track.muted) continue;
      for (const clip of track.clips) {
        if (
          clip.type === "text" &&
          currentTime >= clip.startTime &&
          currentTime < clip.endTime &&
          clip.properties.text?.content
        ) {
          out.push(clip);
        }
      }
    }
    return out;
  }, [tracks, currentTime]);

  if (activeTextClips.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="preview-overlay"
    >
      {activeTextClips.map((clip) => {
        const t = clip.properties.text!;
        const justify =
          t.verticalAlign === "top"
            ? "flex-start"
            : t.verticalAlign === "bottom"
              ? "flex-end"
              : "center";
        const align =
          t.align === "left" ? "flex-start" : t.align === "right" ? "flex-end" : "center";
        const hasBackground = t.backgroundColor !== "transparent";
        const clipTime = currentTime - clip.startTime;
        return (
          <div
            key={clip.id}
            className="absolute inset-0 flex p-[4%]"
            style={{
              justifyContent: align,
              alignItems: justify,
              opacity: previewOpacity(clip, currentTime),
            }}
          >
            <span
              data-testid={`overlay-text-${clip.id}`}
              style={{
                transform: buildTransformCss(clip.properties.transform, canvas),
                // fontSize is authored against a 1080p canvas; scale to the
                // preview height via cqh so it looks right at any size.
                fontSize: `${(t.fontSize / 1080) * 100}cqh`,
                fontFamily: t.fontFamily,
                fontWeight: t.fontWeight,
                color: t.color,
                backgroundColor: hasBackground ? t.backgroundColor : undefined,
                textAlign: t.align,
                padding: hasBackground ? "0.1em 0.3em" : undefined,
                lineHeight: 1.2,
                whiteSpace: "pre-wrap",
                textShadow: outlineShadow(t.outlineColor),
                maxWidth: "92%",
              }}
            >
              {t.captionWords && t.captionWords.length > 0
                ? t.captionWords.map((w, i) => (
                    <span key={i}>
                      <span
                        data-active={clipTime >= w.start && clipTime < w.end ? "true" : undefined}
                        style={captionWordStyle(t, clipTime >= w.start && clipTime < w.end)}
                      >
                        {w.text}
                      </span>
                      {i < t.captionWords!.length - 1 ? " " : ""}
                    </span>
                  ))
                : t.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
