import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Film, Loader2 } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PreviewOverlay } from "@/components/editor/preview-overlay";
import { useEditorStore } from "@/stores/editorStore";
import type { Clip } from "@/types/editor";
import { mediaSrc } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { findActiveClip, getSourceTimeForClip } from "@/lib/editor/timeline";
import {
  buildTransformCss,
  describeMediaError,
  mediaElementVolume,
  previewOpacity,
} from "@/lib/editor/preview";
import {
  activeSharpenAmount,
  buildCssFilter,
  sharpenFilterId,
  sharpenKernel,
} from "@/lib/editor/filters";

// Below this the element is left alone while paused; while playing the media
// clock runs freely and is only corrected once it drifts noticeably.
const PAUSED_SEEK_TOLERANCE = 0.1;
const PLAYING_SEEK_TOLERANCE = 0.5;

/**
 * Keep a media element in step with the timeline: seek, volume, speed and
 * play/pause.
 */
function syncMediaElement(
  el: HTMLMediaElement,
  clip: Clip,
  time: number,
  playing: boolean,
  master: number,
  muted: boolean
) {
  const target = getSourceTimeForClip(clip, time);
  const drift = Math.abs(el.currentTime - target);
  if (drift > (playing ? PLAYING_SEEK_TOLERANCE : PAUSED_SEEK_TOLERANCE)) el.currentTime = target;
  el.volume = mediaElementVolume({ master, muted, clip, time });
  el.muted = muted;
  el.playbackRate = clip.properties.speed || 1;
  if (playing) {
    if (el.paused) el.play().catch(() => {});
  } else {
    el.pause();
  }
}

/**
 * Center preview: renders the top-most visible video/image clip at the
 * playhead with its filters, transform, opacity and fades, plays the active
 * audio clip, and overlays text/captions.
 */
export function PreviewPlayer() {
  const tracks = useEditorStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const canvas = useEditorStore((s) => s.project?.settings);
  const currentTime = useEditorStore((s) => s.currentTime);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const volume = useEditorStore((s) => s.volume);
  const isMuted = useEditorStore((s) => s.isMuted);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visualClip = findActiveClip(tracks, currentTime, "video");
  const audioClip = findActiveClip(tracks, currentTime, "audio");
  const videoSrc = visualClip?.type === "video" ? mediaSrc(visualClip.sourcePath) : null;
  const audioSrc = audioClip ? mediaSrc(audioClip.sourcePath) : null;

  useEffect(() => {
    setError(null);
    setLoading(videoSrc !== null);
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && visualClip?.type === "video") {
      syncMediaElement(video, visualClip, currentTime, isPlaying, volume, isMuted);
    }
  }, [visualClip, currentTime, isPlaying, volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current!;
    if (audioClip) syncMediaElement(audio, audioClip, currentTime, isPlaying, volume, isMuted);
    else audio.pause();
  }, [audioClip, currentTime, isPlaying, volume, isMuted]);

  const sharpen = visualClip ? activeSharpenAmount(visualClip.properties.filters) : null;
  const visualStyle: CSSProperties | undefined = visualClip
    ? {
        opacity: previewOpacity(visualClip, currentTime),
        filter: buildCssFilter(visualClip.properties.filters, visualClip.id) || undefined,
        // A visible clip implies a loaded project, so its canvas is known.
        transform: buildTransformCss(visualClip.properties.transform, canvas!),
      }
    : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-black p-4">
      <div
        className="relative aspect-video w-full max-w-4xl overflow-hidden rounded bg-neutral-900"
        style={{ containerType: "size" }}
        data-testid="preview"
      >
        {visualClip && sharpen !== null && (
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <filter id={sharpenFilterId(visualClip.id)}>
              <feConvolveMatrix
                order="3"
                preserveAlpha="true"
                kernelMatrix={sharpenKernel(sharpen)}
              />
            </filter>
          </svg>
        )}

        {visualClip?.type === "image" && (
          <img
            src={mediaSrc(visualClip.sourcePath)}
            alt={visualClip.name}
            className="h-full w-full object-contain"
            style={visualStyle}
          />
        )}

        {visualClip?.type === "video" && (
          <>
            <video
              ref={videoRef}
              src={mediaSrc(visualClip.sourcePath)}
              className="h-full w-full object-contain"
              playsInline
              data-testid="preview-video"
              onLoadedData={() => {
                setLoading(false);
                setError(null);
              }}
              onCanPlay={() => setLoading(false)}
              onError={(e) => {
                const mediaError = e.currentTarget.error;
                logger.error("Editor", "Video error:", mediaError?.code, mediaError?.message);
                setError(describeMediaError(mediaError?.code));
                setLoading(false);
              }}
              style={visualStyle}
            />
            {loading && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/50"
                role="status"
                aria-label="Loading video"
              >
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center text-white">
                  <Film className="mx-auto h-12 w-12 opacity-50" />
                  <p className="mt-2 font-medium">Unable to load video</p>
                  <p className="mt-1 text-sm text-white/60">{error}</p>
                  <p className="mt-2 text-xs text-white/40">Path: {visualClip.sourcePath}</p>
                </div>
              </div>
            )}
          </>
        )}

        {!visualClip && (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Film />
              </EmptyMedia>
              <EmptyTitle>No preview</EmptyTitle>
              <EmptyDescription>Add media to the timeline to preview</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {/* Always mounted so audio-only timelines still play. */}
        <audio
          ref={audioRef}
          src={audioSrc ?? undefined}
          className="hidden"
          data-testid="preview-audio"
        />

        <PreviewOverlay tracks={tracks} currentTime={currentTime} {...(canvas ? { canvas } : {})} />
      </div>
    </div>
  );
}

const EMPTY_TRACKS: never[] = [];
