import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import React from 'react'
import { isSuccessResponse } from '@/types/api'
import { useTranslation } from 'react-i18next'

// Theme toggle function
const toggleTheme = async () => {
  try {
    const response = await window.electronAPI.theme.toggle()

    if (isSuccessResponse(response)) {
      const newTheme = response.data

      // Update DOM classes based on the new theme
      if (newTheme === 'dark') {
        document.documentElement.classList.add('dark')
      } else if (newTheme === 'light') {
        document.documentElement.classList.remove('dark')
      }
      // 'system' theme is handled by CSS media queries

      console.log('Theme toggled to:', newTheme)
    } else {
      console.error('Failed to toggle theme:', response.error)
    }
  } catch (error) {
    console.error('Failed to toggle theme:', error)
  }
}

export default function ToggleTheme() {
  const [mounted, setMounted] = React.useState(false)
  const { t } = useTranslation()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" className="h-8 w-8">
        <div className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <Button
      onClick={toggleTheme}
      variant="outline"
      size="icon"
      className="hover:bg-accent h-8 w-8 transition-colors"
      aria-label={t('toggleTheme')}
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  )
}
