/**
 * VideoPreviewModal - Modal for previewing completed downloads
 */

import type { DownloadProgress } from '@/types/download'
import { Folder, Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

interface VideoPreviewModalProps {
  download: DownloadProgress & { blobUrl?: string }
  isLoading: boolean
  onClose: () => void
  onOpenFolder: () => void
}

export function VideoPreviewModal({ download, isLoading, onClose, onOpenFolder }: VideoPreviewModalProps) {
  const { t } = useTranslation()

  // Convert file path to clipy-file:// URL (cross-platform)
  const getVideoSource = () => {
    if (download.blobUrl) return download.blobUrl

    const normalizedPath = (download.filePath || '').replace(/\\/g, '/')
    // Windows paths have drive letter (C:/), Unix paths start with /
    return /^[a-zA-Z]:/.test(normalizedPath)
      ? `clipy-file:///${normalizedPath}` // Windows
      : `clipy-file://${normalizedPath}` // Unix (path already has /)
  }

  return (
    <div
      className="bg-background/50 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-background max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col md:flex-row">
          {/* Video Player Section */}
          <div className="flex-1 p-4">
            {isLoading ? (
              <div className="bg-muted flex h-64 w-full items-center justify-center rounded-lg">
                <div className="text-center">
                  <div className="border-primary mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2"></div>
                  <p className="text-muted-foreground text-sm">{t('loadingVideo')}</p>
                </div>
              </div>
            ) : (
              <video controls className="w-full rounded-lg" preload="metadata">
                <source src={getVideoSource()} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            )}
          </div>

          {/* Info Section */}
          <div className="w-full border-t p-4 md:w-80 md:border-t-0 md:border-l">
            <h3 className="mb-4 text-lg font-semibold">{download.title}</h3>
            <div className="mb-6 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t('previewSize')}</span>
                <span className="text-sm font-medium">{download.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t('previewQuality')}</span>
                <span className="text-sm font-medium">{t('previewQualityMP4')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t('previewCompleted')}</span>
                <span className="text-sm font-medium">{new Date(download.startTime || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t('previewDuration')}</span>
                <span className="text-sm font-medium">{t('previewDurationVideoFile')}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={() => download.filePath && window.electronAPI.shell.openPath(download.filePath)}
                className="w-full"
              >
                <Play className="mr-2 h-4 w-4" />
                {t('openInExternalPlayer')}
              </Button>
              <Button variant="outline" onClick={onOpenFolder} className="w-full">
                <Folder className="mr-2 h-4 w-4" />
                {t('openFolder')}
              </Button>
              <Button variant="outline" onClick={onClose} className="w-full">
                {t('closePreview')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
