/**
 * Theme Store - Shared state for theme management
 * Keeps header toggle and settings page in sync
 */

import type { ThemeMode } from '@/types/system'
import { create } from 'zustand'
import { isSuccessResponse } from '@/types/api'

interface ThemeState {
  theme: ThemeMode
  isLoading: boolean
  setTheme: (theme: ThemeMode) => Promise<void>
  toggleTheme: () => Promise<void>
  loadTheme: () => Promise<void>
}

/**
 * Apply theme to DOM by toggling dark class
 */
const applyTheme = (theme: ThemeMode) => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else if (theme === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    // System theme - check preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'system',
  isLoading: true,

  loadTheme: async () => {
    try {
      const response = await window.electronAPI.theme.get()
      if (isSuccessResponse(response)) {
        set({ theme: response.data, isLoading: false })
        applyTheme(response.data)
      } else {
        set({ theme: 'system', isLoading: false })
        applyTheme('system')
      }
    } catch (error) {
      console.error('Failed to get theme:', error)
      set({ theme: 'system', isLoading: false })
      applyTheme('system')
    }
  },

  setTheme: async (theme: ThemeMode) => {
    // Update state immediately for responsiveness
    set({ theme })
    applyTheme(theme)

    // Persist to config via IPC
    try {
      await window.electronAPI.theme.set(theme)
    } catch (error) {
      console.error('Failed to save theme:', error)
    }
  },

  toggleTheme: async () => {
    try {
      const response = await window.electronAPI.theme.toggle()

      if (isSuccessResponse(response)) {
        const newTheme = response.data as ThemeMode
        set({ theme: newTheme })
        applyTheme(newTheme)
      }
    } catch (error) {
      console.error('Failed to toggle theme:', error)
    }
  },
}))
