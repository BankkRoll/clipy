/**
 * ToggleTheme - Dark/light mode toggle button
 * Uses shared theme store to stay in sync with settings page.
 */

import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import React from 'react'
import { useThemeStore } from '@/stores/theme-store'
import { useTranslation } from 'react-i18next'

export default function ToggleTheme() {
  const [mounted, setMounted] = React.useState(false)
  const { t } = useTranslation()
  const toggleTheme = useThemeStore(state => state.toggleTheme)

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
