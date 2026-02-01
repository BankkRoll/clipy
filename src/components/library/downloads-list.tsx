import { BarChart3, Download, FileVideo } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { DownloadFilters } from './download-filters'
import { DownloadItem } from './download-item'
import type { DownloadProgress } from '@/types/download'
import { Link } from '@tanstack/react-router'
import React from 'react'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useTranslation } from 'react-i18next'

type DownloadFilter = 'all' | 'active' | 'completed' | 'failed'

interface DownloadsListProps {
  downloads: DownloadProgress[]
  filter: DownloadFilter
  searchQuery: string
  isLoading: boolean
  onFilterChange: (filter: DownloadFilter) => void
  onSearchChange: (query: string) => void
  onCancelDownload: (downloadId: string) => void
  onDeleteDownload: (downloadId: string) => void
  onRetryDownload: (downloadId: string) => void
  onPreviewDownload?: (download: DownloadProgress) => void
  onOpenFolder?: (download: DownloadProgress) => void
  getStatusBadge?: (status: string) => React.ReactNode
}

export function DownloadsList({
  downloads,
  filter,
  searchQuery,
  isLoading,
  onFilterChange,
  onSearchChange,
  onCancelDownload,
  onDeleteDownload,
  onRetryDownload,
  onPreviewDownload,
  onOpenFolder,
  getStatusBadge,
}: DownloadsListProps) {
  const { t } = useTranslation()

  const filteredDownloads = downloads.filter(
    download =>
      download.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      download.url.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="text-primary h-5 w-5" />
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
          {filteredDownloads.length === 0 ? (
            <div className="py-16 text-center">
              <div className="bg-muted/50 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full p-4">
                <FileVideo className="text-muted-foreground h-8 w-8" />
              </div>
              <h3 className="mb-2 text-lg font-medium">{t('noDownloads')}</h3>
              <p className="text-muted-foreground mx-auto mb-6 max-w-md">{t('noDownloadsDesc')}</p>
              <Link to="/">
                <Button>
                  <Download className="mr-2 h-4 w-4" />
                  {t('startDownloading')}
                </Button>
              </Link>
            </div>
          ) : (
            filteredDownloads.map(download => (
              <DownloadItem
                key={download.downloadId}
                download={download}
                onCancel={onCancelDownload}
                onDelete={onDeleteDownload}
                onRetry={onRetryDownload}
                onPreview={onPreviewDownload}
                onOpenFolder={onOpenFolder}
                statusBadge={getStatusBadge?.(download.status)}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
