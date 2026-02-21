import { BrowserRouter, Route, Routes } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import type { DownloadProgress } from "@/types/download";
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
import { useDownloadStore } from "@/stores/downloadStore";
import { useTauriEvent } from "@/hooks";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";

export function App() {
  const theme = useThemeStore((state) => state.theme);
  const isFirstRun = useUIStore((state) => state.isFirstRun);
  const updateDownload = useDownloadStore((state) => state.updateDownload);
  const setStatus = useDownloadStore((state) => state.setStatus);
  const bannerShownRef = useRef(false);

  // Show startup banner in console (once on app mount)
  useEffect(() => {
    if (bannerShownRef.current) return;
    bannerShownRef.current = true;

    getVersion()
      .then((version) => {
        logger.banner(version);
      })
      .catch(() => {
        logger.banner("dev");
      });
  }, []);

  // Global listener for download progress events from Tauri backend
  const handleDownloadProgress = useCallback(
    (progress: DownloadProgress) => {
      // Update the download in the store
      if (
        progress.status === "completed" ||
        progress.status === "failed" ||
        progress.status === "cancelled"
      ) {
        setStatus(progress.downloadId, progress.status, undefined);
      } else {
        updateDownload(progress.downloadId, {
          status: progress.status,
          progress: progress.progress,
          downloadedBytes: progress.downloadedBytes,
          totalBytes: progress.totalBytes,
          speed: progress.speed,
          eta: progress.eta,
        });
      }
    },
    [updateDownload, setStatus]
  );

  useTauriEvent<DownloadProgress>("download-progress", handleDownloadProgress);

  // Track system theme for reactive updates
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    const actualTheme = theme === "system" ? systemTheme : theme;
    root.classList.add(actualTheme);
  }, [theme, systemTheme]);

  // Show setup wizard on first run
  if (isFirstRun) {
    return (
      <>
        <SetupWizard onComplete={() => {}} />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "bg-background text-foreground border-border",
          }}
        />
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
        </Routes>
      </Layout>
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "bg-background text-foreground border-border",
        }}
      />
    </BrowserRouter>
  );
}
