import { Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MetadataOptions } from "./metadata-options";
import { SubtitleOptions } from "./subtitle-options";
import { SponsorBlockOptions } from "./sponsorblock-options";
import { ChapterOptions } from "./chapter-options";
import type { DownloadOptions } from "../../hooks/use-download-options";

interface AdvancedOptionsProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  options: DownloadOptions;
  setters: {
    setEmbedThumbnail: (value: boolean) => void;
    setEmbedMetadata: (value: boolean) => void;
    setWriteDescription: (value: boolean) => void;
    setWriteThumbnail: (value: boolean) => void;
    setDownloadSubtitles: (value: boolean) => void;
    setSubtitleLanguage: (value: string) => void;
    setEmbedSubtitles: (value: boolean) => void;
    setAutoSubtitles: (value: boolean) => void;
    setSponsorBlock: (value: boolean) => void;
    setDownloadChapters: (value: boolean) => void;
    setSplitByChapters: (value: boolean) => void;
  };
  toggleSponsorCategory: (category: string) => void;
}

export function AdvancedOptions({
  isOpen,
  onOpenChange,
  options,
  setters,
  toggleSponsorCategory,
}: AdvancedOptionsProps) {
  return (
    <Collapsible open={isOpen} onOpenChange={onOpenChange} className="mt-4">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <span className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Advanced Options
          </span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-4 space-y-6">
        <MetadataOptions
          embedThumbnail={options.embedThumbnail}
          embedMetadata={options.embedMetadata}
          writeDescription={options.writeDescription}
          writeThumbnail={options.writeThumbnail}
          onEmbedThumbnailChange={setters.setEmbedThumbnail}
          onEmbedMetadataChange={setters.setEmbedMetadata}
          onWriteDescriptionChange={setters.setWriteDescription}
          onWriteThumbnailChange={setters.setWriteThumbnail}
        />

        <Separator />

        <SubtitleOptions
          downloadSubtitles={options.downloadSubtitles}
          subtitleLanguage={options.subtitleLanguage}
          embedSubtitles={options.embedSubtitles}
          autoSubtitles={options.autoSubtitles}
          onDownloadSubtitlesChange={setters.setDownloadSubtitles}
          onSubtitleLanguageChange={setters.setSubtitleLanguage}
          onEmbedSubtitlesChange={setters.setEmbedSubtitles}
          onAutoSubtitlesChange={setters.setAutoSubtitles}
        />

        <Separator />

        <SponsorBlockOptions
          enabled={options.sponsorBlock}
          categories={options.sponsorCategories}
          onEnabledChange={setters.setSponsorBlock}
          onCategoryToggle={toggleSponsorCategory}
        />

        <Separator />

        <ChapterOptions
          downloadChapters={options.downloadChapters}
          splitByChapters={options.splitByChapters}
          onDownloadChaptersChange={setters.setDownloadChapters}
          onSplitByChaptersChange={setters.setSplitByChapters}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
