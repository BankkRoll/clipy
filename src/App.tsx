/**
 * Application root.
 *
 * Responsibilities:
 * - gate first run behind the setup wizard
 * - own the app-wide backend subscriptions (download progress, settings side effects)
 * - apply the theme class to the document
 * - define routes
 */
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { Downloads } from "@/pages/Downloads";
import { Editor } from "@/pages/Editor";
import { Home } from "@/pages/Home";
import { Layout } from "@/components/layout";
import { Library } from "@/pages/Library";
import { Settings } from "@/pages/Settings";
import { SetupWizard } from "@/components/onboarding";
import { Toaster } from "sonner";
import { getVersion } from "@tauri-apps/api/app";
import { logger } from "@/lib/logger";
import { useDownloadSync, useSettings } from "@/hooks";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";

const TOAST_OPTIONS = { className: "bg-background text-foreground border-border" };

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return dark;
}

/** Root component: setup wizard on first run, otherwise the routed app. */
export function App() {
  const theme = useThemeStore((state) => state.theme);
  const isFirstRun = useUIStore((state) => state.isFirstRun);
  const bannerShownRef = useRef(false);
  const prefersDark = usePrefersDark();

  // Loading settings here (once, app-wide) pushes theme and debug mode to
  // their consumers before any page asks for them.
  useSettings();
  useDownloadSync();

  useEffect(() => {
    if (bannerShownRef.current) return;
    bannerShownRef.current = true;

    getVersion()
      .then((version) => logger.banner(version))
      .catch(() => logger.banner("dev"));
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    const actual = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.classList.add(actual);
  }, [theme, prefersDark]);

  if (isFirstRun) {
    return (
      <>
        <SetupWizard />
        <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
      </>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/editor/:projectId" element={<Editor />} />
          <Route path="/library" element={<Library />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="bottom-right" toastOptions={TOAST_OPTIONS} />
    </BrowserRouter>
  );
}
