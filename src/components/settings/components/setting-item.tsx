import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SettingItemProps {
  label: string;
  description?: string;
  hint?: string;
  children: React.ReactNode;
  vertical?: boolean;
}

export function SettingItem({
  label,
  description,
  hint,
  children,
  vertical = false,
}: SettingItemProps) {
  return (
    <div className={cn(
      "flex gap-4",
      vertical ? "flex-col" : "items-center justify-between"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {hint && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-xs">{hint}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className={cn("flex-shrink-0", vertical && "w-full")}>
        {children}
      </div>
    </div>
  );
}
