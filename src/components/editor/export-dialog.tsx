import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Download,
  FolderOpen,
  Loader2,
  ChevronDown,
  Settings2,
  Zap,
} from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "@/stores/settingsStore";
import { ENCODING_PRESETS, HW_ACCEL_TYPES } from "@/lib/constants";

// Export format options
const EXPORT_FORMATS = [
  { value: "mp4", label: "MP4", description: "Most compatible" },
  { value: "webm", label: "WebM", description: "Web optimized" },
  { value: "mkv", label: "MKV", description: "High quality container" },
  { value: "mov", label: "MOV", description: "Apple QuickTime" },
] as const;

// Video codec options
const VIDEO_CODECS = [
  { value: "h264", label: "H.264", description: "Most compatible" },
  { value: "h265", label: "H.265/HEVC", description: "Better compression" },
  { value: "vp9", label: "VP9", description: "Open source, web" },
  { value: "av1", label: "AV1", description: "Best compression (slow)" },
] as const;

// Audio codec options
const AUDIO_CODECS = [
  { value: "aac", label: "AAC", description: "Default" },
  { value: "mp3", label: "MP3", description: "Universal" },
  { value: "opus", label: "Opus", description: "High quality" },
  { value: "flac", label: "FLAC", description: "Lossless" },
] as const;

// Audio bitrate options
const AUDIO_BITRATES = [
  { value: "128", label: "128 kbps", description: "Standard" },
  { value: "192", label: "192 kbps", description: "Good" },
  { value: "256", label: "256 kbps", description: "High" },
  { value: "320", label: "320 kbps", description: "Best" },
] as const;

// Resolution options
const RESOLUTIONS = [
  { value: "original", label: "Original", width: 0, height: 0 },
  { value: "4k", label: "4K UHD", width: 3840, height: 2160 },
  { value: "1440p", label: "1440p QHD", width: 2560, height: 1440 },
  { value: "1080p", label: "1080p Full HD", width: 1920, height: 1080 },
  { value: "720p", label: "720p HD", width: 1280, height: 720 },
  { value: "480p", label: "480p SD", width: 854, height: 480 },
] as const;

// Frame rate options
const FRAME_RATES = [
  { value: "original", label: "Original" },
  { value: "24", label: "24 fps (Film)" },
  { value: "25", label: "25 fps (PAL)" },
  { value: "30", label: "30 fps" },
  { value: "50", label: "50 fps" },
  { value: "60", label: "60 fps" },
] as const;

interface ExportProgress {
  status: "preparing" | "exporting" | "finalizing" | "completed" | "failed" | "cancelled";
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  estimatedTime?: number;
  elapsedTime?: number;
  projectId?: string;
  error?: string | null;
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName?: string;
  onExport: (settings: ExportSettings) => void;
  onCancel: () => void;
  exporting?: boolean;
  exportProgress?: ExportProgress | null;
}

export interface ExportSettings {
  format: string;
  videoCodec: string;
  audioCodec: string;
  audioBitrate: string;
  resolution: string;
  frameRate: string;
  crfQuality: number;
  encodingPreset: string;
  hardwareAcceleration: boolean;
  hardwareAccelerationType: string;
  outputPath: string;
}

