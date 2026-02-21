import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "../components/setting-group";
import { APP_NAME, APP_VERSION } from "@/lib/constants";

interface AboutTabProps {
  isDark: boolean;
  checkingUpdates: boolean;
  onCheckForUpdates: () => void;
}

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
        <div className="text-sm text-muted-foreground space-y-1">
          <p>FFmpeg - Video/audio processing</p>
          <p>yt-dlp - Video downloading</p>
          <p>SponsorBlock - Community sponsor data</p>
          <p>Tauri - Desktop application framework</p>
        </div>
      </SettingGroup>
    </div>
  );
}
