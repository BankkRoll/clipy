import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import type { AppSettings } from "@/hooks/useSettings";

// Consistent width for all select triggers
const SELECT_WIDTH = "w-[180px]";

const BROWSERS = [
  { value: "none", label: "None", description: "Don't use browser cookies" },
  { value: "chrome", label: "Chrome", description: "Google Chrome" },
  { value: "firefox", label: "Firefox", description: "Mozilla Firefox" },
  { value: "edge", label: "Edge", description: "Microsoft Edge" },
  { value: "opera", label: "Opera", description: "Opera Browser" },
  { value: "brave", label: "Brave", description: "Brave Browser" },
  { value: "safari", label: "Safari", description: "Apple Safari (macOS)" },
] as const;

const FRAGMENT_OPTIONS = [
  { value: "1", label: "1 fragment", description: "Most stable" },
  { value: "2", label: "2 fragments", description: "Slightly faster" },
  { value: "4", label: "4 fragments", description: "Balanced" },
  { value: "8", label: "8 fragments", description: "Fast" },
  { value: "16", label: "16 fragments", description: "Fastest, uses most bandwidth" },
] as const;

interface NetworkTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
}

export function NetworkTab({ settings, onUpdateSetting }: NetworkTabProps) {
  const currentBrowser = BROWSERS.find(b => b.value === (settings.download.cookiesFromBrowser || "none"));
  const currentFragments = FRAGMENT_OPTIONS.find(f => f.value === String(settings.download.concurrentFragments || 1));

  return (
    <div className="space-y-6">
      <SettingGroup title="Download Speed" description="Control bandwidth usage">
        <SettingItem
          label="Rate limit"
          description="Maximum download speed (leave empty for unlimited)"
          vertical
        >
          <Input
            value={settings.download.rateLimit || ""}
            onChange={(e) => onUpdateSetting("download.rateLimit", e.target.value)}
            placeholder="e.g., 1M (1 MB/s), 500K (500 KB/s)"
            className="font-mono text-sm"
          />
        </SettingItem>

        <SettingItem
          label="Concurrent fragments"
          description="Parallel fragment downloads for HLS/DASH streams"
        >
          <Select
            value={String(settings.download.concurrentFragments || 1)}
            onValueChange={(v) => onUpdateSetting("download.concurrentFragments", parseInt(v))}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue>
                {currentFragments && (
                  <span className="flex flex-col items-start">
                    <span className="truncate">{currentFragments.label}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {currentFragments.description}
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FRAGMENT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Authentication" description="Access restricted content">
        <SettingItem
          label="Use browser cookies"
          description="Import cookies from your browser for restricted videos"
        >
          <Select
            value={settings.download.cookiesFromBrowser || "none"}
            onValueChange={(v) => onUpdateSetting("download.cookiesFromBrowser", v === "none" ? "" : v)}
          >
            <SelectTrigger className={SELECT_WIDTH}>
              <SelectValue>
                {currentBrowser && (
                  <span className="flex flex-col items-start">
                    <span className="truncate">{currentBrowser.label}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {currentBrowser.description}
                    </span>
                  </span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BROWSERS.map((browser) => (
                <SelectItem key={browser.value} value={browser.value}>
                  <span className="flex flex-col py-0.5">
                    <span className="font-medium">{browser.label}</span>
                    <span className="text-xs text-muted-foreground">{browser.description}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingItem>
      </SettingGroup>

      <SettingGroup title="Proxy Settings" description="Route traffic through a proxy server">
        <SettingItem
          label="Proxy URL"
          description="HTTP or SOCKS proxy address"
          vertical
        >
          <Input
            value={settings.advanced.proxyUrl || ""}
            onChange={(e) => onUpdateSetting("advanced.proxyUrl", e.target.value)}
            placeholder="e.g., socks5://127.0.0.1:1080"
            className="font-mono text-sm"
          />
        </SettingItem>
        <SettingItem
          label="Geo-bypass"
          description="Attempt to bypass geographic restrictions"
        >
          <Switch
            checked={settings.download.geoBypass || false}
            onCheckedChange={(v) => onUpdateSetting("download.geoBypass", v)}
          />
        </SettingItem>
      </SettingGroup>
    </div>
  );
}