export function ExportDialog({
  open,
  onOpenChange,
  projectName = "Untitled",
  onExport,
  onCancel,
  exporting = false,
  exportProgress,
}: ExportDialogProps) {
  const { settings } = useSettingsStore();

  // Export settings state - initialized from store defaults
  const [format, setFormat] = useState("mp4");
  const [videoCodec, setVideoCodec] = useState("h264");
  const [audioCodec, setAudioCodec] = useState("aac");
  const [audioBitrate, setAudioBitrate] = useState("192");
  const [resolution, setResolution] = useState("original");
  const [frameRate, setFrameRate] = useState("original");
  const [crfQuality, setCrfQuality] = useState(23);
  const [encodingPreset, setEncodingPreset] = useState("medium");
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [hardwareAccelerationType, setHardwareAccelerationType] = useState("auto");
  const [outputPath, setOutputPath] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Initialize from settings when dialog opens
  useEffect(() => {
    if (open && settings) {
      setCrfQuality(settings.download?.crfQuality ?? 23);
      setEncodingPreset(settings.download?.encodingPreset ?? "medium");
      setHardwareAcceleration(settings.advanced?.hardwareAcceleration ?? true);
      setHardwareAccelerationType(settings.advanced?.hardwareAccelerationType ?? "auto");
    }
  }, [open, settings]);

  const handleSelectOutputPath = useCallback(async () => {
    const selected = await saveDialog({
      title: "Export Video",
      defaultPath: `${projectName}.${format}`,
      filters: [
        { name: "Video", extensions: [format] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (selected) {
      setOutputPath(selected);
    }
  }, [projectName, format]);

  const handleExport = useCallback(() => {
    onExport({
      format,
      videoCodec,
      audioCodec,
      audioBitrate,
      resolution,
      frameRate,
      crfQuality,
      encodingPreset,
      hardwareAcceleration,
      hardwareAccelerationType,
      outputPath,
    });
  }, [
    format, videoCodec, audioCodec, audioBitrate, resolution, frameRate,
    crfQuality, encodingPreset, hardwareAcceleration, hardwareAccelerationType,
    outputPath, onExport,
  ]);

  // Quality label based on CRF
  const getQualityLabel = (crf: number) => {
    if (crf <= 18) return "Excellent";
    if (crf <= 23) return "Good";
    if (crf <= 28) return "Medium";
    return "Low";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>
            Configure export settings for "{projectName}"
          </DialogDescription>
        </DialogHeader>

        {exporting ? (
          <div className="space-y-4 py-4">
            <div className="text-center">
              <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-primary" />
              <p className="font-medium">
                {exportProgress?.status === "preparing" && "Preparing export..."}
                {exportProgress?.status === "exporting" && "Encoding video..."}
                {exportProgress?.status === "finalizing" && "Finalizing..."}
              </p>
            </div>
            <Progress value={exportProgress?.progress || 0} className="h-2" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{Math.round(exportProgress?.progress || 0)}%</span>
              {exportProgress?.estimatedTime && (
                <span>ETA: {Math.ceil(exportProgress.estimatedTime / 60)}m</span>
              )}
            </div>
            <Button variant="destructive" className="w-full" onClick={onCancel}>
              Cancel Export
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Format & Codec Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_FORMATS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Video Codec</Label>
                <Select value={videoCodec} onValueChange={setVideoCodec}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_CODECS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resolution & Frame Rate Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Resolution</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Frame Rate</Label>
                <Select value={frameRate} onValueChange={setFrameRate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FRAME_RATES.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quality Slider */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Quality (CRF)</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{getQualityLabel(crfQuality)}</Badge>
                  <span className="text-sm font-mono tabular-nums">{crfQuality}</span>
                </div>
              </div>
              <Slider
                value={[crfQuality]}
                onValueChange={(v) => setCrfQuality(v[0] ?? 23)}
                min={18}
                max={28}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Best Quality</span>
                <span>Smaller File</span>
              </div>
            </div>

            {/* Output Path */}
            <div className="space-y-2">
              <Label>Output Location</Label>
              <div className="flex gap-2">
                <Input
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="Select output file..."
                  className="flex-1 font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={handleSelectOutputPath}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Advanced Settings Collapsible */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between">
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Advanced Settings
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-2">
                {/* Encoding Preset */}
                <div className="space-y-2">
                  <Label>Encoding Speed</Label>
                  <Select value={encodingPreset} onValueChange={setEncodingPreset}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENCODING_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Slower = better compression at same quality
                  </p>
                </div>

                {/* Hardware Acceleration */}
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Hardware Acceleration</p>
                      <p className="text-xs text-muted-foreground">Use GPU for faster encoding</p>
                    </div>
                  </div>
                  <Switch
                    checked={hardwareAcceleration}
                    onCheckedChange={setHardwareAcceleration}
                  />
                </div>

                {hardwareAcceleration && (
                  <div className="space-y-2 pl-7">
                    <Label>Acceleration Type</Label>
                    <Select value={hardwareAccelerationType} onValueChange={setHardwareAccelerationType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HW_ACCEL_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Audio Settings Row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Audio Codec</Label>
                    <Select value={audioCodec} onValueChange={setAudioCodec}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIO_CODECS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Audio Bitrate</Label>
                    <Select value={audioBitrate} onValueChange={setAudioBitrate}>
                      <SelectTrigger>
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
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {!exporting && (
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!outputPath}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
