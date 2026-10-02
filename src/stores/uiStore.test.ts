import { describe, it, expect } from "vitest";
import { useUIStore } from "@/stores/uiStore";

describe("uiStore", () => {
  it("toggleSidebar flips the value", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarCollapsed sets an explicit value", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });

  it("starts on first run and completeOnboarding clears it", () => {
    expect(useUIStore.getState().isFirstRun).toBe(true);
    useUIStore.getState().completeOnboarding();
    expect(useUIStore.getState().isFirstRun).toBe(false);
  });

  it("persists only the onboarding flag and sidebar state", () => {
    useUIStore.getState().completeOnboarding();
    useUIStore.getState().setSidebarCollapsed(true);
    const saved = JSON.parse(localStorage.getItem("clipy-ui-storage") ?? "{}");
    expect(saved.state).toEqual({ isFirstRun: false, sidebarCollapsed: true });
  });
});
