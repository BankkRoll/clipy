import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "@/stores/settingsStore";

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ theme: "system" });
});

describe("useThemeStore", () => {
  it("defaults to system theme", () => {
    expect(useThemeStore.getState().theme).toBe("system");
  });

  it("setTheme updates the theme", () => {
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().theme).toBe("dark");
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("persists the theme for first paint", () => {
    useThemeStore.getState().setTheme("dark");
    expect(JSON.parse(localStorage.getItem("clipy-theme") ?? "{}").state.theme).toBe("dark");
  });
});
