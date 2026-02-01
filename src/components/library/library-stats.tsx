import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, CheckCircle, Clock, Download } from 'lucide-react'
import React from 'react'
import { useTranslation } from 'react-i18next'

interface LibraryStatsProps {
  stats: {
    total: number
    active: number
    completed: number
    failed: number
  }
}

export function LibraryStats({ stats }: LibraryStatsProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-3">
              <Download className="text-primary h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-muted-foreground text-sm">{t('totalDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-3">
              <Clock className="text-primary h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.active}</p>
              <p className="text-muted-foreground text-sm">{t('activeDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-3">
              <CheckCircle className="text-primary h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-muted-foreground text-sm">{t('completedDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg p-3">
              <AlertCircle className="text-primary h-6 w-6" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.failed}</p>
              <p className="text-muted-foreground text-sm">{t('failedDownloads')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
