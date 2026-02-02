/**
 * AboutSettings - Application info and resources
 * Clean, minimal design with version info, system details, and resource links.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ExternalLink, Github } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Logo from '@/components/navigation/logo'
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
        const response = await window.electronAPI.system.getInfo()
        if (isSuccessResponse(response)) {
          setSystemInfo(response.data as SystemInfo)
        } else {
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
        console.error('[AboutSettings] Failed to fetch system info:', error)
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

  const handleOpenUrl = async (url: string) => {
    try {
      await window.electronAPI.shell.openExternal(url)
    } catch (error) {
      console.error('Failed to open external URL:', error)
    }
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          {t('settingsAboutTitle', { appName: systemInfo?.packageInfo?.name || 'Clipy' })}
        </CardTitle>
        <CardDescription>
          {isLoading ? <Skeleton className="h-5 w-64" /> : systemInfo?.packageInfo?.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* App Info */}
        <div className="flex items-center gap-4">
          <Logo size={48} className="rounded-xl" />
          <div>
            <h3 className="text-foreground text-lg font-semibold">
              {isLoading ? <Skeleton className="h-6 w-24" /> : systemInfo?.packageInfo?.name || 'Clipy'}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              {isLoading ? (
                <Skeleton className="h-5 w-20" />
              ) : (
                <>
                  <span className="text-muted-foreground text-sm">v{systemInfo?.packageInfo?.version}</span>
                  <Badge variant="secondary" className="text-xs">
                    {t('settingsBeta')}
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsSystemInformation')}</h3>
          <div className="bg-muted/30 grid gap-3 rounded-lg p-4 sm:grid-cols-2">
            <div className="text-sm">
              <span className="text-muted-foreground">{t('settingsOperatingSystem')}</span>
              <p className="text-foreground font-medium">
                {isLoading ? <Skeleton className="mt-1 h-5 w-20" /> : systemInfo?.os}
              </p>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">{t('settingsArchitecture')}</span>
              <p className="text-foreground font-medium">
                {isLoading ? <Skeleton className="mt-1 h-5 w-16" /> : systemInfo?.arch}
              </p>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">{t('settingsNodeJs')}</span>
              <p className="text-foreground font-medium">
                {isLoading ? <Skeleton className="mt-1 h-5 w-20" /> : systemInfo?.nodeVersion}
              </p>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">{t('settingsElectron')}</span>
              <p className="text-foreground font-medium">
                {isLoading ? <Skeleton className="mt-1 h-5 w-16" /> : systemInfo?.electronVersion}
              </p>
            </div>
          </div>
        </div>

        {/* Resources */}
        <div className="space-y-4">
          <h3 className="text-foreground font-medium">{t('settingsLegalResources')}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => handleOpenUrl('https://opensource.org/licenses/MIT')}
              disabled={isLoading}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {systemInfo?.packageInfo?.license || 'MIT'} {t('settingsViewLicense')}
            </Button>

            <Button
              variant="outline"
              className="justify-start"
              onClick={() =>
                handleOpenUrl(systemInfo?.packageInfo?.repository?.url || 'https://github.com/BankkRoll/clipy')
              }
              disabled={isLoading}
            >
              <Github className="mr-2 h-4 w-4" />
              {t('settingsViewOnGitHub')}
            </Button>

            <Button
              variant="outline"
              className="justify-start"
              onClick={() =>
                handleOpenUrl(systemInfo?.packageInfo?.homepage || 'https://github.com/BankkRoll/clipy#readme')
              }
              disabled={isLoading}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('settingsViewDocs')}
            </Button>

            <Button
              variant="outline"
              className="justify-start"
              onClick={() =>
                handleOpenUrl(systemInfo?.packageInfo?.bugs?.url || 'https://github.com/BankkRoll/clipy/issues')
              }
              disabled={isLoading}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('settingsReportBug')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
