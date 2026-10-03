/**
 * Locally persisted settings caches.
 *
 * The backend (`get_settings`) is the source of truth. {@link useThemeStore}
 * only caches the theme in localStorage so the first paint uses the right
 * colors before backend settings load; `applyBackendSettings` keeps it in sync.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { type Theme } from "@/types/settings";

/** Shape of the theme cache. */
export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

/**
 * First-paint cache of `appearance.theme`. Write theme changes through
 * `useTheme().setTheme` so the backend is updated too.
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "clipy-theme",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
