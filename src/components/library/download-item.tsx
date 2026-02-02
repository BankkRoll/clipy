/**
 * DownloadItem - Single download entry in the library
 * Shows progress, status, thumbnail, and action buttons (preview, edit, delete).
 */

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FileVideo,
  FolderOpen,
  MoreHorizontal,
  Play,
  Scissors,
  Trash2,
  X,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { DownloadProgress } from '@/types/download'
import { Progress } from '@/components/ui/progress'
import React from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

interface DownloadItemProps {
  download: DownloadProgress
  onCancel: (downloadId: string) => void
  onDelete: (downloadId: string) => void
  onRetry: (downloadId: string) => void
  onPreview?: (download: DownloadProgress) => void
  onOpenFolder?: (download: DownloadProgress) => void
  onEdit?: (download: DownloadProgress) => void
  statusBadge?: React.ReactNode
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'failed':
      return <AlertCircle className="text-destructive h-4 w-4" />
    case 'downloading':
      return <Download className="text-primary h-4 w-4 animate-pulse" />
    case 'cancelled':
      return <X className="text-muted-foreground h-4 w-4" />
    default:
      return <Clock className="h-4 w-4 text-yellow-600" />
  }
}

function getStatusBadge(status: string, t: (key: string) => string) {
  const statusLabels: Record<string, string> = {
    completed: t('statusCompleted'),
    failed: t('statusFailed'),
    downloading: t('statusDownloading'),
    cancelled: t('downloadCancelled'),
    paused: t('statusPaused'),
  }
  const label = statusLabels[status] || status

  switch (status) {
    case 'completed':
      return <Badge variant="default">{label}</Badge>
    case 'failed':
      return <Badge variant="destructive">{label}</Badge>
    case 'downloading':
      return <Badge variant="default">{label}</Badge>
    case 'cancelled':
      return <Badge variant="outline">{label}</Badge>
    default:
      return <Badge variant="secondary">{label}</Badge>
  }
}

export function DownloadItem({
  download,
  onCancel,
  onDelete,
  onRetry,
  onPreview,
  onOpenFolder,
  onEdit,
  statusBadge,
}: DownloadItemProps) {
  const { t } = useTranslation()

  const handleOpenFile = async (filePath: string) => {
    try {
      // Use Electron shell to open the file
      if (window.electronAPI?.shell?.openPath) {
        await window.electronAPI.shell.openPath(filePath)
        toast.success(t('msgFileOpened'))
      } else {
        toast.info(`Opening file: ${filePath}`)
      }
    } catch (error) {
      toast.error(t('msgFileOpenFailed'))
    }
  }

  const handleOpenFolder = async (filePath: string) => {
    try {
      // Use Electron shell to open the containing folder
      if (window.electronAPI?.shell?.showItemInFolder) {
        await window.electronAPI.shell.showItemInFolder(filePath)
        toast.success(t('msgFolderOpened'))
      } else {
        toast.info(`Opening folder containing: ${filePath}`)
      }
    } catch (error) {
      toast.error(t('msgFolderOpenFailed'))
    }
  }

  const handleDelete = async () => {
    try {
      await onDelete(download.downloadId)
      toast.success(t('msgDownloadDeleted'))
    } catch (error) {
      toast.error(t('msgDownloadDeleteFailed'))
    }
  }

  const handleRetry = async () => {
    try {
      await onRetry(download.downloadId)
      toast.success(t('msgDownloadRetried'))
    } catch (error) {
      toast.error(t('msgDownloadRetryFailed'))
    }
  }

  return (
    <Card className="border-0 shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div
            className="bg-muted group relative flex h-12 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg"
            onClick={() => download.status === 'completed' && onPreview?.(download)}
          >
            {download.thumbnailPath ? (
              <img
                src={(() => {
                  // Convert file path to clipy-file:// URL (cross-platform)
                  const normalizedPath = download.thumbnailPath.replace(/\\/g, '/')
                  // Windows paths have drive letter (C:/), Unix paths start with /
                  return /^[a-zA-Z]:/.test(normalizedPath)
                    ? `clipy-file:///${normalizedPath}` // Windows: clipy-file:///C:/...
                    : `clipy-file://${normalizedPath}` // Unix: clipy-file:///Users/... (path already has /)
                })()}
                alt={download.title}
                className="h-full w-full rounded-lg object-cover"
                onError={e => {
                  // Fallback to icon if image fails to load
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
            ) : null}
            <FileVideo className={`text-muted-foreground h-6 w-6 ${download.thumbnailPath ? 'hidden' : ''}`} />
            {download.status === 'completed' && (
              <div className="bg-foreground/10 group-hover:bg-foreground/20 absolute inset-0 flex items-center justify-center rounded-lg transition-all duration-200">
                <Eye className="text-foreground h-4 w-4 opacity-0 group-hover:opacity-100" />
              </div>
            )}
            {download.status === 'downloading' && (
              <div className="bg-primary absolute right-0 bottom-0 left-0 h-1 animate-pulse rounded-b-lg" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-medium">{download.title}</h3>
                <div className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
                  {getStatusIcon(download.status)}
                  {statusBadge || getStatusBadge(download.status, t)}
                  <span>•</span>
                  <span>{formatFileSize(download.totalBytes)}</span>
                  <span>•</span>
                  <span>{new Date(download.startTime).toLocaleDateString()}</span>
                </div>

                {download.status === 'downloading' && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('progress')}</span>
                      <span className="text-primary font-medium">{download.progress}%</span>
                    </div>
                    <div className="relative">
                      <Progress value={download.progress} className="h-2 w-full" />
                      <div
                        className="bg-primary absolute top-0 left-0 h-2 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${download.progress}%` }}
                      />
                    </div>
                    <div className="text-muted-foreground flex justify-between text-xs">
                      <span className="flex items-center gap-1">
                        <div className="bg-primary h-1 w-1 animate-pulse rounded-full"></div>
                        {download.speed}
                      </span>
                      <span>{download.eta}</span>
                    </div>
                  </div>
                )}

                {download.status === 'failed' && download.error && (
                  <p className="text-destructive mt-2 text-sm">{download.error.message}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {download.status === 'downloading' && (
                  <Button variant="outline" size="sm" onClick={() => onCancel(download.downloadId)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}

                {download.status === 'completed' && download.filePath && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => onEdit?.(download)} title={t('actionEdit')}>
                      <Scissors className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPreview?.(download)}
                      title={t('actionPreview')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenFolder?.(download)}
                      title={t('actionOpenFolder')}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {download.status === 'completed' && download.filePath && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit?.(download)}>
                          <Scissors className="mr-2 h-4 w-4" />
                          {t('actionEdit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenFile(download.filePath!)}>
                          <Play className="mr-2 h-4 w-4" />
                          {t('actionOpenFile')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleOpenFolder(download.filePath!)}>
                          <FolderOpen className="mr-2 h-4 w-4" />
                          {t('actionOpenFolder')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {download.status === 'failed' && (
                      <>
                        <DropdownMenuItem onClick={handleRetry}>
                          <Download className="mr-2 h-4 w-4" />
                          {t('actionRetry')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          onSelect={e => e.preventDefault()}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          {t('actionDelete')}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('confirmDeleteTitle')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('confirmDeleteDescription', { title: download.title })}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
