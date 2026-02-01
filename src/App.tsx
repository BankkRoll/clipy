import './localization/i18n'

import React, { useEffect } from 'react'

import { RouterProvider } from '@tanstack/react-router'
import { createRoot } from 'react-dom/client'
import { isSuccessResponse } from './types/api'
import { router } from './routes/router'
import { useTranslation } from 'react-i18next'

export default function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    // Get current theme from main process
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

    const applyTheme = (theme: string) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark')
      }
      // 'system' theme is handled by CSS media queries
    }

    loadTheme()

    // Update language from localStorage (maintained for backward compatibility)
    const savedLang = localStorage.getItem('i18nextLng') || localStorage.getItem('lang')
    if (savedLang) {
      i18n.changeLanguage(savedLang)
      document.documentElement.lang = savedLang
    }
  }, [i18n])

  return <RouterProvider router={router} />
}

const root = createRoot(document.getElementById('app')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
