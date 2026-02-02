/**
 * AdvancedSettings - Advanced configuration and debugging
 */

import type { AdvancedConfig, AppConfig } from '@/types/system'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { AlertTriangle, Bug, FileCode2, RefreshCw, RotateCcw, Terminal } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

const defaultAdvancedConfig: AdvancedConfig = {
  debugLogging: false,
  ffmpegPath: '',
  ytDlpPath: '',
}

interface BinaryInfo {
  ffmpeg: { version: string; path: string } | null
  ytDlp: { version: string; path: string } | null
}

export default function AdvancedSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<AdvancedConfig>(defaultAdvancedConfig)
  const [isLoading, setIsLoading] = useState(true)
  const [binaryInfo, setBinaryInfo] = useState<BinaryInfo>({ ffmpeg: null, ytDlp: null })
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          const appConfig = response.data as AppConfig
          setConfig(appConfig.advanced || defaultAdvancedConfig)
        }

        // For now, show placeholder binary info
        // In a real implementation, you'd fetch this from the main process
        setBinaryInfo({
          ffmpeg: { version: '6.1', path: 'Bundled' },
          ytDlp: { version: '2024.01.30', path: 'Bundled' },
        })
      } catch (error) {
        console.error('Failed to fetch config:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleUpdate = useCallback(
    (updates: Partial<AdvancedConfig>) => {
      const newConfig = { ...config, ...updates }
      setConfig(newConfig)

      try {
        window.electronAPI.config.update({ advanced: newConfig } as any)
      } catch (error) {
        console.error('Failed to update config:', error)
      }
    },
    [config],
  )

  const handleResetAll = async () => {
    setIsResetting(true)
    try {
      const response = await window.electronAPI.config.reset()
      if (isSuccessResponse(response)) {
        toast.success(t('msgSettingsReset'))
        // Reload the page to apply changes
        window.location.reload()
      }
    } catch (error) {
      console.error('Failed to reset settings:', error)
      toast.error(t('msgResetFailed'))
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl font-semibold">{t('settingsAdvancedTitle')}</CardTitle>
        <CardDescription>{t('settingsAdvancedDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Binary Versions */}
        <div className="space-y-4">
          <h3 className="text-foreground flex items-center gap-2 font-medium">{t('settingsBinaryVersions')}</h3>
          <div className="bg-muted/30 space-y-3 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-medium">FFmpeg</span>
                {isLoading ? (
                  <Skeleton className="h-5 w-16" />
                ) : binaryInfo.ffmpeg ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    v{binaryInfo.ffmpeg.version}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    {t('settingsNotFound')}
                  </Badge>
                )}
              </div>
              <code className="text-muted-foreground text-xs">
                {isLoading ? <Skeleton className="h-4 w-20" /> : binaryInfo.ffmpeg?.path || t('settingsNotInstalled')}
              </code>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-foreground text-sm font-medium">yt-dlp</span>
                {isLoading ? (
                  <Skeleton className="h-5 w-20" />
                ) : binaryInfo.ytDlp ? (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {binaryInfo.ytDlp.version}
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    {t('settingsNotFound')}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-muted-foreground text-xs">
                  {isLoading ? <Skeleton className="h-4 w-20" /> : binaryInfo.ytDlp?.path || t('settingsNotInstalled')}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Debug Options */}
        <div className="space-y-4">
          <h3 className="text-foreground flex items-center gap-2 font-medium">{t('settingsDebugging')}</h3>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-foreground text-sm font-medium">{t('settingsDebugLogging')}</p>
              <p className="text-muted-foreground text-xs">{t('settingsDebugLoggingDesc')}</p>
            </div>
            <Switch
              checked={config.debugLogging}
              onCheckedChange={checked => handleUpdate({ debugLogging: checked })}
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-4">
          <h3 className="text-destructive flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            {t('settingsDangerZone')}
          </h3>
          <div className="border-destructive/50 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground text-sm font-medium">{t('settingsResetAllSettings')}</p>
                <p className="text-muted-foreground text-xs">{t('settingsResetAllSettingsDesc')}</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isResetting}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('settingsReset')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('settingsResetConfirmTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('settingsResetConfirmDesc')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetAll} className="bg-destructive hover:bg-destructive/90">
                      {isResetting ? t('loading') : t('settingsResetConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
