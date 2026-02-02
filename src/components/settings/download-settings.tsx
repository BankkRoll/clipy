/**
 * DownloadSettings - Download preferences panel
 * Clean, minimal design with quality, format, path, and performance settings.
 */

import type { AppConfig, DownloadConfig } from '@/types/system'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { isSuccessResponse } from '@/types/api'
import { useTranslation } from 'react-i18next'

export default function DownloadSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<DownloadConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          setConfig((response.data as AppConfig).download)
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const debouncedUpdateRef = useRef<NodeJS.Timeout | null>(null)
  const handleUpdate = useCallback(
    (updates: Partial<DownloadConfig>, debounce = false) => {
      if (!config) return

      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      const performUpdate = () => {
        try {
          window.electronAPI.config.update({ download: updates } as any)
        } catch (error) {
          console.error('Failed to update config:', error)
        }
      }

      if (debounce) {
        if (debouncedUpdateRef.current) {
          clearTimeout(debouncedUpdateRef.current)
        }
        debouncedUpdateRef.current = setTimeout(performUpdate, 500)
      } else {
        performUpdate()
      }
    },
    [config],
  )

  useEffect(() => {
    return () => {
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current)
        debouncedUpdateRef.current = null
      }
    }
  }, [])

  const handleBrowse = async () => {
    try {
      const response = await window.electronAPI.system.openDialog({
        title: t('settingsSelectDownloadFolder'),
        defaultPath: config?.downloadPath,
        properties: ['openDirectory', 'createDirectory'],
      })
      if (isSuccessResponse(response) && response.data) {
        handleUpdate({ downloadPath: response.data as string })
      }
    } catch (error) {
      console.error('Failed to open dialog:', error)
    }
  }

  if (!config) {
    return (
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">{t('settingsDownloadTitle')}</CardTitle>
          <CardDescription>{t('settingsDownloadDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('settingsFailedToLoadDownloads')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('settingsDownloadTitle')}</CardTitle>
        <CardDescription>{t('settingsDownloadDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Quality & Format */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsQualityFormat')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quality" className="text-sm">
                {t('settingsDefaultVideoQuality')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={config.defaultVideoQuality}
                  onValueChange={value => handleUpdate({ defaultVideoQuality: value })}
                >
                  <SelectTrigger id="quality">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">{t('settingsBestAvailable')}</SelectItem>
                    <SelectItem value="4k">{t('quality4k')}</SelectItem>
                    <SelectItem value="1440p">{t('quality1440p')}</SelectItem>
                    <SelectItem value="1080p">{t('quality1080p')}</SelectItem>
                    <SelectItem value="720p">{t('quality720p')}</SelectItem>
                    <SelectItem value="480p">{t('quality480p')}</SelectItem>
                    <SelectItem value="360p">{t('quality360p')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="format" className="text-sm">
                {t('settingsVideoFormat')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={config.videoFormat} onValueChange={value => handleUpdate({ videoFormat: value as any })}>
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp4">{t('formatMP4')}</SelectItem>
                    <SelectItem value="webm">{t('formatWebM')}</SelectItem>
                    <SelectItem value="mkv">{t('formatMKV')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        {/* Download Location */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsStorageLocation')}</h3>
          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm">
              {t('settingsDownloadDirectory')}
            </Label>
            <div className="flex gap-2">
              <Input id="location" value={config.downloadPath} readOnly className="flex-1 font-mono text-sm" />
              <Button variant="outline" onClick={handleBrowse}>
                {t('settingsBrowse')}
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">{t('settingsDownloadDirectoryDesc')}</p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-foreground text-sm font-medium">{t('settingsCreateSubdirectories')}</p>
              <p className="text-muted-foreground text-xs">{t('settingsCreateSubdirectoriesDesc')}</p>
            </div>
            <Switch
              checked={config.createSubdirectories}
              onCheckedChange={checked => handleUpdate({ createSubdirectories: checked })}
            />
          </div>
        </div>

        {/* Additional Content */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsAdditionalContent')}</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsDownloadSubtitles')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsDownloadSubtitlesDesc')}</p>
              </div>
              <Switch
                checked={config.downloadSubtitles}
                onCheckedChange={checked => handleUpdate({ downloadSubtitles: checked })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsDownloadThumbnails')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsDownloadThumbnailsDesc')}</p>
              </div>
              <Switch
                checked={config.downloadThumbnails}
                onCheckedChange={checked => handleUpdate({ downloadThumbnails: checked })}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsSaveMetadata')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsSaveMetadataDesc')}</p>
              </div>
              <Switch
                checked={config.saveMetadata}
                onCheckedChange={checked => handleUpdate({ saveMetadata: checked })}
              />
            </div>
          </div>
        </div>

        {/* Performance */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsPerformance')}</h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t('settingsConcurrentDownloads')}</Label>
              <Badge variant="outline" className="font-mono">
                {config.maxConcurrentDownloads}
              </Badge>
            </div>
            <Slider
              value={[config.maxConcurrentDownloads]}
              onValueChange={value => handleUpdate({ maxConcurrentDownloads: value[0] }, true)}
              onValueCommit={value => handleUpdate({ maxConcurrentDownloads: value[0] }, false)}
              max={8}
              min={1}
              step={1}
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{t('settingsConservative')}</span>
              <span>{t('settingsBalanced')}</span>
              <span>{t('settingsAggressive')}</span>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-foreground text-sm font-medium">{t('settingsAutoRetryFailed')}</p>
              <p className="text-muted-foreground text-xs">{t('settingsAutoRetryFailedDesc')}</p>
            </div>
            <Switch
              checked={config.autoRetryFailed}
              onCheckedChange={checked => handleUpdate({ autoRetryFailed: checked })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
