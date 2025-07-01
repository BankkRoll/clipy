import { Cpu, Film, Save, Zap } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isSuccessResponse } from "@/types/api";
import type { AppConfig, EditorConfig } from "@/types/config";

export default function EditorSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<EditorConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.configManager.get();
        if (isSuccessResponse(response)) {
          setConfig((response.data as AppConfig).editor);
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleUpdate = (updates: Partial<EditorConfig>) => {
    if (!config) return;
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    window.configManager.updateEditor(updates);
  };

  if (!config) {
    return (
      <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Film className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
                {t("settingsEditorTitle")}
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{t("settingsComingSoon")}</Badge>
              </CardTitle>
              <CardDescription className="text-base text-muted-foreground mt-1">
                {t("settingsEditorDescription")}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Failed to load editor settings.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border/50 shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-3">
              {t("settingsEditorTitle")}
              <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{t("settingsComingSoon")}</Badge>
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-1">
              {t("settingsEditorDescription")}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("settingsHardwareAcceleration")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsHardwareAccelerationDesc")}</p>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-11" />
            ) : (
              <Switch
                checked={config.hardwareAcceleration}
                onCheckedChange={(checked) =>
                  handleUpdate({ hardwareAcceleration: checked })
                }
              />
            )}
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Save className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("settingsAutoSaveProjects")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsAutoSaveProjectsDesc")}</p>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-11" />
            ) : (
              <Switch
                checked={config.autoSaveProjects}
                onCheckedChange={(checked) =>
                  handleUpdate({ autoSaveProjects: checked })
                }
              />
            )}
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
                <Zap className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("settingsRealtimePreview")}</p>
                <p className="text-sm text-muted-foreground mt-1">{t("settingsRealtimePreviewDesc")}</p>
              </div>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-11" />
            ) : (
              <Switch
                checked={config.realtimePreview}
                onCheckedChange={(checked) =>
                  handleUpdate({ realtimePreview: checked })
                }
              />
            )}
          </div>
        </div>
        
        <div className="mt-8 p-5 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Film className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm">
              <p className="font-semibold text-foreground mb-2">{t("settingsTimelineEditorTitle")}</p>
              <p className="text-muted-foreground leading-relaxed">
                {t("settingsTimelineEditorDesc")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 