import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExternalLink, Github, Info } from 'lucide-react'
import React, { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import type { SystemInfo } from '@/types/system'
import { isSuccessResponse } from '@/types/api'
import { useTranslation } from 'react-i18next'

export default function AboutSettings() {
  const { t } = useTranslation()
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        console.log('[AboutSettings] Fetching system info...')
        const response = await window.electronAPI.system.getInfo()
        console.log('[AboutSettings] System info response:', response)
        if (isSuccessResponse(response)) {
          console.log('[AboutSettings] Setting system info:', response.data)
          setSystemInfo(response.data as SystemInfo)
        } else {
          console.warn('[AboutSettings] Failed to get system info:', response)
          // Set fallback data to prevent crashes
          setSystemInfo({
            appName: 'Clipy',
            appVersion: '1.0.0',
            os: 'Unknown',
            arch: 'Unknown',
            nodeVersion: process.version,
            electronVersion: process.versions.electron,
            packageInfo: null,
          })
        }
      } catch (error) {
        console.error('[AboutSettings] Exception fetching system info:', error)
        // Set fallback data to prevent crashes
        setSystemInfo({
          appName: 'Clipy',
          appVersion: '1.0.0',
          os: 'Unknown',
          arch: 'Unknown',
          nodeVersion: process.version,
          electronVersion: process.versions.electron,
          packageInfo: null,
        })
      } finally {
        setIsLoading(false)
      }
    }
    fetchSystemInfo()
  }, [])

  const InfoRow = ({ label, value, badge }: { label: string; value: React.ReactNode; badge?: string }) => (
    <div className="bg-muted/30 border-border/50 rounded-lg border p-4">
      <p className="text-muted-foreground mb-2 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <span className="text-foreground font-semibold">{value}</span>
        {badge && (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  )

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
            <Info className="text-primary h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-foreground text-2xl font-bold">
              {t('settingsAboutTitle', { appName: systemInfo?.packageInfo?.name || 'App' })}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-1 text-base">
              {isLoading ? <Skeleton className="h-5 w-80" /> : systemInfo?.packageInfo?.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="mb-8 flex items-center gap-4">
            <div className="from-primary to-primary/80 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg">
              <span className="text-primary-foreground text-2xl font-bold">
                {systemInfo?.packageInfo?.name?.[0] || 'A'}
              </span>
            </div>
            <div>
              <h3 className="text-foreground text-2xl font-bold">
                {isLoading ? <Skeleton className="h-8 w-32" /> : systemInfo?.packageInfo?.name}
              </h3>
              <p className="text-muted-foreground font-medium">{t('navProfessionalYouTubeTools')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoRow
              label={t('settingsVersion')}
              value={isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.packageInfo?.version}
              badge={t('settingsBeta')}
            />

            <InfoRow label={t('settingsPlatform')} value={t('settingsPlatformValue')} />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <h3 className="text-foreground mb-6 flex items-center gap-2 text-lg font-bold">
            <div className="bg-primary h-2 w-2 rounded-full"></div>
            {t('settingsSystemInformation')}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoRow
              label={t('settingsOperatingSystem')}
              value={isLoading ? <Skeleton className="h-6 w-28" /> : systemInfo?.os}
            />

            <InfoRow
              label={t('settingsArchitecture')}
              value={isLoading ? <Skeleton className="h-6 w-12" /> : systemInfo?.arch}
            />

            <InfoRow
              label={t('settingsNodeJs')}
              value={isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.nodeVersion}
            />

            <InfoRow
              label={t('settingsElectron')}
              value={isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.electronVersion}
            />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <h3 className="text-foreground mb-6 flex items-center gap-2 text-lg font-bold">
            <div className="bg-primary h-2 w-2 rounded-full"></div>
            {t('settingsLegalResources')}
          </h3>
          <div className="space-y-4">
            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div>
                <p className="text-foreground font-semibold">{t('settingsOpenSourceLicense')}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {isLoading ? <Skeleton className="h-4 w-28" /> : systemInfo?.packageInfo?.license}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleOpenUrl('https://opensource.org/licenses/MIT')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('settingsViewLicense')}
              </Button>
            </div>

            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div>
                <p className="text-foreground font-semibold">{t('settingsSourceCode')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('settingsSourceCodeDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleOpenUrl(systemInfo?.packageInfo?.repository?.url || 'https://github.com/BankkRoll/clipy')
                }
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <Github className="mr-2 h-4 w-4" />
                {t('settingsViewOnGitHub')}
              </Button>
            </div>

            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div>
                <p className="text-foreground font-semibold">{t('settingsDocumentation')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('settingsDocumentationDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleOpenUrl(systemInfo?.packageInfo?.homepage || 'https://github.com/BankkRoll/clipy#readme')
                }
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('settingsViewDocs')}
              </Button>
            </div>

            <div className="bg-muted/30 border-border/50 hover:bg-muted/50 flex items-center justify-between rounded-lg border p-4 transition-colors">
              <div>
                <p className="text-foreground font-semibold">{t('settingsReportIssues')}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t('settingsReportIssuesDesc')}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleOpenUrl(systemInfo?.packageInfo?.bugs?.url || 'https://github.com/BankkRoll/clipy/issues')
                }
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('settingsReportBug')}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
