import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

type DownloadFilter = 'all' | 'active' | 'completed' | 'failed';

interface DownloadFiltersProps {
  filter: DownloadFilter;
  searchQuery: string;
  onFilterChange: (filter: DownloadFilter) => void;
  onSearchChange: (query: string) => void;
}

export function DownloadFilters({ 
  filter, 
  searchQuery, 
  onFilterChange, 
  onSearchChange 
}: DownloadFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchDownloads')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>
      <Select value={filter} onValueChange={(value: DownloadFilter) => onFilterChange(value)}>
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAll')}</SelectItem>
          <SelectItem value="active">{t('filterActive')}</SelectItem>
          <SelectItem value="completed">{t('filterCompleted')}</SelectItem>
          <SelectItem value="failed">{t('filterFailed')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
} 