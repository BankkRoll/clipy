import {
    Download,
    FileVideo,
    Folder,
    Image,
    Settings2,
    Subtitles,
    Zap,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { isSuccessResponse } from '@/types/api';
import type { AppConfig, DownloadConfig } from '@/types/config';

export default function DownloadSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<DownloadConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.configManager.get();
        if (isSuccessResponse(response)) {
          setConfig((response.data as AppConfig).download);
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleUpdate = (updates: Partial<DownloadConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    window.configManager.updateDownload(updates);
  };

  const handleBrowse = async () => {
    try {
      const response = await window.configManager.openDialog();
      if (isSuccessResponse(response) && response.data) {
        handleUpdate({ downloadPath: response.data as string });
      }
    } catch (error) {
      console.error('Failed to open dialog:', error);
    }
  };

  if (!config) {
    return (
      <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Download className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">{t('settingsDownloadTitle')}</CardTitle>
              <CardDescription className="text-base text-muted-foreground mt-1">{t('settingsDownloadDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Failed to load download settings.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">{t('settingsDownloadTitle')}</CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-1">{t('settingsDownloadDescription')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileVideo className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t('settingsQualityFormat')}</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="quality" className="text-sm font-semibold text-foreground">
                {t('settingsDefaultVideoQuality')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Select
                  value={config.defaultVideoQuality}
                  onValueChange={(value) =>
                    handleUpdate({ defaultVideoQuality: value })
                  }
                >
                <SelectTrigger className="h-12 border-border/50 bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
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
              <Label htmlFor="format" className="text-sm font-semibold text-foreground">
                {t('settingsVideoFormat')}
              </Label>
              {isLoading ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Select
                  value={config.videoFormat}
                  onValueChange={(value) =>
                    handleUpdate({ videoFormat: value as any })
                  }
                >
                <SelectTrigger className="h-12 border-border/50 bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
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

          <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-2">
                  {t('settingsSmartQualityTitle')}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {t('settingsSmartQualityDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Folder className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t('settingsStorageLocation')}</h3>
          </div>
          
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="location" className="text-sm font-semibold text-foreground">
                {t('settingsDownloadDirectory')}
              </Label>
              <div className="flex gap-3">
                <Input 
                  id="location"
                  value={config.downloadPath}
                  readOnly 
                  className="flex-1 h-12 border-border/50 bg-muted/30"
                />
                <Button variant="outline" onClick={handleBrowse} className="h-12 px-6 border-primary/20 text-primary hover:bg-primary/10">
                  {t('settingsBrowse')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settingsDownloadDirectoryDesc')}
              </p>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-semibold text-foreground">
                  {t('settingsCreateSubdirectories')}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('settingsCreateSubdirectoriesDesc')}
                </p>
              </div>
              <Switch
                checked={config.createSubdirectories}
                onCheckedChange={(checked) =>
                  handleUpdate({ createSubdirectories: checked })
                }
              />
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings2 className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t('settingsAdditionalContent')}</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Subtitles className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {t('settingsDownloadSubtitles')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settingsDownloadSubtitlesDesc')}
                  </p>
                </div>
              </div>
              <Switch
                checked={config.downloadSubtitles}
                onCheckedChange={(checked) =>
                  handleUpdate({ downloadSubtitles: checked })
                }
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <Image className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    {t('settingsDownloadThumbnails')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settingsDownloadThumbnailsDesc')}
                  </p>
                </div>
              </div>
              <Switch
                checked={config.downloadThumbnails}
                onCheckedChange={(checked) =>
                  handleUpdate({ downloadThumbnails: checked })
                }
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-4">
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                  <FileVideo className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{t('settingsSaveMetadata')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settingsSaveMetadataDesc')}
                  </p>
                </div>
              </div>
              <Switch
                checked={config.saveMetadata}
                onCheckedChange={(checked) =>
                  handleUpdate({ saveMetadata: checked })
                }
              />
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t('settingsPerformance')}</h3>
          </div>
          
          <div className="space-y-6">
            <div className="p-5 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-foreground">
                    {t('settingsConcurrentDownloads')}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('settingsConcurrentDownloadsDesc')}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                  {config.concurrentDownloads} downloads
                </Badge>
              </div>
              <Slider
                value={[config.concurrentDownloads]}
                onValueChange={(value) =>
                  handleUpdate({ concurrentDownloads: value[0] })
                }
                max={8}
                min={1}
                step={1}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-3">
                <span>{t('settingsConservative')}</span>
                <span>{t('settingsBalanced')}</span>
                <span>{t('settingsAggressive')}</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-semibold text-foreground">{t('settingsAutoRetryFailed')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('settingsAutoRetryFailedDesc')}
                </p>
              </div>
              <Switch
                checked={config.autoRetryFailed}
                onCheckedChange={(checked) =>
                  handleUpdate({ autoRetryFailed: checked })
                }
              />
            </div>
          </div>

          <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Settings2 className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-2">
                  {t('settingsPerformanceImpactTitle')}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  {t('settingsPerformanceImpactDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 