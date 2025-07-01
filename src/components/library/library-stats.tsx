import { Card, CardContent } from "@/components/ui/card";
import {
    AlertCircle,
    CheckCircle,
    Clock,
    Download
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

interface LibraryStatsProps {
  stats: {
    total: number;
    active: number;
    completed: number;
    failed: number;
  };
}

export function LibraryStats({ stats }: LibraryStatsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Download className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">{t('totalDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-sm text-muted-foreground">{t('activeDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <CheckCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">{t('completedDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <AlertCircle className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-sm text-muted-foreground">{t('failedDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 