import DownloaderPage from "@/pages/DownloaderPage";
import EditorPage from "@/pages/EditorPage";
import LibraryPage from "@/pages/LibraryPage";
import SettingsPage from "@/pages/SettingsPage";
import { createRoute } from "@tanstack/react-router";
import HomePage from "../pages/HomePage";
import { RootRoute } from "./__root";

export const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: HomePage,
});

export interface DownloaderSearchParams {
  url?: string;
}

export const DownloaderRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/downloader",
  component: DownloaderPage,
  validateSearch: (search: Record<string, unknown>): DownloaderSearchParams => {
    return {
      url: search.url ? String(search.url) : undefined
    };
  },
});

export interface EditorSearchParams {
  url?: string;
}

export const EditorRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/editor",
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>): EditorSearchParams => {
    return {
      url: search.url ? String(search.url) : undefined
    };
  },
});

export const LibraryRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/library",
  component: LibraryPage,
});

export const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/settings",
  component: SettingsPage,
});

export const rootTree = RootRoute.addChildren([
  HomeRoute,
  DownloaderRoute,
  EditorRoute,
  LibraryRoute,
  SettingsRoute,
]);
