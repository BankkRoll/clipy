import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { badgeVariants } from "@/components/ui/badge-variants";
import { cn } from "@/lib/utils";
import { SPONSORBLOCK_CATEGORIES } from "@/types/download";

/** Props for {@link SponsorBlockOptions}. */
export interface SponsorBlockOptionsProps {
  enabled: boolean;
  categories: string[];
  onEnabledChange: (value: boolean) => void;
  onCategoryToggle: (category: string) => void;
}

/** SponsorBlock toggle plus per-category selection for one download. */
export function SponsorBlockOptions({
  enabled,
  categories,
  onEnabledChange,
  onCategoryToggle,
}: SponsorBlockOptionsProps) {
  return (
    <div className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4" />
        SponsorBlock
      </h4>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="sponsor-block" className="text-sm">
            Remove Sponsored Segments
          </Label>
          <p className="text-xs text-muted-foreground">Automatically skip sponsor segments</p>
        </div>
        <Switch id="sponsor-block" checked={enabled} onCheckedChange={onEnabledChange} />
      </div>
      {enabled && (
        <div className="flex flex-wrap gap-2">
          {SPONSORBLOCK_CATEGORIES.map((cat) => {
            const selected = categories.includes(cat.value);
            return (
              <button
                key={cat.value}
                type="button"
                aria-pressed={selected}
                title={cat.description}
                className={cn(
                  badgeVariants({ variant: selected ? "default" : "outline" }),
                  "cursor-pointer"
                )}
                onClick={() => onCategoryToggle(cat.value)}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
