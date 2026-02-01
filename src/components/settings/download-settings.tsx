import type { AppConfig, DownloadConfig } from '@/types/system'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Download, FileVideo, Folder, Image, Settings2, Subtitles, Zap } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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

  // Debounced update to prevent excessive API calls during slider dragging
  const debouncedUpdateRef = useRef<NodeJS.Timeout | null>(null)
  const handleUpdate = useCallback(
    (updates: Partial<DownloadConfig>, debounce = false) => {
      if (!config) return

      // Update local state immediately
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
        // Clear previous timeout
        if (debouncedUpdateRef.current) {
          clearTimeout(debouncedUpdateRef.current)
        }
        // Set new debounced update
        debouncedUpdateRef.current = setTimeout(performUpdate, 500)
      } else {
        performUpdate()
      }
    },
    [config],
  )

  // Cleanup timeout on unmount
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
      const response = await window.electronAPI.system.openDialog()
      if (isSuccessResponse(response) && response.data) {
        handleUpdate({ downloadPath: response.data as string })
      }
    } catch (error) {
      console.error('Failed to open dialog:', error)
    }
  }

  if (!config) {
    return (
      <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <Download className="text-primary h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-foreground text-2xl font-bold">{t('settingsDownloadTitle')}</CardTitle>
              <CardDescription className="text-muted-foreground mt-1 text-base">
                {t('settingsDownloadDescription')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{t('settingsFailedToLoadDownloads')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
            <Download className="text-primary h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-foreground text-2xl font-bold">{t('settingsDownloadTitle')}</CardTitle>
            <CardDescription className="text-muted-foreground mt-1 text-base">
              {t('settingsDownloadDescription')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <FileVideo className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-bold">{t('settingsQualityFormat')}</h3>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="quality" className="text-foreground text-sm font-semibold">
                {t('settingsDefaultVideoQuality')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Select
                  value={config.defaultVideoQuality}
                  onValueChange={value => handleUpdate({ defaultVideoQuality: value })}
                >
                  <SelectTrigger className="border-border/50 bg-muted/30 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {t('settingsRecommended')}
                        </Badge>
                        {t('settingsBestAvailable')}
                      </div>
                    </SelectItem>
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

            <div className="space-y-3">
              <Label htmlFor="format" className="text-foreground text-sm font-semibold">
                {t('settingsVideoFormat')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Select value={config.videoFormat} onValueChange={value => handleUpdate({ videoFormat: value as any })}>
                  <SelectTrigger className="border-border/50 bg-muted/30 h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mp4">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {t('settingsMostCompatible')}
                        </Badge>
                        {t('formatMP4')}
                      </div>
                    </SelectItem>
                    <SelectItem value="webm">{t('formatWebM')}</SelectItem>
                    <SelectItem value="mkv">{t('formatMKV')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="from-primary/5 to-primary/10 border-primary/20 mt-6 rounded-xl border bg-gradient-to-r p-5">
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                <Zap className="text-primary h-4 w-4" />
              </div>
              <div className="text-sm">
                <p className="text-foreground mb-2 font-semibold">{t('settingsSmartQualityTitle')}</p>
                <p className="text-muted-foreground leading-relaxed">{t('settingsSmartQualityDesc')}</p>
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Folder className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-bold">{t('settingsStorageLocation')}</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="location" className="text-foreground text-sm font-semibold">
                {t('settingsDownloadDirectory')}
              </Label>
              <div className="flex gap-3">
                <Input
                  id="location"
                  value={config.downloadPath}
                  readOnly
                  className="border-border/50 bg-muted/30 h-12 flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleBrowse}
                  className="border-primary/20 text-primary hover:bg-primary/10 h-12 px-6"
                >
                  {t('settingsBrowse')}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{t('settingsDownloadDirectoryDesc')}</p>
            </div>

            <div className="bg-muted/30 border-border/50 flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-foreground font-semibold">{t('settingsCreateSubdirectories')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('settingsCreateSubdirectoriesDesc')}</p>
              </div>
              <Switch
                checked={config.createSubdirectories}
                onCheckedChange={checked => handleUpdate({ createSubdirectories: checked })}
              />
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Settings2 className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-bold">{t('settingsAdditionalContent')}</h3>
          </div>

          <div className="space-y-4">
            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
                  <Subtitles className="text-muted-foreground h-4 w-4" />
                </div>
                <div>
                  <p className="text-foreground font-semibold">{t('settingsDownloadSubtitles')}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{t('settingsDownloadSubtitlesDesc')}</p>
                </div>
              </div>
              <Switch
                checked={config.downloadSubtitles}
                onCheckedChange={checked => handleUpdate({ downloadSubtitles: checked })}
              />
            </div>

            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
                  <Image className="text-muted-foreground h-4 w-4" />
                </div>
                <div>
                  <p className="text-foreground font-semibold">{t('settingsDownloadThumbnails')}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{t('settingsDownloadThumbnailsDesc')}</p>
                </div>
              </div>
              <Switch
                checked={config.downloadThumbnails}
                onCheckedChange={checked => handleUpdate({ downloadThumbnails: checked })}
              />
            </div>

            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div className="flex items-center gap-4">
                <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-lg">
                  <FileVideo className="text-muted-foreground h-4 w-4" />
                </div>
                <div>
                  <p className="text-foreground font-semibold">{t('settingsSaveMetadata')}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{t('settingsSaveMetadataDesc')}</p>
                </div>
              </div>
              <Switch
                checked={config.saveMetadata}
                onCheckedChange={checked => handleUpdate({ saveMetadata: checked })}
              />
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="mb-6 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Zap className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-bold">{t('settingsPerformance')}</h3>
          </div>

          <div className="space-y-6">
            <div className="bg-muted/30 border-border/50 rounded-xl border p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-foreground font-semibold">{t('settingsConcurrentDownloads')}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{t('settingsConcurrentDownloadsDesc')}</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                  {config.maxConcurrentDownloads} {t('settingsDownloadsCount')}
                </Badge>
              </div>
              <Slider
                value={[config.maxConcurrentDownloads]}
                onValueChange={value => handleUpdate({ maxConcurrentDownloads: value[0] }, true)}
                onValueCommit={value => handleUpdate({ maxConcurrentDownloads: value[0] }, false)}
                max={8}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="text-muted-foreground mt-3 flex justify-between text-xs">
                <span>{t('settingsConservative')}</span>
                <span>{t('settingsBalanced')}</span>
                <span>{t('settingsAggressive')}</span>
              </div>
            </div>

            <div className="bg-muted/30 border-border/50 flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-foreground font-semibold">{t('settingsAutoRetryFailed')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('settingsAutoRetryFailedDesc')}</p>
              </div>
              <Switch
                checked={config.autoRetryFailed}
                onCheckedChange={checked => handleUpdate({ autoRetryFailed: checked })}
              />
            </div>
          </div>

          <div className="from-primary/5 to-primary/10 border-primary/20 mt-6 rounded-xl border bg-gradient-to-r p-5">
            <div className="flex items-start gap-4">
              <div className="bg-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg">
                <Settings2 className="text-primary h-4 w-4" />
              </div>
              <div className="text-sm">
                <p className="text-foreground mb-2 font-semibold">{t('settingsPerformanceImpactTitle')}</p>
                <p className="text-muted-foreground leading-relaxed">{t('settingsPerformanceImpactDesc')}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
