import { useState } from "react";
import { Film } from "lucide-react";
import { thumbnailSrc } from "@/lib/utils";

/** Props for {@link VideoThumbnail}. */
export interface VideoThumbnailProps {
  /** Thumbnail URL or local path; empty for imported videos without one. */
  src: string;
  alt: string;
}

/**
 * Library thumbnail that falls back to a placeholder when there is no
 * thumbnail (imported files) or it fails to load.
 */
export function VideoThumbnail({ src, alt }: VideoThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const resolved = failed ? null : thumbnailSrc(src);

  if (!resolved) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-muted"
        data-testid="thumbnail-placeholder"
      >
        <Film className="h-8 w-8 text-muted-foreground/40" />
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={alt}
      className="h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
