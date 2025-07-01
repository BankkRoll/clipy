import { BarChart3, Folder, HardDrive, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { isSuccessResponse } from "@/types/api";
import { AppConfig } from "@/types/config";
import type { StorageUsage } from "@/types/system";

function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function StorageSettings() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    try {
      const response = await window.configManager.getStorageUsage();
      if (isSuccessResponse(response)) {
        setUsage(response.data as StorageUsage);
      }
    } catch (error) {
      console.error('Failed to fetch storage usage:', error);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await window.configManager.get();
      if (isSuccessResponse(response)) {
        setConfig(response.data as AppConfig);
      }
    } catch (error) {
      console.error('Failed to fetch config:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
    fetchConfig();
  }, [fetchUsage, fetchConfig]);

  const handleClearCache = async (type: 'temp' | 'thumbnails') => {
    try {
      const response = await window.configManager.clearCache(type);
      if (isSuccessResponse(response)) {
        console.log(`Successfully cleared ${type} cache.`);
        fetchUsage();
      } else {
        console.error(`Failed to clear cache: ${response.error}`);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const totalUsage = usage ? usage.downloads + usage.cache + usage.temp : 0;
  const totalAvailable = usage ? usage.available : 0;
  const usagePercentage =
    totalAvailable > 0 ? (totalUsage / totalAvailable) * 100 : 0;

  if (!usage || !config) {
    return (
      <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">{t("settingsStorageTitle")}</CardTitle>
              <CardDescription className="text-base text-muted-foreground mt-1">
                {t("settingsStorageDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Failed to load storage information.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">{t("settingsStorageTitle")}</CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-1">
              {t("settingsStorageDescription")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t("settingsStorageUsage")}</h3>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-5 rounded-xl bg-muted/30 border border-border/50">
                <p className="font-semibold text-muted-foreground text-sm mb-2">{t("settingsTotalUsed")}</p>
                <p className="text-3xl font-bold text-primary">
                  {isLoading ? <Skeleton className="h-10 w-24" /> : formatBytes(totalUsage)}
                </p>
              </div>
              <div className="p-5 rounded-xl bg-muted/30 border border-border/50">
                <p className="font-semibold text-muted-foreground text-sm mb-2">{t("settingsAvailable")}</p>
                <p className="text-3xl font-bold text-muted-foreground">
                  {isLoading ? <Skeleton className="h-10 w-24" /> : formatBytes(totalAvailable)}
                </p>
              </div>
            </div>
            
            <div className="p-5 rounded-xl bg-muted/30 border border-border/50">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-foreground">Storage Usage</p>
                <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">
                  {usagePercentage.toFixed(1)}% used
                </Badge>
              </div>
              <Progress value={usagePercentage} className="w-full h-3" />
              
              <div className="grid grid-cols-3 gap-4 text-xs mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-primary" />
                  <span className="text-muted-foreground">Downloads ({isLoading ? <Skeleton className="h-4 w-16 inline-block" /> : formatBytes(usage.downloads)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">Cache ({isLoading ? <Skeleton className="h-4 w-16 inline-block" /> : formatBytes(usage.cache)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary" />
                  <span className="text-muted-foreground">Temp ({isLoading ? <Skeleton className="h-4 w-16 inline-block" /> : formatBytes(usage.temp)})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground">{t("settingsCacheManagement")}</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsTemporaryFiles")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLoading ? <Skeleton className="h-4 w-20" /> : formatBytes(usage.temp)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('temp')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                {t("settingsClearCache")}
              </Button>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsThumbnailCache")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLoading ? <Skeleton className="h-4 w-20" /> : formatBytes(usage.cache)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleClearCache('thumbnails')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                {t("settingsClearThumbnails")}
              </Button>
            </div>
          </div>
          
          <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
            <div className="flex items-start gap-4">
              <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <HardDrive className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-foreground mb-2">{t("settingsAutoCleanupTitle")}</p>
                <p className="text-muted-foreground leading-relaxed">
                  {t("settingsAutoCleanupDesc")}
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
            <h3 className="font-bold text-lg text-foreground">{t("settingsDownloadLocations")}</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-semibold text-foreground">{t("settingsPrimaryDownloads")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLoading ? <Skeleton className="h-4 w-64" /> : config.download.downloadPath}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">{t("settingsDefault")}</Badge>
                <Button variant="outline" size="sm" disabled className="border-border/50 text-muted-foreground">
                  {t("settingsChange")}
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50">
              <div>
                <p className="font-semibold text-foreground">{t("settingsTemporaryDownloads")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isLoading ? <Skeleton className="h-4 w-64" /> : config.storage.tempPath}
                </p>
              </div>
              <Button variant="outline" size="sm" disabled className="border-border/50 text-muted-foreground">
                {t("settingsChange")}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 