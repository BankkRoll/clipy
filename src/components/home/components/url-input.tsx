import { useState, useEffect, useRef } from "react";
import { Loader2, AlertCircle, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Sample of popular yt-dlp supported sites for the animated placeholder
const SUPPORTED_SITES = [
  "youtube.com/watch?v=dQw4w9WgXcQ",
  "vimeo.com/123456789",
  "twitter.com/user/status/123",
  "twitch.tv/videos/123456789",
  "tiktok.com/@user/video/123",
  "soundcloud.com/artist/track",
  "dailymotion.com/video/x123abc",
  "instagram.com/p/ABC123xyz",
  "reddit.com/r/videos/comments/...",
  "facebook.com/watch/?v=123",
  "bilibili.com/video/BV1xx411c7",
  "nicovideo.jp/watch/sm12345",
  "bandcamp.com/track/song-name",
  "mixcloud.com/user/mix-name",
  "rumble.com/v123abc-video.html",
  "odysee.com/@channel/video",
  "pinterest.com/pin/123456789",
  "tumblr.com/blog/post/123",
  "ted.com/talks/speaker_title",
  "archive.org/details/video123",
];

// Popular platforms to display below input
const POPULAR_PLATFORMS = [
  // Major video platforms
  { name: "YouTube", domain: "youtube.com" },
  { name: "TikTok", domain: "tiktok.com" },
  { name: "Vimeo", domain: "vimeo.com" },
  { name: "Dailymotion", domain: "dailymotion.com" },
  { name: "Bilibili", domain: "bilibili.com" },
  { name: "Rumble", domain: "rumble.com" },
  { name: "Odysee", domain: "odysee.com" },
  // Social media
  { name: "Twitter/X", domain: "twitter.com" },
  { name: "Instagram", domain: "instagram.com" },
  { name: "Facebook", domain: "facebook.com" },
  { name: "Reddit", domain: "reddit.com" },
  { name: "Threads", domain: "threads.net" },
  { name: "Bluesky", domain: "bsky.app" },
  { name: "Pinterest", domain: "pinterest.com" },
  { name: "Tumblr", domain: "tumblr.com" },
  // Live streaming
  { name: "Twitch", domain: "twitch.tv" },
  { name: "Kick", domain: "kick.com" },
  // Audio/Music
  { name: "SoundCloud", domain: "soundcloud.com" },
  { name: "Bandcamp", domain: "bandcamp.com" },
  { name: "Mixcloud", domain: "mixcloud.com" },
  // News & Media
  { name: "BBC", domain: "bbc.co.uk" },
  { name: "CNN", domain: "cnn.com" },
  { name: "NBC", domain: "nbc.com" },
  // Educational & Talks
  { name: "TED", domain: "ted.com" },
  // Other popular
  { name: "9GAG", domain: "9gag.com" },
  { name: "Nicovideo", domain: "nicovideo.jp" },
  { name: "Newgrounds", domain: "newgrounds.com" },
  { name: "Nebula", domain: "nebula.tv" },
  { name: "Floatplane", domain: "floatplane.com" },
  { name: "Patreon", domain: "patreon.com" },
  { name: "Archive.org", domain: "archive.org" },
  { name: "Streamable", domain: "streamable.com" },
];

interface UrlInputProps {
  url: string;
  isLoading: boolean;
  error: string | null;
  hasVideo: boolean;
  onUrlChange: (url: string) => void;
  onFetch: () => void;
}

export function UrlInput({ url, isLoading, error, hasVideo, onUrlChange, onFetch }: UrlInputProps) {
  const [placeholder, setPlaceholder] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const currentSiteIndex = useRef(0);
  const currentCharIndex = useRef(0);
  const isTypingRef = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const typeNextChar = () => {
      const currentSite = SUPPORTED_SITES[currentSiteIndex.current];
      const fullText = `https://${currentSite}`;

      if (isTypingRef.current) {
        if (currentCharIndex.current < fullText.length) {
          setPlaceholder(fullText.slice(0, currentCharIndex.current + 1));
          currentCharIndex.current++;
          timeoutRef.current = setTimeout(typeNextChar, 50 + Math.random() * 30);
        } else {
          // Pause at the end
          timeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
            typeNextChar();
          }, 2000);
        }
      } else {
        if (currentCharIndex.current > 0) {
          currentCharIndex.current--;
          setPlaceholder(fullText.slice(0, currentCharIndex.current));
          timeoutRef.current = setTimeout(typeNextChar, 25);
        } else {
          // Move to next site
          currentSiteIndex.current = (currentSiteIndex.current + 1) % SUPPORTED_SITES.length;
          isTypingRef.current = true;
          timeoutRef.current = setTimeout(typeNextChar, 300);
        }
      }
    };

    timeoutRef.current = setTimeout(typeNextChar, 500);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn("w-full transition-all duration-500 ease-out", hasVideo ? "pt-0" : "pt-[20vh]")}
    >
      {/* Centered content wrapper */}
      <div className="flex flex-col items-center gap-4">
        {/* URL Input Box */}
        <div
          className={cn(
            "w-full max-w-2xl rounded-2xl border border-border/40 bg-card/50 p-4 backdrop-blur-sm transition-all duration-300",
            "hover:border-border/60 hover:bg-card/70",
            "focus-within:border-primary/50 focus-within:bg-card/80"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50">
              <Link className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder || "https://"}
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isLoading) {
                  onFetch();
                }
              }}
              className={cn(
                "h-10 flex-1 bg-transparent text-base outline-none",
                "placeholder:text-muted-foreground/50"
              )}
            />
            <Button
              onClick={onFetch}
              disabled={isLoading || !url.trim()}
              size="sm"
              className="h-10 px-5 font-medium"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch"}
            </Button>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Supported platforms - only show when no video */}
        {!hasVideo && (
          <div className="mt-6 max-w-md duration-500 animate-in fade-in">
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Supports 1000+ sites including
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR_PLATFORMS.map((platform) => (
                <span
                  key={platform.domain}
                  className="rounded-full bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {platform.name}
                </span>
              ))}
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                +1000's more
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
