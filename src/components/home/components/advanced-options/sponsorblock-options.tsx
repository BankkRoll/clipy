import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { SPONSORBLOCK_CATEGORIES } from "@/types/download";

interface SponsorBlockOptionsProps {
  enabled: boolean;
  categories: string[];
  onEnabledChange: (value: boolean) => void;
  onCategoryToggle: (category: string) => void;
}

export function SponsorBlockOptions({
  enabled,
  categories,
  onEnabledChange,
  onCategoryToggle,
}: SponsorBlockOptionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        SponsorBlock
      </h4>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="sponsor-block" className="text-sm">Remove Sponsored Segments</Label>
          <p className="text-xs text-muted-foreground">Automatically skip sponsor segments</p>
        </div>
        <Switch
          id="sponsor-block"
          checked={enabled}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {enabled && (
        <div className="flex flex-wrap gap-2">
          {SPONSORBLOCK_CATEGORIES.map((cat) => (
            <Badge
              key={cat.value}
              variant={categories.includes(cat.value) ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => onCategoryToggle(cat.value)}
            >
              {cat.label}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
