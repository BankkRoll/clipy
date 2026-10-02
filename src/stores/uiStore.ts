/**
 * UI store: layout and onboarding state persisted in localStorage.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Shape of the UI store. */
export interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** True until the setup wizard has been completed. */
  isFirstRun: boolean;
  /** Mark the setup wizard as done so the main app renders. */
  completeOnboarding: () => void;
}

/** Zustand hook for the UI store. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      isFirstRun: true,
      completeOnboarding: () => set({ isFirstRun: false }),
    }),
    {
      name: "clipy-ui-storage",
      partialize: (state) => ({
        isFirstRun: state.isFirstRun,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
