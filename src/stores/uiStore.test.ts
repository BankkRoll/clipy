import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

const INITIAL = {
  sidebarCollapsed: false,
  activeModal: null,
  modalData: {},
  rightPanelOpen: false,
  rightPanelTab: "properties" as const,
  globalLoading: false,
  loadingMessage: "",
  notifications: [],
  isFirstRun: true,
  onboardingStep: 0,
  debugPanelOpen: false,
};

beforeEach(() => {
  useUIStore.setState({ ...INITIAL });
});

describe("sidebar", () => {
  it("toggleSidebar flips the value", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("setSidebarCollapsed sets explicit value", () => {
    useUIStore.getState().setSidebarCollapsed(true);
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
  });
});

describe("modals", () => {
  it("openModal sets active modal and data", () => {
    useUIStore.getState().openModal("settings", { tab: "general" });
    const s = useUIStore.getState();
    expect(s.activeModal).toBe("settings");
    expect(s.modalData).toEqual({ tab: "general" });
  });

  it("openModal defaults data to empty object", () => {
    useUIStore.getState().openModal("about");
    expect(useUIStore.getState().modalData).toEqual({});
  });

  it("closeModal clears modal and data", () => {
    useUIStore.getState().openModal("export", { x: 1 });
    useUIStore.getState().closeModal();
    const s = useUIStore.getState();
    expect(s.activeModal).toBeNull();
    expect(s.modalData).toEqual({});
  });
});

describe("right panel", () => {
  it("toggleRightPanel flips open state", () => {
    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().rightPanelOpen).toBe(true);
    useUIStore.getState().toggleRightPanel();
    expect(useUIStore.getState().rightPanelOpen).toBe(false);
  });

  it("setRightPanelTab sets tab and forces panel open", () => {
    useUIStore.getState().setRightPanelTab("effects");
    const s = useUIStore.getState();
    expect(s.rightPanelTab).toBe("effects");
    expect(s.rightPanelOpen).toBe(true);
  });
});

describe("global loading", () => {
  it("sets loading with message", () => {
    useUIStore.getState().setGlobalLoading(true, "Working...");
    const s = useUIStore.getState();
    expect(s.globalLoading).toBe(true);
    expect(s.loadingMessage).toBe("Working...");
  });

  it("defaults message to empty string", () => {
    useUIStore.getState().setGlobalLoading(true);
    expect(useUIStore.getState().loadingMessage).toBe("");
  });
});

describe("notifications", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("addNotification appends with a generated id", () => {
    useUIStore.getState().addNotification({
      type: "info",
      title: "Hello",
      message: "World",
      duration: 0,
    });
    const notes = useUIStore.getState().notifications;
    expect(notes).toHaveLength(1);
    expect(notes[0]!.id).toBeTruthy();
    expect(notes[0]!.title).toBe("Hello");
  });

  it("does not auto-remove when duration is 0", () => {
    useUIStore.getState().addNotification({
      type: "info",
      title: "Sticky",
      message: "",
      duration: 0,
    });
    vi.advanceTimersByTime(10000);
    expect(useUIStore.getState().notifications).toHaveLength(1);
  });

  it("auto-removes after the default 5000ms when no duration given", () => {
    useUIStore.getState().addNotification({ type: "success", title: "Auto", message: "" });
    expect(useUIStore.getState().notifications).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("auto-removes after a custom duration", () => {
    useUIStore.getState().addNotification({
      type: "warning",
      title: "T",
      message: "",
      duration: 1000,
    });
    vi.advanceTimersByTime(999);
    expect(useUIStore.getState().notifications).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("removeNotification removes by id", () => {
    useUIStore.getState().addNotification({ type: "info", title: "A", message: "", duration: 0 });
    const id = useUIStore.getState().notifications[0]!.id;
    useUIStore.getState().removeNotification(id);
    expect(useUIStore.getState().notifications).toHaveLength(0);
  });

  it("clearNotifications empties the list", () => {
    useUIStore.getState().addNotification({ type: "info", title: "A", message: "", duration: 0 });
    useUIStore.getState().addNotification({ type: "info", title: "B", message: "", duration: 0 });
    useUIStore.getState().clearNotifications();
    expect(useUIStore.getState().notifications).toHaveLength(0);
  });
});

describe("onboarding", () => {
  it("setFirstRun updates flag", () => {
    useUIStore.getState().setFirstRun(false);
    expect(useUIStore.getState().isFirstRun).toBe(false);
  });

  it("setOnboardingStep updates the step", () => {
    useUIStore.getState().setOnboardingStep(3);
    expect(useUIStore.getState().onboardingStep).toBe(3);
  });

  it("completeOnboarding clears first run and resets step", () => {
    useUIStore.setState({ isFirstRun: true, onboardingStep: 4 });
    useUIStore.getState().completeOnboarding();
    const s = useUIStore.getState();
    expect(s.isFirstRun).toBe(false);
    expect(s.onboardingStep).toBe(0);
  });
});

describe("debug panel", () => {
  it("toggleDebugPanel flips the value", () => {
    useUIStore.getState().toggleDebugPanel();
    expect(useUIStore.getState().debugPanelOpen).toBe(true);
    useUIStore.getState().toggleDebugPanel();
    expect(useUIStore.getState().debugPanelOpen).toBe(false);
  });
});
