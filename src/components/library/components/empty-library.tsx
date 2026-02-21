import { Film, Upload, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";

interface EmptyLibraryProps {
  searchQuery: string;
  onDownload: () => void;
  onImport: () => void;
}

export function EmptyLibrary({
  searchQuery,
  onDownload,
  onImport,
}: EmptyLibraryProps) {
  if (searchQuery) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Search />
          </EmptyMedia>
          <EmptyTitle>No videos found</EmptyTitle>
          <EmptyDescription>
            No results for "{searchQuery}". Try a different search term.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Film />
        </EmptyMedia>
        <EmptyTitle>Your library is empty</EmptyTitle>
        <EmptyDescription>
          Download videos or import existing ones to get started.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Button size="sm" onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          <Button size="sm" variant="outline" onClick={onImport}>
            <Upload className="mr-2 h-4 w-4" />
            Import
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
