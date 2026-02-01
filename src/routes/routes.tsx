import DownloaderPage from '@/pages/DownloaderPage'
import HomePage from '../pages/HomePage'
import LibraryPage from '@/pages/LibraryPage'
import { RootRoute } from './__root'
import SettingsPage from '@/pages/SettingsPage'
import { createRoute } from '@tanstack/react-router'

export const HomeRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomePage,
})

export interface DownloaderSearchParams {
  url?: string
}

export const DownloaderRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/downloader',
  component: DownloaderPage,
  validateSearch: (search: Record<string, unknown>): DownloaderSearchParams => {
    return {
      url: search.url ? String(search.url) : undefined,
    }
  },
})

export const LibraryRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/library',
  component: LibraryPage,
})

export const SettingsRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/settings',
  component: SettingsPage,
})

export const rootTree = RootRoute.addChildren([HomeRoute, DownloaderRoute, LibraryRoute, SettingsRoute])
