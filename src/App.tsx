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
import { isSuccessResponse } from './types/api'
import { router } from './routes/router'
import { useTranslation } from 'react-i18next'

export default function App() {
  const { i18n } = useTranslation()

  // Initialize theme and language on mount
  useEffect(() => {
    // Fetch theme preference from main process config
    const loadTheme = async () => {
      try {
        const response = await window.electronAPI.theme.get()
        if (isSuccessResponse(response)) {
          applyTheme(response.data)
        } else {
          console.error('Failed to get theme:', response.error)
          // Default to system
          applyTheme('system')
        }
      } catch (error) {
        console.error('Failed to get theme:', error)
        // Default to system
        applyTheme('system')
      }
    }

    // Apply theme by toggling 'dark' class on <html>
    // System theme relies on CSS prefers-color-scheme media query
    const applyTheme = (theme: string) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark')
      }
    }

    loadTheme()

    // Restore saved language (backward compat with old 'lang' key)
    const savedLang = localStorage.getItem('i18nextLng') || localStorage.getItem('lang')
    if (savedLang) {
      i18n.changeLanguage(savedLang)
      document.documentElement.lang = savedLang
    }
  }, [i18n])

  return <RouterProvider router={router} />
}

// Mount the app to the DOM
const root = createRoot(document.getElementById('app')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
