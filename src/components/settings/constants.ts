/** Settings page tabs, in sidebar order. */
export const SETTINGS_TABS = [
  { value: "general", label: "General" },
  { value: "downloads", label: "Downloads" },
  { value: "quality", label: "Quality" },
  { value: "subtitles", label: "Subtitles" },
  { value: "sponsorblock", label: "SponsorBlock" },
  { value: "network", label: "Network" },
  { value: "advanced", label: "Advanced" },
  { value: "about", label: "About" },
] as const;

/** Value of one of {@link SETTINGS_TABS}. */
export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

/** Project repository opened by "View on GitHub". */
export const REPOSITORY_URL = "https://github.com/BankkRoll/clipy";

/** A credited project and where to read about it. */
export interface Acknowledgement {
  name: string;
  role: string;
  url: string;
}

/**
 * Credits shown on the About tab. Each entry is something Clipy actually ships
 * or calls at runtime (checked against package.json / Cargo.toml by a test).
 */
export const ACKNOWLEDGEMENTS: readonly Acknowledgement[] = [
  { name: "yt-dlp", role: "Video downloading", url: "https://github.com/yt-dlp/yt-dlp" },
  { name: "FFmpeg", role: "Video/audio processing", url: "https://ffmpeg.org" },
  { name: "SponsorBlock", role: "Community sponsor data", url: "https://sponsor.ajay.app" },
  { name: "Tauri", role: "Desktop app framework", url: "https://tauri.app" },
  { name: "React", role: "UI library", url: "https://react.dev" },
  { name: "React Router", role: "Routing", url: "https://reactrouter.com" },
  { name: "Vite", role: "Build tooling", url: "https://vitejs.dev" },
  { name: "Tailwind CSS", role: "Styling", url: "https://tailwindcss.com" },
  { name: "shadcn/ui", role: "UI components", url: "https://ui.shadcn.com" },
  { name: "Radix UI", role: "Accessible primitives", url: "https://www.radix-ui.com" },
  { name: "cmdk", role: "Command menu", url: "https://cmdk.paco.me" },
  { name: "Zustand", role: "State management", url: "https://github.com/pmndrs/zustand" },
  { name: "Lucide", role: "Icons", url: "https://lucide.dev" },
  { name: "Sonner", role: "Toasts", url: "https://sonner.emilkowal.ski" },
];
