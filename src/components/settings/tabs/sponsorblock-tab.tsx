import { Switch } from "@/components/ui/switch";
import { SettingGroup } from "../components/setting-group";
import { SettingItem } from "../components/setting-item";
import { CategoryPill } from "../components/category-pill";
import { SPONSORBLOCK_CATEGORIES } from "@/types/download";
import type { AppSettings } from "@/hooks/useSettings";

interface SponsorBlockTabProps {
  settings: AppSettings;
  onUpdateSetting: (path: string, value: unknown) => void;
}

export function SponsorBlockTab({ settings, onUpdateSetting }: SponsorBlockTabProps) {
  return (
    <div className="space-y-6">
      <SettingGroup
        title="SponsorBlock Integration"
        description="Skip sponsored segments and other non-content sections"
      >
        <SettingItem
          label="Enable SponsorBlock"
          description="Remove marked segments from downloaded videos"
        >
          <Switch
            checked={settings.download.sponsorBlock || false}
            onCheckedChange={(v) => onUpdateSetting("download.sponsorBlock", v)}
          />
        </SettingItem>
      </SettingGroup>

      {settings.download.sponsorBlock && (
        <SettingGroup
          title="Segment Categories"
          description="Select which types of segments to skip"
        >
          <div className="grid grid-cols-2 gap-2">
            {SPONSORBLOCK_CATEGORIES.map((cat) => {
              const isSelected = (settings.download.sponsorBlockCategories || ["sponsor"]).includes(cat.value);
              return (
                <CategoryPill
                  key={cat.value}
                  label={cat.label}
                  description={cat.description}
                  selected={isSelected}
                  onClick={() => {
                    const current = settings.download.sponsorBlockCategories || ["sponsor"];
                    const updated = isSelected
                      ? current.filter((c: string) => c !== cat.value)
                      : [...current, cat.value];
                    onUpdateSetting("download.sponsorBlockCategories", updated);
                  }}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Data provided by the SponsorBlock community. Selected segments will be
            automatically removed from downloaded videos.
          </p>
        </SettingGroup>
      )}

      <SettingGroup title="Chapter Splitting" description="Split videos by chapter markers">
        <SettingItem
          label="Split by chapters"
          description="Create separate files for each video chapter"
          hint="Each chapter becomes its own file with the chapter title"
        >
          <Switch
            checked={settings.download.splitByChapters || false}
            onCheckedChange={(v) => onUpdateSetting("download.splitByChapters", v)}
          />
        </SettingItem>
      </SettingGroup>
    </div>
  );
}
