/**
 * NotificationsSettings - Notification preferences
 */

import type { AppConfig, NotificationsConfig } from '@/types/system'
import { Bell, BellOff, Volume2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCallback, useEffect, useState } from 'react'

import { Switch } from '@/components/ui/switch'
import { isSuccessResponse } from '@/types/api'
import { useTranslation } from 'react-i18next'

const defaultNotificationsConfig: NotificationsConfig = {
  downloadComplete: true,
  downloadFailed: true,
  soundEnabled: false,
}

export default function NotificationsSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<NotificationsConfig>(defaultNotificationsConfig)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          const appConfig = response.data as AppConfig
          setConfig(appConfig.notifications || defaultNotificationsConfig)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleUpdate = useCallback(
    (updates: Partial<NotificationsConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      try {
        window.electronAPI.config.update({ notifications: newConfig } as any)
      } catch (error) {
        console.error('Failed to update config:', error)
      }
    },
    [config],
  )

  const allDisabled = !config.downloadComplete && !config.downloadFailed

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">
          {t('settingsNotificationsTitle')}
        </CardTitle>
        <CardDescription>{t('settingsNotificationsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Desktop Notifications */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsDesktopNotifications')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsNotifyDownloadComplete')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsNotifyDownloadCompleteDesc')}</p>
              </div>
              <Switch
                checked={config.downloadComplete}
                onCheckedChange={checked => handleUpdate({ downloadComplete: checked })}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsNotifyDownloadFailed')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsNotifyDownloadFailedDesc')}</p>
              </div>
              <Switch
                checked={config.downloadFailed}
                onCheckedChange={checked => handleUpdate({ downloadFailed: checked })}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Sound */}
        <div className="space-y-4">
          <h3 className="text-foreground flex items-center gap-2 font-medium">{t('settingsSounds')}</h3>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-foreground text-sm font-medium">{t('settingsSoundEffects')}</p>
              <p className="text-muted-foreground text-xs">{t('settingsSoundEffectsDesc')}</p>
            </div>
            <Switch
              checked={config.soundEnabled}
              onCheckedChange={checked => handleUpdate({ soundEnabled: checked })}
              disabled={isLoading}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
