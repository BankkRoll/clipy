import React from "react";
import { useTranslation } from "react-i18next";

import { Separator } from "@/components/ui/separator";

import {
    AboutSettings,
    DownloadSettings,
    EditorSettings,
    LanguageSelector,
    StorageSettings
} from "@/components/settings";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8 max-w-4xl">
        
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground">{t("settingsTitle")}</h1>
              <p className="text-lg text-muted-foreground mt-1">
                {t("settingsSubtitle")}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          
          <section>
            <LanguageSelector />
          </section>

          <Separator className="my-12 bg-border/50" />

          <section>
            <DownloadSettings />
          </section>

          <Separator className="my-12 bg-border/50" />

          <section>
            <EditorSettings />
          </section>

          <Separator className="my-12 bg-border/50" />

          <section>
            <StorageSettings />
          </section>

          <Separator className="my-12 bg-border/50" />

          <section>
            <AboutSettings />
          </section>
        </div>
      </div>
    </div>
  );
} 