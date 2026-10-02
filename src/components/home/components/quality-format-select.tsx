import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VIDEO_FORMATS, AUDIO_FORMATS, AUDIO_BITRATES } from "@/lib/constants";

interface QualityOption {
  readonly value: string;
  readonly label: string;
  readonly badge?: string | null;
}

interface VideoQualityFormatSelectProps {
  mode: "video";
  quality: string;
  format: string;
  availableQualities: readonly QualityOption[];
  onQualityChange: (quality: string) => void;
  onFormatChange: (format: string) => void;
}

interface AudioQualityFormatSelectProps {
  mode: "audio";
  audioFormat: string;
  audioBitrate: string;
  onAudioFormatChange: (format: string) => void;
  onAudioBitrateChange: (bitrate: string) => void;
}

type QualityFormatSelectProps = VideoQualityFormatSelectProps | AudioQualityFormatSelectProps;

/** Quality + container selects in video mode, format + bitrate selects in audio mode. */
export function QualityFormatSelect(props: QualityFormatSelectProps) {
  if (props.mode === "video") {
    return (
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[120px] flex-1">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Quality</Label>
          <Select value={props.quality} onValueChange={props.onQualityChange}>
            <SelectTrigger className="h-9" aria-label="Quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {props.availableQualities.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  <div className="flex items-center gap-2">
                    <span>{q.label}</span>
                    {q.badge && (
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {q.badge}
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[100px] flex-1">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Format</Label>
          <Select value={props.format} onValueChange={props.onFormatChange}>
            <SelectTrigger className="h-9" aria-label="Format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_FORMATS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <div className="min-w-[120px] flex-1">
        <Label className="mb-1.5 block text-xs text-muted-foreground">Audio Format</Label>
        <Select value={props.audioFormat} onValueChange={props.onAudioFormatChange}>
          <SelectTrigger className="h-9" aria-label="Audio format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIO_FORMATS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                <div className="flex flex-col">
                  <span>{f.label}</span>
                  <span className="text-[10px] text-muted-foreground">{f.description}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-[100px] flex-1">
        <Label className="mb-1.5 block text-xs text-muted-foreground">Bitrate</Label>
        <Select value={props.audioBitrate} onValueChange={props.onAudioBitrateChange}>
          <SelectTrigger className="h-9" aria-label="Bitrate">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIO_BITRATES.map((b) => (
              <SelectItem key={b.value} value={b.value}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
