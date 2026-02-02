/**
 * Route Definitions
 * TanStack Router route configuration for all app pages.
 */

import EditorPage from '@/pages/EditorPage'
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

export interface EditorSearchParams {
  path?: string
  downloadId?: string
  url?: string // YouTube URL for live streaming preview
}

export const EditorRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: '/editor',
  component: EditorPage,
  validateSearch: (search: Record<string, unknown>): EditorSearchParams => {
    return {
      path: search.path ? String(search.path) : undefined,
      downloadId: search.downloadId ? String(search.downloadId) : undefined,
      url: search.url ? String(search.url) : undefined,
    }
  },
})

export const rootTree = RootRoute.addChildren([HomeRoute, LibraryRoute, SettingsRoute, EditorRoute])
