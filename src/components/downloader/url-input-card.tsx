import {
    Link as LinkIcon,
} from "lucide-react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface UrlInputCardProps {
    onSubmit: (url: string) => void;
    isLoading: boolean;
}

export function UrlInputCard({ onSubmit, isLoading }: UrlInputCardProps) {
    const { t } = useTranslation();
    const [youtubeUrl, setYoutubeUrl] = useState("");

    const handleProcessUrl = () => {
        if (youtubeUrl.trim()) {
            onSubmit(youtubeUrl);
        }
    };

    return (
    <div className="w-full h-full justify-center items-center m-auto flex flex-col pt-24 py-6 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
        <div className="text-[18rem] md:text-[22rem] lg:text-[25rem] font-black text-muted/20 leading-none tracking-tighter">
          {t("appName")}
        </div>
      </div>
      <div className="relative flex-1 flex flex-col justify-center max-w-3xl mx-auto px-6 py-16 z-10">
        <div className="w-full py-12">
          <Card className="border-2 border-dashed border-muted-foreground/30 bg-muted/20 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">
                      {t("heroDropLinkDownload")}
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder={t("heroUrlPlaceholder")}
                      className="h-12 min-w-[500px] text-base border-2 pr-32 bg-background/80"
                      onKeyPress={(e) => e.key === 'Enter' && handleProcessUrl()}
                    />
                    <Button 
                      onClick={handleProcessUrl}
                      disabled={!youtubeUrl.trim()}
                      className="absolute right-1 top-1 h-10"
                      variant={youtubeUrl.trim() ? "default" : "outline"}
                    >
                      {t("heroGet1Click")}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
    );
} 