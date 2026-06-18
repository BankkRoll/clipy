import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "../components/setting-group";
import { APP_NAME, APP_VERSION } from "@/lib/constants";

interface AboutTabProps {
  isDark: boolean;
  checkingUpdates: boolean;
  onCheckForUpdates: () => void;
}

const ACKNOWLEDGEMENTS: { name: string; role: string; url: string }[] = [
  { name: "yt-dlp", role: "Video downloading", url: "https://github.com/yt-dlp/yt-dlp" },
  { name: "FFmpeg", role: "Video/audio processing", url: "https://ffmpeg.org" },
  { name: "SponsorBlock", role: "Community sponsor data", url: "https://sponsor.ajay.app" },
  { name: "Tauri", role: "Desktop app framework", url: "https://tauri.app" },
  { name: "React", role: "UI library", url: "https://react.dev" },
  { name: "Vite", role: "Build tooling", url: "https://vitejs.dev" },
  { name: "Tailwind CSS", role: "Styling", url: "https://tailwindcss.com" },
  { name: "shadcn/ui", role: "UI components", url: "https://ui.shadcn.com" },
  { name: "Radix UI", role: "Accessible primitives", url: "https://www.radix-ui.com" },
  { name: "Zustand", role: "State management", url: "https://github.com/pmndrs/zustand" },
  { name: "Lucide", role: "Icons", url: "https://lucide.dev" },
  { name: "hls.js", role: "Adaptive streaming", url: "https://github.com/video-dev/hls.js" },
  { name: "Sonner", role: "Toasts", url: "https://sonner.emilkowal.ski" },
];

export function AboutTab({
  isDark,
  checkingUpdates,
  onCheckForUpdates,
}: AboutTabProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="About Clipy">
        <div className="flex items-start gap-4">
          <img
            src={isDark ? "/logo-dark.png" : "/logo-light.png"}
            alt={APP_NAME}
            className="h-16 w-16 object-contain rounded-xl"
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{APP_NAME}</h2>
            <p className="text-sm text-muted-foreground">Version {APP_VERSION}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Open-source YouTube video downloader and editor.
              Built with Tauri, React, and FFmpeg.
            </p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <a href="https://github.com/BankkRoll/clipy" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCheckForUpdates}
            disabled={checkingUpdates}
          >
            {checkingUpdates && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Check for Updates
          </Button>
        </div>
      </SettingGroup>

      <SettingGroup title="Acknowledgements" description="Open source libraries and services">
        <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          {ACKNOWLEDGEMENTS.map((a) => (
            <a
              key={a.name}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              <span className="font-medium text-foreground/80">{a.name}</span> — {a.role}
            </a>
          ))}
        </div>
      </SettingGroup>
    </div>
  );
}
