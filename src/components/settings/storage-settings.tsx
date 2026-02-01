import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Folder, HardDrive, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { isSuccessResponse } from '@/types/api'
import { AppConfig } from '@/types/system'
import { useTranslation } from 'react-i18next'

export default function StorageSettings() {
  const { t } = useTranslation()
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadConfig = async () => {
      try {
        console.log('[StorageSettings] Loading config...')
        const response = await window.electronAPI.config.get()
        console.log('[StorageSettings] Config loaded:', response)
        if (isSuccessResponse(response)) {
          setConfig(response.data as AppConfig)
        }
      } catch (error) {
        console.error('[StorageSettings] Failed to load config:', error)
        // Set minimal fallback config
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
    try {
      console.log(`[StorageSettings] Clearing ${type}...`)
      const response = await window.electronAPI.storage.clear(type)
      if (isSuccessResponse(response)) {
        console.log(`Successfully cleared ${type}`)
        // Could refresh config here if needed
      } else {
        console.error(`Failed to clear ${type}`)
      }
    } catch (error) {
      console.error(`Failed to clear ${type}:`, error)
    }
  }, [])

  if (isLoading) {
    return (
      <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
              <HardDrive className="text-primary h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-foreground text-2xl font-bold">Storage Settings</CardTitle>
              <CardDescription className="text-muted-foreground mt-1 text-base">
                Manage your download locations and cache
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 bg-card/50 border shadow-lg backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-xl">
            <HardDrive className="text-primary h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-foreground text-2xl font-bold">Storage Settings</CardTitle>
            <CardDescription className="text-muted-foreground mt-1 text-base">
              Manage your download locations and cache
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Download Location */}
        <div className="bg-muted/30 border-border/50 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Folder className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-semibold">Downloads</h3>
          </div>
          <p className="text-muted-foreground mb-3 text-sm">Location: {config?.download?.downloadPath || 'Not set'}</p>
          <Button variant="outline" size="sm" disabled className="border-border/50 text-muted-foreground">
            Change Location (Coming Soon)
          </Button>
        </div>

        {/* Cache Management */}
        <div className="bg-muted/30 border-border/50 rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-lg">
              <Trash2 className="text-primary h-4 w-4" />
            </div>
            <h3 className="text-foreground text-lg font-semibold">Cache Management</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground font-medium">Temporary Files</p>
                <p className="text-muted-foreground text-sm">Clean up temporary download files</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('temp')}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                Clear Temp
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-foreground font-medium">Cache Files</p>
                <p className="text-muted-foreground text-sm">Clear cached thumbnails and metadata</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('cache')}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                Clear Cache
              </Button>
            </div>
          </div>
        </div>

        {/* Storage Paths Info */}
        <div className="bg-muted/30 border-border/50 rounded-lg border p-4">
          <h3 className="text-foreground mb-3 text-lg font-semibold">Storage Locations</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Downloads: </span>
              <span className="text-foreground font-mono">{config?.download?.downloadPath || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cache: </span>
              <span className="text-foreground font-mono">{config?.storage?.cachePath || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Temp: </span>
              <span className="text-foreground font-mono">{config?.storage?.tempPath || 'Unknown'}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
