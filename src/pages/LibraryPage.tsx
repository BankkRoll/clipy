import {
  DownloadsList,
  LibraryHeader,
  LibraryStats
} from "@/components/library";
import { isSuccessResponse } from "@/types/api";
import type { DownloadProgress } from "@/types/download";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type DownloadFilter = 'all' | 'active' | 'completed' | 'failed';

export default function LibraryPage() {
  const { t } = useTranslation();
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [filter, setFilter] = useState<DownloadFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDownloads();
    const interval = setInterval(() => {
      loadDownloads();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const loadDownloads = async () => {
    try {
      const response = await window.downloadManager.list(filter);
      if (isSuccessResponse(response)) {
        setDownloads(response.data.downloads);
      }
    } catch (error) {
      console.error('Failed to load downloads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelDownload = async (downloadId: string) => {
    try {
      const response = await window.downloadManager.cancel(downloadId);
      if (isSuccessResponse(response)) {
        toast.success(t('msgDownloadCancelled'));
        loadDownloads();
      }
    } catch (error) {
      toast.error(t('msgDownloadCancelFailed'));
    }
  };

  const activeDownloads = downloads.filter(d => d.status === 'downloading');
  const completedDownloads = downloads.filter(d => d.status === 'completed');
  const failedDownloads = downloads.filter(d => d.status === 'failed');

  const stats = {
    total: downloads.length,
    active: activeDownloads.length,
    completed: completedDownloads.length,
    failed: failedDownloads.length,
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <LibraryHeader />

      <LibraryStats stats={stats} />

      <DownloadsList
        downloads={downloads}
        filter={filter}
        searchQuery={searchQuery}
        isLoading={isLoading}
        onFilterChange={setFilter}
        onSearchChange={setSearchQuery}
        onCancelDownload={handleCancelDownload}
      />
    </div>
  );
} 