import { Loader2 } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { SettingGroup } from "../components/setting-group";
import { APP_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { ACKNOWLEDGEMENTS, REPOSITORY_URL } from "../constants";

/** Props for {@link AboutTab}. */
export interface AboutTabProps {
  isDark: boolean;
  /** Running app version, e.g. from `useAppVersion`. */
  version: string;
  checkingUpdates: boolean;
  onCheckForUpdates: () => void;
}

// NOTE: <a target="_blank"> does nothing inside the Tauri webview; external
// links must go through the shell plugin to reach the system browser.
function openLink(url: string) {
  openExternal(url).catch((err: unknown) => logger.error("About", "Failed to open link:", err));
}

/** Settings tab: app identity, version, update check and credits. */
export function AboutTab({ isDark, version, checkingUpdates, onCheckForUpdates }: AboutTabProps) {
  return (
    <div className="space-y-6">
      <SettingGroup title="About Clipy">
        <div className="flex items-start gap-4">
          <img
            src={isDark ? "/logo-dark.png" : "/logo-light.png"}
            alt={APP_NAME}
            className="h-16 w-16 rounded-xl object-contain"
          />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{APP_NAME}</h2>
            <p className="text-sm text-muted-foreground">Version {version}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Open-source YouTube video downloader and editor. Built with Tauri, React, and FFmpeg.
            </p>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => openLink(REPOSITORY_URL)}>
            View on GitHub
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onCheckForUpdates}
            disabled={checkingUpdates}
          >
            {checkingUpdates && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Check for Updates
          </Button>
        </div>
      </SettingGroup>

      <SettingGroup title="Acknowledgements" description="Open source libraries and services">
        <div className="grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          {ACKNOWLEDGEMENTS.map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => openLink(a.url)}
              className="text-left hover:text-foreground"
            >
              <span className="font-medium text-foreground/80">{a.name}</span> — {a.role}
            </button>
          ))}
        </div>
      </SettingGroup>
    </div>
  );
}
