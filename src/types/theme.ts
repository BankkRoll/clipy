export interface ThemeModeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<ThemeMode>;
}

export type ThemeMode = "dark" | "light" | "system"; 