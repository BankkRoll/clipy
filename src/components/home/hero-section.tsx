import { Link, useNavigate } from "@tanstack/react-router";
import {
    CheckCircle,
    Clock,
    Download,
    Film,
    FolderOpen,
    Link as LinkIcon,
    Settings,
    Shield,
    Sparkles
} from "lucide-react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function HeroSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState("downloader");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const handleProcessUrl = () => {
    if (youtubeUrl.trim()) {
      if (activeMode === "downloader") {
        navigate({ to: "/downloader", search: { url: youtubeUrl } });
      } else {
        navigate({ to: "/editor", search: { url: youtubeUrl } });
      }
    }
  };

  const stats = [
    { icon: CheckCircle, text: t("heroStats4KSupport") },
    { icon: Clock, text: t("heroStatsRealTime") },
    { icon: Sparkles, text: t("heroStatsLossless") },
    { icon: Shield, text: t("heroStatsPrivacy") },
  ];

  return (
    <div className="w-full h-full justify-center items-center m-auto flex flex-col py-6 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <div className="text-[18rem] md:text-[22rem] lg:text-[25rem] font-black text-muted/20 leading-none tracking-tighter">
          {t("appName")}
        </div>
      </div>
      <div className="relative flex-1 flex flex-col justify-center max-w-3xl mx-auto px-6 py-10 z-10">
        <div className="flex justify-center mb-6">
          <Badge variant="secondary" className="gap-2 px-4 py-1.5 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            {t("heroProfessionalTools")}
            <Badge variant="outline" className="ml-2 text-xs">{t("heroFree")}</Badge>
          </Badge>
        </div>

        <div className="flex justify-center mb-8">
          <Tabs value={activeMode} onValueChange={setActiveMode} className="w-auto">
            <TabsList className="grid w-full grid-cols-2 h-10 p-0.5 bg-muted/60 backdrop-blur-sm">
              <TabsTrigger value="downloader" className="gap-2 px-4 text-sm font-medium data-[state=active]:bg-background">
                <Download className="h-3 w-3" />
                {t("titleDownloader")}
              </TabsTrigger>
              <TabsTrigger value="editor" className="gap-2 px-4 text-sm font-medium data-[state=active]:bg-background">
                <Film className="h-3 w-3" />
                {t("titleEditor")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="w-full mb-6">
          <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {activeMode === "downloader" ? t("heroDropLinkDownload") : t("heroDropLinkEdit")}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder={t("heroUrlPlaceholder")}
                      className="h-12 text-base border-2 pr-32 bg-background/80"
                      onKeyPress={(e) => e.key === 'Enter' && handleProcessUrl()}
                    />
                    <Button 
                      onClick={handleProcessUrl}
                      disabled={!youtubeUrl.trim()}
                      className="absolute right-1 top-1 h-10 px-6 text-sm font-semibold"
                      variant={youtubeUrl.trim() ? "default" : "outline"}
                    >
                      {activeMode === "downloader" ? t("heroGet1Click") : t("heroEdit1Click")}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-16">
          <div className="flex flex-wrap justify-center gap-3 max-w-3xl mx-auto">
            <Link to="/downloader">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="p-2 rounded-md bg-primary/10">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium">{t("titleDownloader")}</span>
              </Button>
            </Link>
            
            <Link to="/editor">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="p-2 rounded-md bg-primary/10">
                  <Film className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium">{t("titleEditor")}</span>
              </Button>
            </Link>
            
            <Link to="/library">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="p-2 rounded-md bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium">{t("titleLibrary")}</span>
              </Button>
            </Link>
            
            <Link to="/settings">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="p-2 rounded-md bg-primary/10">
                  <Settings className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium">{t("titleSettings")}</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="border-t border-border/50 pt-8">
          <div className="flex flex-wrap justify-center items-center gap-6 mx-auto">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{stat.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
} 