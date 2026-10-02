import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogBody,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertTriangle,
  Download,
  FolderOpen,
  Loader2,
  ChevronDown,
  Settings2,
  Zap,
} from "lucide-react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { ENCODING_PRESETS, HW_ACCEL_TYPES } from "@/lib/constants";
import type { AppSettings } from "@/hooks/useSettings";
import {
  AUDIO_BITRATES,
  AUDIO_CODECS,
  CRF_MAX,
  CRF_MIN,
  EXPORT_FORMATS,
  FRAME_RATES,
  RESOLUTIONS,
  VIDEO_CODECS,
  codecCompatibilityError,
  compatibleAudioCodecs,
  compatibleVideoCodecs,
  exportPrefillFromSettings,
  qualityLabel,
  type ExportDialogSettings,
} from "@/lib/editor/export";

/** Choices made in the export dialog. */
export type ExportSettings = ExportDialogSettings;

interface ExportProgressView {
  status: "preparing" | "exporting" | "finalizing" | "completed" | "failed" | "cancelled";
  progress: number;
  estimatedTime?: number;
}

/** Props for {@link ExportDialog}. */
export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName?: string;
  onExport: (settings: ExportSettings) => void;
  onCancel: () => void;
  exporting?: boolean;
  exportProgress?: ExportProgressView | null;
  /** Backend app settings (from `get_settings`) used to prefill encoder options. */
  settings?: AppSettings | null;
}

/**
 * Export configuration dialog. Encoder defaults come from the user's saved
 * backend settings; format/codec combinations the container cannot hold are
 * disabled and block the export.
 */
export function ExportDialog({
  open,
  onOpenChange,
  projectName = "Untitled",
  onExport,
  onCancel,
  exporting = false,
  exportProgress,
  settings = null,
}: ExportDialogProps) {
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

  useEffect(() => {
    if (!open) return;
    const prefill = exportPrefillFromSettings(settings);
    setCrfQuality(prefill.crfQuality);
    setEncodingPreset(prefill.encodingPreset);
    setHardwareAcceleration(prefill.hardwareAcceleration);
    setHardwareAccelerationType(prefill.hardwareAccelerationType);
    if (prefill.videoCodec) setVideoCodec(prefill.videoCodec);
  }, [open, settings]);

  const handleFormatChange = (next: string) => {
    setFormat(next);
    const videoOk = compatibleVideoCodecs(next);
    const audioOk = compatibleAudioCodecs(next);
    if (!videoOk.includes(videoCodec)) setVideoCodec(videoOk[0]!);
    if (!audioOk.includes(audioCodec)) setAudioCodec(audioOk[0]!);
  };

  const compatibilityError = codecCompatibilityError(format, videoCodec, audioCodec);

  const handleSelectOutputPath = useCallback(async () => {
    const selected = await saveDialog({
      title: "Export Video",
      defaultPath: `${projectName}.${format}`,
      filters: [
        { name: "Video", extensions: [format] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (selected) setOutputPath(selected);
  }, [projectName, format]);

  const handleExport = () => {
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
  };

  const videoAllowed = compatibleVideoCodecs(format);
  const audioAllowed = compatibleAudioCodecs(format);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export Video</DialogTitle>
          <DialogDescription>Configure export settings for "{projectName}"</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {exporting ? (
            <div className="space-y-4">
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
                {exportProgress?.estimatedTime ? (
                  <span>ETA: {Math.ceil(exportProgress.estimatedTime / 60)}m</span>
                ) : null}
              </div>
              <Button variant="destructive" className="w-full" onClick={onCancel}>
                Cancel Export
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Format</Label>
                  <Select value={format} onValueChange={handleFormatChange}>
                    <SelectTrigger aria-label="Format">
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
                    <SelectTrigger aria-label="Video codec">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_CODECS.map((c) => (
                        <SelectItem
                          key={c.value}
                          value={c.value}
                          disabled={!videoAllowed.includes(c.value)}
                        >
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {compatibilityError && (
                <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
                  <AlertTriangle className="h-4 w-4" />
                  {compatibilityError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Resolution</Label>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger aria-label="Resolution">
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
                    <SelectTrigger aria-label="Frame rate">
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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Quality (CRF)</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{qualityLabel(crfQuality)}</Badge>
                    <span className="font-mono text-sm tabular-nums" data-testid="crf-value">
                      {crfQuality}
                    </span>
                  </div>
                </div>
                <Slider
                  aria-label="Quality"
                  value={[crfQuality]}
                  onValueChange={(v) => setCrfQuality(v[0] ?? 23)}
                  min={CRF_MIN}
                  max={CRF_MAX}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Best Quality</span>
                  <span>Smaller File</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Output Location</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label="Output location"
                    value={outputPath}
                    onChange={(e) => setOutputPath(e.target.value)}
                    placeholder="Select output file..."
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Browse for output file"
                    onClick={() => void handleSelectOutputPath()}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Advanced Settings
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Encoding Speed</Label>
                    <Select value={encodingPreset} onValueChange={setEncodingPreset}>
                      <SelectTrigger aria-label="Encoding speed">
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

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <Zap className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Hardware Acceleration</p>
                        <p className="text-xs text-muted-foreground">Use GPU for faster encoding</p>
                      </div>
                    </div>
                    <Switch
                      aria-label="Hardware acceleration"
                      checked={hardwareAcceleration}
                      onCheckedChange={setHardwareAcceleration}
                    />
                  </div>

                  {hardwareAcceleration && (
                    <div className="space-y-2 pl-7">
                      <Label>Acceleration Type</Label>
                      <Select
                        value={hardwareAccelerationType}
                        onValueChange={setHardwareAccelerationType}
                      >
                        <SelectTrigger aria-label="Acceleration type">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Audio Codec</Label>
                      <Select value={audioCodec} onValueChange={setAudioCodec}>
                        <SelectTrigger aria-label="Audio codec">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIO_CODECS.map((c) => (
                            <SelectItem
                              key={c.value}
                              value={c.value}
                              disabled={!audioAllowed.includes(c.value)}
                            >
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Audio Bitrate</Label>
                      <Select value={audioBitrate} onValueChange={setAudioBitrate}>
                        <SelectTrigger aria-label="Audio bitrate">
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
        </DialogBody>

        {!exporting && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!outputPath || compatibilityError !== null}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
