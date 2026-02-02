/**
 * AppearanceSettings - Theme and visual preferences
 * Uses shared theme store to stay in sync with header toggle.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Monitor, Moon, Sun } from 'lucide-react'

import type { ThemeMode } from '@/types/system'
import { useThemeStore } from '@/stores/theme-store'
import { useTranslation } from 'react-i18next'

export default function AppearanceSettings() {
  const { t } = useTranslation()
  const { theme, isLoading, setTheme } = useThemeStore()

  const themes: { value: ThemeMode; label: string; icon: typeof Sun; description: string }[] = [
    { value: 'light', label: t('themeLight'), icon: Sun, description: t('themeLightDesc') },
    { value: 'dark', label: t('themeDark'), icon: Moon, description: t('themeDarkDesc') },
    { value: 'system', label: t('themeSystem'), icon: Monitor, description: t('themeSystemDesc') },
  ]

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('settingsAppearanceTitle')}</CardTitle>
        <CardDescription>{t('settingsAppearanceDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Selection */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsTheme')}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {themes.map(({ value, label, icon: Icon, description }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                disabled={isLoading}
                className={`relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all ${
                  theme === value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <div
                  className={`rounded-full p-2 ${theme === value ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium">{label}</span>
                <span className="text-muted-foreground text-center text-[10px]">{description}</span>
                {theme === value && <div className="bg-primary absolute -top-1 -right-1 h-3 w-3 rounded-full" />}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
