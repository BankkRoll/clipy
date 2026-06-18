import { useMemo } from "react";
import type { Clip, Track } from "@/types/editor";

interface PreviewOverlayProps {
  tracks: Track[];
  currentTime: number;
}

/**
 * Renders text overlays (and, later, captions) on top of the preview video.
 * Absolutely fills the preview box; each active text clip is positioned by its
 * transform + alignment. Pointer-events are off so it never blocks the video.
 */
export function PreviewOverlay({ tracks, currentTime }: PreviewOverlayProps) {
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {activeTextClips.map((clip) => {
        const t = clip.properties.text!;
        const tf = clip.properties.transform;
        const justify =
          t.verticalAlign === "top"
            ? "flex-start"
            : t.verticalAlign === "bottom"
              ? "flex-end"
              : "center";
        const align =
          t.align === "left" ? "flex-start" : t.align === "right" ? "flex-end" : "center";
        return (
          <div
            key={clip.id}
            className="absolute inset-0 flex p-[4%]"
            style={{
              justifyContent: align,
              alignItems: justify,
              opacity: clip.properties.opacity,
            }}
          >
            <span
              style={{
                transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scaleX}, ${tf.scaleY}) rotate(${tf.rotation}deg)`,
                // fontSize is authored against a 1080p canvas; scale to the
                // preview height via cqh so it looks right at any size.
                fontSize: `${(t.fontSize / 1080) * 100}cqh`,
                fontFamily: t.fontFamily,
                fontWeight: t.fontWeight,
                color: t.color,
                backgroundColor:
                  t.backgroundColor === "transparent" ? undefined : t.backgroundColor,
                textAlign: t.align,
                padding: t.backgroundColor === "transparent" ? undefined : "0.1em 0.3em",
                lineHeight: 1.2,
                whiteSpace: "pre-wrap",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                maxWidth: "92%",
              }}
            >
              {t.captionWords && t.captionWords.length > 0
                ? t.captionWords.map((w, i) => {
                    const clipTime = currentTime - clip.startTime;
                    const active = clipTime >= w.start && clipTime < w.end;
                    return (
                      <span
                        key={i}
                        style={{
                          color: active && t.highlightColor ? t.highlightColor : undefined,
                          transition: "color 80ms linear",
                        }}
                      >
                        {w.text}
                        {i < t.captionWords!.length - 1 ? " " : ""}
                      </span>
                    );
                  })
                : t.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
