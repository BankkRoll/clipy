/**
 * EditorSettings - Video export and editor preferences
 */

import type { AppConfig, EditorConfig } from '@/types/system'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { isSuccessResponse } from '@/types/api'
import { useTranslation } from 'react-i18next'

const defaultEditorConfig: EditorConfig = {
  defaultCodec: 'copy',
  defaultQuality: 'high',
  preferFastTrim: true,
  defaultAudioFormat: 'mp3',
}

export default function EditorSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<EditorConfig>(defaultEditorConfig)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          const appConfig = response.data as AppConfig
          setConfig(appConfig.editor || defaultEditorConfig)
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
    (updates: Partial<EditorConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      try {
        window.electronAPI.config.update({ editor: newConfig } as any)
      } catch (error) {
        console.error('Failed to update config:', error)
      }
    },
    [config],
  )

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{t('settingsEditorTitle')}</CardTitle>
        <CardDescription>{t('settingsEditorDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Codec & Quality */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsExportDefaults')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm">{t('settingsDefaultCodec')}</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={config.defaultCodec}
                  onValueChange={value => handleUpdate({ defaultCodec: value as EditorConfig['defaultCodec'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copy">
                      <div className="flex items-center gap-2">
                        <span>{t('codecCopy')}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {t('codecFast')}
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="h264">H.264 (MP4)</SelectItem>
                    <SelectItem value="h265">
                      <div className="flex items-center gap-2">
                        <span>H.265 (HEVC)</span>
                        <Badge variant="outline" className="text-[10px]">
                          {t('codecSmaller')}
                        </Badge>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-muted-foreground text-xs">{t('settingsCodecDesc')}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">{t('settingsDefaultQuality')}</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select
                  value={config.defaultQuality}
                  onValueChange={value => handleUpdate({ defaultQuality: value as EditorConfig['defaultQuality'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('qualityLow')} (CRF 28)</SelectItem>
                    <SelectItem value="medium">{t('qualityMedium')} (CRF 23)</SelectItem>
                    <SelectItem value="high">{t('qualityHigh')} (CRF 18)</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-muted-foreground text-xs">{t('settingsQualityDesc')}</p>
            </div>
          </div>
        </div>

        {/* Audio Export */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsAudioExtraction')}</h3>
          <div className="space-y-2">
            <Label className="text-sm">{t('settingsDefaultAudioFormat')}</Label>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select
                value={config.defaultAudioFormat}
                onValueChange={value =>
                  handleUpdate({ defaultAudioFormat: value as EditorConfig['defaultAudioFormat'] })
                }
              >
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp3">MP3 (Universal)</SelectItem>
                  <SelectItem value="m4a">M4A (AAC)</SelectItem>
                  <SelectItem value="opus">Opus (Best quality)</SelectItem>
                  <SelectItem value="wav">WAV (Lossless)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Trim Behavior */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsTrimBehavior')}</h3>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-foreground text-sm font-medium">{t('settingsPreferFastTrim')}</p>
              <p className="text-muted-foreground text-xs">{t('settingsPreferFastTrimDesc')}</p>
            </div>
            <Switch
              checked={config.preferFastTrim}
              onCheckedChange={checked => handleUpdate({ preferFastTrim: checked })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
