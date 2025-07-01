import { ExternalLink, Github, Info } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { isSuccessResponse } from "@/types/api";
import type { SystemInfo } from "@/types/system";

export default function AboutSettings() {
  const { t } = useTranslation();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        const response = await window.configManager.getSystemInfo();
        if (isSuccessResponse(response)) {
          setSystemInfo(response.data as SystemInfo);
        }
      } catch (error) {
        console.error('Failed to fetch system info:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSystemInfo();
  }, []);

  const InfoRow = ({
    label,
    value,
    badge,
  }: {
    label: string;
    value: React.ReactNode;
    badge?: string;
  }) => (
    <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
      <p className="font-medium text-muted-foreground text-sm mb-2">{label}</p>
      <div className="flex items-center gap-3">
        <span className="font-semibold text-foreground">{value}</span>
        {badge && (
          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
            {badge}
          </Badge>
        )}
      </div>
    </div>
  );

  const handleOpenUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Info className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              {t('settingsAboutTitle', { appName: systemInfo?.packageInfo?.name || 'App' })}
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-1">
              {isLoading ? <Skeleton className="h-5 w-80" /> : systemInfo?.packageInfo?.description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        
        <div>
          <div className="flex items-center gap-4 mb-8">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground font-bold text-2xl">
                {systemInfo?.packageInfo?.name?.[0] || 'A'}
              </span>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-foreground">
                {isLoading ? <Skeleton className="h-8 w-32" /> : systemInfo?.packageInfo?.name}
              </h3>
              <p className="text-muted-foreground font-medium">
                {t("navProfessionalYouTubeTools")}
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow
              label={t("settingsVersion")}
              value={
                isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.packageInfo?.version
              }
              badge={t("settingsBeta")}
            />
            
            <InfoRow
              label={t("settingsPlatform")}
              value={t("settingsPlatformValue")}
            />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <h3 className="font-bold text-lg text-foreground mb-6 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary"></div>
            {t("settingsSystemInformation")}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow
              label={t("settingsOperatingSystem")}
              value={
                isLoading ? <Skeleton className="h-6 w-28" /> : systemInfo?.os
              }
            />
            
            <InfoRow
              label={t("settingsArchitecture")}
              value={
                isLoading ? <Skeleton className="h-6 w-12" /> : systemInfo?.arch
              }
            />
            
            <InfoRow
              label="Node.js"
              value={
                isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.nodeVersion
              }
            />
            
            <InfoRow
              label="Electron"
              value={
                isLoading ? <Skeleton className="h-6 w-20" /> : systemInfo?.electronVersion
              }
            />
          </div>
        </div>

        <Separator className="bg-border/50" />

        <div>
          <h3 className="font-bold text-lg text-foreground mb-6 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary"></div>
            {t("settingsLegalResources")}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsOpenSourceLicense")}</p>
                <p className="text-sm text-muted-foreground mt-1">
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
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("settingsViewLicense")}
              </Button>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsSourceCode")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsSourceCodeDesc")}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleOpenUrl(systemInfo?.packageInfo?.repository?.url || 'https://github.com/BankkRoll/clipy')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <Github className="h-4 w-4 mr-2" />
                {t("settingsViewOnGitHub")}
              </Button>
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsDocumentation")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsDocumentationDesc")}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleOpenUrl(systemInfo?.packageInfo?.homepage || 'https://github.com/BankkRoll/clipy#readme')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("settingsViewDocs")}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
              <div>
                <p className="font-semibold text-foreground">{t("settingsReportIssues")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsReportIssuesDesc")}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleOpenUrl(systemInfo?.packageInfo?.bugs?.url || 'https://github.com/BankkRoll/clipy/issues')}
                disabled={isLoading}
                className="border-primary/20 text-primary hover:bg-primary/10"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                {t("settingsReportBug")}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 