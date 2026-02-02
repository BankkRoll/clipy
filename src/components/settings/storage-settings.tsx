/**
 * StorageSettings - Storage and cache management
 * Clean, minimal design showing storage paths with cache clearing options.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isSuccessResponse } from '@/types/api'
import { AppConfig } from '@/types/system'
import { useTranslation } from 'react-i18next'

export default function StorageSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [clearing, setClearing] = useState<'temp' | 'cache' | null>(null)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          setConfig(response.data as AppConfig)
        }
      } catch (error) {
        console.error('[StorageSettings] Failed to load config:', error)
        setConfig({
          download: { downloadPath: 'App Data/downloads' },
          storage: {
            cachePath: 'App Data/cache',
            tempPath: 'App Data/temp',
          },
        } as AppConfig)
      } finally {
        setIsLoading(false)
      }
    }
    loadConfig()
  }, [])

  const handleClearCache = useCallback(async (type: 'temp' | 'cache') => {
    setClearing(type)
    try {
      const response = await window.electronAPI.storage.clear(type)
      if (isSuccessResponse(response)) {
        console.log(`Successfully cleared ${type}`)
      }
    } catch (error) {
      console.error(`Failed to clear ${type}:`, error)
    } finally {
      setClearing(null)
    }
  }, [])

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{t('settingsStorageTitle')}</CardTitle>
          <CardDescription>{t('settingsStorageDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('loading')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('settingsStorageTitle')}</CardTitle>
        <CardDescription>{t('settingsStorageDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Storage Locations */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsDownloadLocations')}</h3>
          <div className="bg-muted/30 space-y-3 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('settingsPrimaryDownloads')}</span>
              <code className="text-foreground max-w-[60%] truncate font-mono text-xs">
                {config?.download?.downloadPath || t('settingsNotSet')}
              </code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('settingsThumbnailCache')}</span>
              <code className="text-foreground max-w-[60%] truncate font-mono text-xs">
                {config?.storage?.cachePath || t('settingsUnknown')}
              </code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('settingsTemporaryDownloads')}</span>
              <code className="text-foreground max-w-[60%] truncate font-mono text-xs">
                {config?.storage?.tempPath || t('settingsUnknown')}
              </code>
            </div>
          </div>
        </div>

        {/* Cache Management */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsCacheManagement')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsTemporaryFiles')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsCleanTempDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('temp')}
                disabled={clearing === 'temp'}
              >
                {clearing === 'temp' ? t('loading') : t('settingsClearTemp')}
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsThumbnailCache')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsClearCacheDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('cache')}
                disabled={clearing === 'cache'}
              >
                {clearing === 'cache' ? t('loading') : t('settingsClearCache')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
