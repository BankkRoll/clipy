interface SettingGroupProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingGroup({ title, description, children }: SettingGroupProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </div>
  );
}
