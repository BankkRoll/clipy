import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

export function LibraryHeader() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold">{t("titleLibrary")}</h1>
        <p className="text-muted-foreground">{t("subtitleLibrary")}</p>
      </div>
      <Link to="/downloader">
        <Button>
          <Download className="h-4 w-4 mr-2" />
          {t('downloadNew')}
        </Button>
      </Link>
    </div>
  );
} 