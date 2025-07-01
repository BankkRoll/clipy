import { EditorRoute } from "@/routes/routes";
import { useSearch } from "@tanstack/react-router";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function EditorPage() {
  const { t } = useTranslation();
  const { url } = useSearch({ from: EditorRoute.id });

  useEffect(() => {
    if (url) {
      console.log(`Starting editor process for: ${url}`);
    }
  }, [url]);

  return (
    <div className="space-y-12">
      {url ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <h1 className="font-mono text-4xl font-bold">{t("titleEditor")}</h1>
          <p className="text-end text-sm uppercase text-muted-foreground">
            {t("subtitleEditor")}
          </p>
          <div className="mt-4 text-sm">
            <p>{t("processingUrl")}: {url}</p>
            <p>{t("comingSoonEditorDesc")}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <h1 className="font-mono text-4xl font-bold">{t("titleEditor")}</h1>
          <p className="text-end text-sm uppercase text-muted-foreground">
            {t("subtitleEditor")}
          </p>
          <div className="mt-4 text-sm">
            <p>{t("comingSoonEditor")}</p>
            <p>{t("comingSoonEditorDesc")}</p>
          </div>
        </div>
      )}
    </div>
  );
} 