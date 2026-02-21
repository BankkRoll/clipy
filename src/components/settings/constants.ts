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

export type SettingsTab = typeof SETTINGS_TABS[number]["value"];
