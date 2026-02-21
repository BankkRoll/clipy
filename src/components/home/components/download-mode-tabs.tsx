import { Music, Video } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DownloadModeTabsProps {
  mode: "video" | "audio";
  onModeChange: (mode: "video" | "audio") => void;
}

export function DownloadModeTabs({ mode, onModeChange }: DownloadModeTabsProps) {
  return (
    <Tabs value={mode} onValueChange={(v) => onModeChange(v as "video" | "audio")}>
      <TabsList className="grid w-full max-w-[300px] grid-cols-2">
        <TabsTrigger value="video" className="gap-2">
          <Video className="h-4 w-4" />
          Video
        </TabsTrigger>
        <TabsTrigger value="audio" className="gap-2">
          <Music className="h-4 w-4" />
          Audio Only
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
