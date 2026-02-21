import { create } from "zustand";
import { persist } from "zustand/middleware";

type ModalType =
  | "export"
  | "settings"
  | "about"
  | "shortcuts"
  | "confirm-delete"
  | "video-details"
  | "quality-selector"
  | null;

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Modals
  activeModal: ModalType;
  modalData: Record<string, unknown>;
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  // Panels
  rightPanelOpen: boolean;
  rightPanelTab: "properties" | "effects" | "text";
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: "properties" | "effects" | "text") => void;

  // Loading states
  globalLoading: boolean;
  loadingMessage: string;
  setGlobalLoading: (loading: boolean, message?: string) => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Onboarding
  isFirstRun: boolean;
  onboardingStep: number;
  setFirstRun: (isFirstRun: boolean) => void;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => void;

  // Debug
  debugPanelOpen: boolean;
  toggleDebugPanel: () => void;
}

interface Notification {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  duration?: number;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      // Modals
      activeModal: null,
      modalData: {},
      openModal: (modal, data = {}) => set({ activeModal: modal, modalData: data }),
      closeModal: () => set({ activeModal: null, modalData: {} }),

      // Panels
      rightPanelOpen: false,
      rightPanelTab: "properties",
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setRightPanelTab: (tab) => set({ rightPanelTab: tab, rightPanelOpen: true }),

      // Loading states
      globalLoading: false,
      loadingMessage: "",
      setGlobalLoading: (loading, message = "") => set({ globalLoading: loading, loadingMessage: message }),

      // Notifications
      notifications: [],
      addNotification: (notification) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          notifications: [...state.notifications, { ...notification, id }],
        }));

        // Auto-remove after duration
        if (notification.duration !== 0) {
          setTimeout(() => {
            set((state) => ({
              notifications: state.notifications.filter((n) => n.id !== id),
            }));
          }, notification.duration ?? 5000);
        }
      },
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      clearNotifications: () => set({ notifications: [] }),

      // Onboarding
      isFirstRun: true,
      onboardingStep: 0,
      setFirstRun: (isFirstRun) => set({ isFirstRun }),
      setOnboardingStep: (step) => set({ onboardingStep: step }),
      completeOnboarding: () => set({ isFirstRun: false, onboardingStep: 0 }),

      // Debug
      debugPanelOpen: false,
      toggleDebugPanel: () => set((state) => ({ debugPanelOpen: !state.debugPanelOpen })),
    }),
    {
      name: "clipy-ui-storage",
      // Only persist onboarding-related state
      partialize: (state) => ({
        isFirstRun: state.isFirstRun,
        onboardingStep: state.onboardingStep,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
