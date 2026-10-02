import { useId } from "react";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Props for {@link SettingItem}. */
export interface SettingItemProps {
  label: string;
  description?: string;
  /** Extra explanation shown in an info tooltip next to the label. */
  hint?: string;
  children: React.ReactNode;
  /** Stack the control under the label instead of beside it. */
  vertical?: boolean;
}

/**
 * One labelled setting row. The row is a `group` named by its label so the
 * control inside is discoverable by assistive tech (and by tests).
 */
export function SettingItem({
  label,
  description,
  hint,
  children,
  vertical = false,
}: SettingItemProps) {
  const labelId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex gap-4", vertical ? "flex-col" : "items-center justify-between")}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Label id={labelId} className="text-sm font-medium">
            {label}
          </Label>
          {hint && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger aria-label={`About ${label}`}>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{hint}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className={cn("flex-shrink-0", vertical && "w-full")}>{children}</div>
    </div>
  );
}
