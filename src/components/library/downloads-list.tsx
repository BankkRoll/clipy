import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { DownloadProgress } from "@/types/download";
import { Link } from "@tanstack/react-router";
import { BarChart3, Download, FileVideo } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { DownloadFilters } from "./download-filters";
import { DownloadItem } from "./download-item";

type DownloadFilter = 'all' | 'active' | 'completed' | 'failed';

interface DownloadsListProps {
  downloads: DownloadProgress[];
  filter: DownloadFilter;
  searchQuery: string;
  isLoading: boolean;
  onFilterChange: (filter: DownloadFilter) => void;
  onSearchChange: (query: string) => void;
  onCancelDownload: (downloadId: string) => void;
}

export function DownloadsList({
  downloads,
  filter,
  searchQuery,
  isLoading,
  onFilterChange,
  onSearchChange,
  onCancelDownload
}: DownloadsListProps) {
  const { t } = useTranslation();

  const filteredDownloads = downloads.filter(download =>
    download.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    download.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <CardTitle>{t('downloadHistory')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <DownloadFilters
          filter={filter}
          searchQuery={searchQuery}
          onFilterChange={onFilterChange}
          onSearchChange={onSearchChange}
        />

        <Separator />

        <div className="space-y-4">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <Skeleton className="h-16 w-16 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredDownloads.length === 0 ? (
            <div className="text-center py-16">
              <div className="p-4 rounded-full bg-muted/50 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <FileVideo className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t('noDownloads')}</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t('noDownloadsDesc')}</p>
              <Link to="/downloader">
                <Button>
                  <Download className="h-4 w-4 mr-2" />
                  {t('startDownloading')}
                </Button>
              </Link>
            </div>
          ) : (
            filteredDownloads.map((download) => (
              <DownloadItem
                key={download.downloadId}
                download={download}
                onCancel={onCancelDownload}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
} 