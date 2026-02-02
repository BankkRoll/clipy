/**
 * Clipy - Renderer Process Entry Point
 *
 * Root React component that initializes:
 * - Theme (dark/light/system) from main process config
 * - i18n language from localStorage
 * - TanStack Router for navigation
 */

import './localization/i18n'

import React, { useEffect } from 'react'

import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { router } from './routes/router'
import { useThemeStore } from './stores/theme-store'
import { useTranslation } from 'react-i18next'

export default function App() {
  const { i18n } = useTranslation()
  const loadTheme = useThemeStore(state => state.loadTheme)

  // Initialize theme and language on mount
  useEffect(() => {
    // Load theme from store (handles IPC and DOM updates)
    loadTheme()

    // Restore saved language (backward compat with old 'lang' key)
    const savedLang = localStorage.getItem('i18nextLng') || localStorage.getItem('lang')
    if (savedLang) {
      i18n.changeLanguage(savedLang)
      document.documentElement.lang = savedLang
    }
  }, [i18n, loadTheme])

  return <RouterProvider router={router} />
}

// Mount the app to the DOM
const root = createRoot(document.getElementById('app')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
