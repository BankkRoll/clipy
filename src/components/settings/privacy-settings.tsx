/**
 * PrivacySettings - Privacy and history preferences
 */

import type { AppConfig, PrivacyConfig } from '@/types/system'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { History, Shield, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

const defaultPrivacyConfig: PrivacyConfig = {
  saveDownloadHistory: true,
  saveRecentlyViewed: true,
}

export default function PrivacySettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<PrivacyConfig>(defaultPrivacyConfig)
  const [isLoading, setIsLoading] = useState(true)
  const [isClearing, setIsClearing] = useState<string | null>(null)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          const appConfig = response.data as AppConfig
          setConfig(appConfig.privacy || defaultPrivacyConfig)
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
    (updates: Partial<PrivacyConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      try {
        window.electronAPI.config.update({ privacy: newConfig } as any)
      } catch (error) {
        console.error('Failed to update config:', error)
      }
    },
    [config],
  )

  const handleClearHistory = async (type: 'downloads' | 'recent') => {
    setIsClearing(type)
    try {
      const response = await window.electronAPI.storage.clear(type === 'downloads' ? 'downloads' : 'cache')
      if (isSuccessResponse(response)) {
        toast.success(t(type === 'downloads' ? 'msgDownloadHistoryCleared' : 'msgRecentlyViewedCleared'))
      }
    } catch (error) {
      console.error(`Failed to clear ${type}:`, error)
      toast.error(t('msgClearFailed'))
    } finally {
      setIsClearing(null)
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">{t('settingsPrivacyTitle')}</CardTitle>
        <CardDescription>{t('settingsPrivacyDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* History Preferences */}
        <div className="space-y-4">
          <h3 className="text-foreground flex items-center gap-2 font-medium">{t('settingsHistoryPreferences')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsSaveDownloadHistory')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsSaveDownloadHistoryDesc')}</p>
              </div>
              <Switch
                checked={config.saveDownloadHistory}
                onCheckedChange={checked => handleUpdate({ saveDownloadHistory: checked })}
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsSaveRecentlyViewed')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsSaveRecentlyViewedDesc')}</p>
              </div>
              <Switch
                checked={config.saveRecentlyViewed}
                onCheckedChange={checked => handleUpdate({ saveRecentlyViewed: checked })}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>

        {/* Clear Data */}
        <div className="space-y-4">
          <h3 className="text-foreground flex items-center gap-2 font-medium">{t('settingsClearData')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsDownloadHistory')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsClearDownloadHistoryDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearHistory('downloads')}
                disabled={isClearing === 'downloads'}
              >
                {isClearing === 'downloads' ? t('loading') : t('settingsClear')}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsRecentlyViewed')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsClearRecentlyViewedDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearHistory('recent')}
                disabled={isClearing === 'recent'}
              >
                {isClearing === 'recent' ? t('loading') : t('settingsClear')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
