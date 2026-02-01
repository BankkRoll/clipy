import { AlertCircle, CheckCircle, Download, Search } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'

type DownloadFilter = 'all' | 'active' | 'completed' | 'failed'

interface DownloadFiltersProps {
  filter: DownloadFilter
  searchQuery: string
  onFilterChange: (filter: DownloadFilter) => void
  onSearchChange: (query: string) => void
}

export function DownloadFilters({ filter, searchQuery, onFilterChange, onSearchChange }: DownloadFiltersProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex-1">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder={t('searchDownloads')}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      <Select value={filter} onValueChange={(value: DownloadFilter) => onFilterChange(value)}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              <span>{t('filterAll')}</span>
            </div>
          </SelectItem>
          <SelectItem value="active">
            <div className="flex items-center gap-2">
              <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
              <span>{t('filterActive')}</span>
            </div>
          </SelectItem>
          <SelectItem value="completed">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span>{t('filterCompleted')}</span>
            </div>
          </SelectItem>
          <SelectItem value="failed">
            <div className="flex items-center gap-2">
              <AlertCircle className="text-destructive h-4 w-4" />
              <span>{t('filterFailed')}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
