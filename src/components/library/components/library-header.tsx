import {
  Search,
  Grid3X3,
  List,
  Upload,
  RefreshCw,
  HardDrive,
  Clock,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes, formatDuration, cn } from "@/lib/utils";
import { SORT_OPTIONS, type ViewMode, type SortOption } from "../constants";

interface LibraryStats {
  totalVideos: number;
  totalSize: number;
  totalDuration: number;
}

interface LibraryHeaderProps {
  stats: LibraryStats | null;
  loading: boolean;
  searchQuery: string;
  sortOption: SortOption;
  viewMode: ViewMode;
  onRefresh: () => void;
  onImport: () => void;
  onSearchChange: (query: string) => void;
  onSortChange: (option: SortOption) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function LibraryHeader({
  stats,
  loading,
  searchQuery,
  sortOption,
  viewMode,
  onRefresh,
  onImport,
  onSearchChange,
  onSortChange,
  onViewModeChange,
}: LibraryHeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Library</h1>
        {stats && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Video className="h-4 w-4" />
              {stats.totalVideos} videos
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="h-4 w-4" />
              {formatBytes(stats.totalSize)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatDuration(stats.totalDuration)}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onImport} className="gap-2">
          <Upload className="h-4 w-4" />
          Import
        </Button>

        <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-64 pl-9"
          />
        </div>

        <Select value={sortOption} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex rounded-lg border border-border">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-r-none"
            onClick={() => onViewModeChange("grid")}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-9 w-9 rounded-l-none"
            onClick={() => onViewModeChange("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
