import { FileText } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface MetadataOptionsProps {
  embedThumbnail: boolean;
  embedMetadata: boolean;
  writeDescription: boolean;
  writeThumbnail: boolean;
  onEmbedThumbnailChange: (value: boolean) => void;
  onEmbedMetadataChange: (value: boolean) => void;
  onWriteDescriptionChange: (value: boolean) => void;
  onWriteThumbnailChange: (value: boolean) => void;
}

export function MetadataOptions({
  embedThumbnail,
  embedMetadata,
  writeDescription,
  writeThumbnail,
  onEmbedThumbnailChange,
  onEmbedMetadataChange,
  onWriteDescriptionChange,
  onWriteThumbnailChange,
}: MetadataOptionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Metadata
      </h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="embed-thumbnail" className="text-sm">Embed Thumbnail</Label>
          <Switch
            id="embed-thumbnail"
            checked={embedThumbnail}
            onCheckedChange={onEmbedThumbnailChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="embed-metadata" className="text-sm">Embed Metadata</Label>
          <Switch
            id="embed-metadata"
            checked={embedMetadata}
            onCheckedChange={onEmbedMetadataChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="write-description" className="text-sm">Save Description</Label>
          <Switch
            id="write-description"
            checked={writeDescription}
            onCheckedChange={onWriteDescriptionChange}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="write-thumbnail" className="text-sm">Save Thumbnail</Label>
          <Switch
            id="write-thumbnail"
            checked={writeThumbnail}
            onCheckedChange={onWriteThumbnailChange}
          />
        </div>
      </div>
    </div>
  );
}
