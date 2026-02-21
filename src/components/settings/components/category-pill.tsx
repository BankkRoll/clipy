import { cn } from "@/lib/utils";

interface CategoryPillProps {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

export function CategoryPill({
  label,
  description,
  selected,
  onClick,
}: CategoryPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
      )}
    >
      <span className={cn(
        "text-xs font-medium",
        selected ? "text-primary" : "text-foreground"
      )}>
        {label}
      </span>
      <span className="text-[10px] text-muted-foreground leading-tight">
        {description}
      </span>
    </button>
  );
}
