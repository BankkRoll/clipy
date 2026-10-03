import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Download,
  FolderOpen,
  CheckCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Check,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useBinaryStatus, useFileSystem, useSettings, type AppSettings } from "@/hooks";
import { useUIStore } from "@/stores/uiStore";
import { VIDEO_QUALITIES, VIDEO_FORMATS, ENCODING_PRESETS } from "@/lib/constants";
import { SUBTITLE_LANGUAGES } from "@/types/download";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

/** Props for {@link SetupWizard}. */
export interface SetupWizardProps {
  /** Called after settings are saved and onboarding is marked complete. */
  onComplete?: () => void;
}

type SetupStep = "welcome" | "binaries" | "basics" | "preferences" | "advanced" | "complete";

const STEPS: { key: SetupStep; label: string }[] = [
  { key: "welcome", label: "Welcome" },
  { key: "binaries", label: "Components" },
  { key: "basics", label: "Basics" },
  { key: "preferences", label: "Preferences" },
  { key: "advanced", label: "Advanced" },
  { key: "complete", label: "Done" },
];

const BROWSERS = [
  { value: "none", label: "None" },
  { value: "firefox", label: "Firefox" },
  { value: "chrome", label: "Chrome" },
  { value: "edge", label: "Edge" },
  { value: "brave", label: "Brave" },
] as const;

/**
 * First-run wizard: installs the required binaries and collects the initial
 * download preferences, then writes them to the backend in one `update_settings`.
 */
export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    status: binaryStatus,
    loading: binaryLoading,
    installFfmpeg,
    installYtdlp,
  } = useBinaryStatus();
  const { getDefaultDownloadPath } = useFileSystem();
  const { settings } = useSettings();
  const completeOnboarding = useUIStore((state) => state.completeOnboarding);

  const [downloadPath, setDownloadPath] = useState("");
  const [defaultQuality, setDefaultQuality] = useState("1080");
  const [defaultFormat, setDefaultFormat] = useState("mp4");

  const [embedThumbnail, setEmbedThumbnail] = useState(true);
  const [embedMetadata, setEmbedMetadata] = useState(true);
  const [createChannelSubfolder, setCreateChannelSubfolder] = useState(false);
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);
  const [subtitleLanguage, setSubtitleLanguage] = useState("en");

  const [cookiesFromBrowser, setCookiesFromBrowser] = useState("none");
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [crfQuality, setCrfQuality] = useState(23);
  const [encodingPreset, setEncodingPreset] = useState("medium");

  // Seed the form from backend settings once they arrive (a factory reset or
  // reinstall may already have values worth keeping).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!settings || seededRef.current) return;
    seededRef.current = true;
    const d = settings.download;
    if (d.downloadPath) setDownloadPath(d.downloadPath);
    setDefaultQuality(d.defaultQuality);
    setDefaultFormat(d.defaultFormat);
    setEmbedThumbnail(d.embedThumbnail);
    setEmbedMetadata(d.embedMetadata);
    setCreateChannelSubfolder(d.createChannelSubfolder);
    setHardwareAcceleration(settings.advanced.hardwareAcceleration);
    // Optional fields may be missing from configs written by older versions.
    setDownloadSubtitles(d.downloadSubtitles ?? false);
    setSubtitleLanguage(d.subtitleLanguage || "en");
    setCookiesFromBrowser(d.cookiesFromBrowser || "none");
    setCrfQuality(d.crfQuality ?? 23);
    setEncodingPreset(d.encodingPreset || "medium");
  }, [settings]);

  // Only on mount: re-running whenever the field is empty would refill it the
  // moment the user clears it to type their own path.
  useEffect(() => {
    getDefaultDownloadPath()
      .then((path) => setDownloadPath((current) => current || path))
      .catch((err) => logger.error("SetupWizard", "Failed to get default path:", err));
  }, [getDefaultDownloadPath]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleInstallBinaries = useCallback(async () => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      if (!binaryStatus?.ffmpegInstalled) await installFfmpeg();
      if (!binaryStatus?.ytdlpInstalled) await installYtdlp();
      setCurrentStep("basics");
    } catch (err) {
      // useBinaryStatus rethrows backend failures as Error.
      setInstallError((err as Error).message);
    } finally {
      setIsInstalling(false);
    }
  }, [binaryStatus, installFfmpeg, installYtdlp]);

  const handleBrowseFolder = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Download Folder",
      });
      if (selected && typeof selected === "string") {
        setDownloadPath(selected);
      }
    } catch (err) {
      logger.error("SetupWizard", "Failed to select folder:", err);
    }
  }, []);

  const handleComplete = useCallback(async () => {
    setIsSaving(true);
    try {
      // Read fresh rather than reuse the seeded copy so nothing written since
      // mount is clobbered by the single update_settings below.
      const current = await invoke<AppSettings>("get_settings");
      const merged: AppSettings = {
        ...current,
        download: {
          ...current.download,
          downloadPath,
          defaultQuality,
          defaultFormat,
          embedThumbnail,
          embedMetadata,
          createChannelSubfolder,
          downloadSubtitles,
          subtitleLanguage,
          cookiesFromBrowser: cookiesFromBrowser === "none" ? "" : cookiesFromBrowser,
          crfQuality,
          encodingPreset,
        },
        advanced: { ...current.advanced, hardwareAcceleration },
      };
      await invoke("update_settings", { settings: merged });
      logger.info("SetupWizard: settings saved");
    } catch (err) {
      logger.error("SetupWizard", "Failed to save settings:", err);
      toast.error("Couldn't save your settings", {
        description: err instanceof Error ? err.message : String(err),
      });
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    completeOnboarding();
    onComplete?.();
  }, [
    downloadPath,
    defaultQuality,
    defaultFormat,
    embedThumbnail,
    embedMetadata,
    createChannelSubfolder,
    downloadSubtitles,
    subtitleLanguage,
    cookiesFromBrowser,
    crfQuality,
    encodingPreset,
    hardwareAcceleration,
    completeOnboarding,
    onComplete,
  ]);

  // The first step has no Back button and the last has no Continue, so the
  // neighbouring step always exists.
  const goNext = () => setCurrentStep(STEPS[currentStepIndex + 1]!.key);
  const goBack = () => setCurrentStep(STEPS[currentStepIndex - 1]!.key);

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return (
          <div className="space-y-8">
            <div className="space-y-3 text-center">
              <h1 className="text-3xl font-bold tracking-tight">Welcome to Clipy</h1>
              <p className="text-muted-foreground">
                Download and edit videos from YouTube and 1000+ sites
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Download videos in up to 4K quality</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>Built-in video editor with timeline</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>100% private — everything runs locally</span>
              </div>
            </div>

            <Button size="lg" className="w-full" onClick={goNext}>
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        );

      case "binaries": {
        const allInstalled = binaryStatus?.ffmpegInstalled && binaryStatus?.ytdlpInstalled;
        const checking = binaryLoading && !binaryStatus;
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">Required Components</h2>
              <p className="text-sm text-muted-foreground">
                Clipy needs these open-source tools to work
              </p>
            </div>

            <div className="space-y-2">
              {[
                {
                  name: "FFmpeg",
                  desc: "Video encoding & processing",
                  size: "~85 MB",
                  installed: binaryStatus?.ffmpegInstalled,
                  version: binaryStatus?.ffmpegVersion,
                },
                {
                  name: "yt-dlp",
                  desc: "Video downloading engine",
                  size: "~12 MB",
                  installed: binaryStatus?.ytdlpInstalled,
                  version: binaryStatus?.ytdlpVersion,
                },
              ].map((binary) => (
                <div
                  key={binary.name}
                  role="group"
                  aria-label={binary.name}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-4",
                    binary.installed ? "border-green-500/30 bg-green-500/5" : "border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {binary.installed ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : isInstalling ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <Download className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{binary.name}</p>
                      <p className="text-xs text-muted-foreground">{binary.desc}</p>
                    </div>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {binary.installed ? binary.version || "Installed" : binary.size}
                  </span>
                </div>
              ))}
            </div>

            {installError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {installError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {checking ? (
                <Button className="flex-1" disabled>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking components...
                </Button>
              ) : allInstalled ? (
                <Button className="flex-1" onClick={goNext}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button className="flex-1" onClick={handleInstallBinaries} disabled={isInstalling}>
                  {isInstalling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : installError ? (
                    "Retry Install"
                  ) : (
                    "Download & Install"
                  )}
                </Button>
              )}
            </div>
            {!allInstalled && !isInstalling && !checking && (
              <div className="space-y-1">
                <Button variant="ghost" size="sm" className="w-full" onClick={goNext}>
                  Skip for now
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  You can install them later from Settings → Advanced. Downloads need both.
                </p>
              </div>
            )}
          </div>
        );
      }

      case "basics":
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">Basic Settings</h2>
              <p className="text-sm text-muted-foreground">Where and how to save your downloads</p>
            </div>

            <div className="space-y-5">
              {/* Download Location */}
              <div className="space-y-2">
                <Label>Download Location</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label="Download location"
                    value={downloadPath}
                    onChange={(e) => setDownloadPath(e.target.value)}
                    placeholder="Select a folder..."
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleBrowseFolder}
                    aria-label="Browse for folder"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Video Quality */}
              <div className="space-y-3">
                <Label>Default Quality</Label>
                <RadioGroup
                  value={defaultQuality}
                  onValueChange={setDefaultQuality}
                  className="grid grid-cols-3 gap-2"
                >
                  {VIDEO_QUALITIES.slice(0, 6).map((q) => (
                    <Label
                      key={q.value}
                      className={cn(
                        "flex cursor-pointer items-center justify-center rounded-lg border p-3 text-center transition-all",
                        defaultQuality === q.value
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      )}
                    >
                      <RadioGroupItem value={q.value} className="sr-only" />
                      <span className="font-medium">{q.label.replace(/p$/, "")}</span>
                      {q.badge && (
                        <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[9px]">
                          {q.badge}
                        </Badge>
                      )}
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Video Format */}
              <div className="space-y-3">
                <Label>Default Format</Label>
                <RadioGroup
                  value={defaultFormat}
                  onValueChange={setDefaultFormat}
                  className="grid grid-cols-3 gap-2"
                >
                  {VIDEO_FORMATS.slice(0, 3).map((f) => (
                    <Label
                      key={f.value}
                      className={cn(
                        "flex cursor-pointer flex-col items-center justify-center rounded-lg border p-3 text-center transition-all",
                        defaultFormat === f.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <RadioGroupItem value={f.value} className="sr-only" />
                      <span className="font-medium">{f.label}</span>
                      <span className="text-[10px] text-muted-foreground">{f.description}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button className="flex-1" onClick={goNext} disabled={!downloadPath}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "preferences":
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">Preferences</h2>
              <p className="text-sm text-muted-foreground">Customize your download experience</p>
            </div>

            <div className="space-y-1">
              {[
                {
                  label: "Embed Thumbnail",
                  desc: "Add video thumbnail as album art",
                  checked: embedThumbnail,
                  onChange: setEmbedThumbnail,
                },
                {
                  label: "Embed Metadata",
                  desc: "Include title, description, channel info",
                  checked: embedMetadata,
                  onChange: setEmbedMetadata,
                },
                {
                  label: "Organize by Channel",
                  desc: "Create subfolders for each channel",
                  checked: createChannelSubfolder,
                  onChange: setCreateChannelSubfolder,
                },
                {
                  label: "Download Subtitles",
                  desc: "Automatically download captions",
                  checked: downloadSubtitles,
                  onChange: setDownloadSubtitles,
                },
              ].map((pref) => (
                <div
                  key={pref.label}
                  className="flex items-center justify-between border-b border-border/50 py-3 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <Switch
                    aria-label={pref.label}
                    checked={pref.checked}
                    onCheckedChange={pref.onChange}
                  />
                </div>
              ))}
            </div>

            {downloadSubtitles && (
              <div className="flex items-center justify-between pt-2">
                <Label className="text-sm">Subtitle Language</Label>
                <Select value={subtitleLanguage} onValueChange={setSubtitleLanguage}>
                  <SelectTrigger className="h-9 w-[140px]" aria-label="Subtitle language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTITLE_LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button className="flex-1" onClick={goNext}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "advanced":
        return (
          <div className="space-y-6">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold">Advanced Options</h2>
              <p className="text-sm text-muted-foreground">Fine-tune performance and access</p>
            </div>

            <div className="space-y-4">
              {/* Hardware Acceleration */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Hardware Acceleration</p>
                  <p className="text-xs text-muted-foreground">Use GPU for faster encoding</p>
                </div>
                <Switch
                  aria-label="Hardware Acceleration"
                  checked={hardwareAcceleration}
                  onCheckedChange={setHardwareAcceleration}
                />
              </div>

              {/* Browser Cookies */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Browser Cookies</p>
                  <p className="text-xs text-muted-foreground">
                    Only for age-restricted videos. Firefox works best
                  </p>
                </div>
                <Select value={cookiesFromBrowser} onValueChange={setCookiesFromBrowser}>
                  <SelectTrigger className="h-9 w-[120px]" aria-label="Browser cookies">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BROWSERS.map((browser) => (
                      <SelectItem key={browser.value} value={browser.value}>
                        {browser.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Encoding Preset */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">Encoding Speed</p>
                  <p className="text-xs text-muted-foreground">Speed vs quality tradeoff</p>
                </div>
                <Select value={encodingPreset} onValueChange={setEncodingPreset}>
                  <SelectTrigger className="h-9 w-[120px]" aria-label="Encoding speed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENCODING_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* CRF Quality */}
              <div className="space-y-3 py-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Quality Level (CRF)</p>
                    <p className="text-xs text-muted-foreground">
                      Lower = better quality, larger files
                    </p>
                  </div>
                  <span className="font-mono text-sm tabular-nums" data-testid="crf-value">
                    {crfQuality}
                  </span>
                </div>
                <Slider
                  value={[crfQuality]}
                  onValueChange={(values) => setCrfQuality(values[0]!)}
                  min={18}
                  max={28}
                  step={1}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Best</span>
                  <span>Balanced</span>
                  <span>Smallest</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button className="flex-1" onClick={goNext}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case "complete":
        return (
          <div className="space-y-6 text-center">
            <div className="space-y-3">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">You're All Set</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Clipy is ready. Start by pasting a video URL.
                </p>
              </div>
            </div>

            <div className="space-y-2 rounded-lg bg-muted/30 p-4 text-left text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Quick Tips</p>
              <ul className="space-y-1.5">
                <li>
                  • Press{" "}
                  <kbd className="mx-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    Ctrl+K
                  </kbd>{" "}
                  for command palette
                </li>
                <li>• Paste URLs directly on the home screen</li>
                <li>• All settings can be changed anytime</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" size="lg" onClick={goBack} disabled={isSaving}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button size="lg" className="flex-1" onClick={handleComplete} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Start Using Clipy
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Progress Header */}
        <div className="mb-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>
            <span className="font-medium">{STEPS[currentStepIndex]?.label}</span>
          </div>
          <Progress value={progress} className="h-1" />

          {/* Step Indicators - Simple dots */}
          <div className="flex justify-center gap-2">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              return (
                <div
                  key={step.key}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    isCompleted && "bg-primary",
                    isCurrent && "bg-primary",
                    !isCompleted && !isCurrent && "bg-muted-foreground/30"
                  )}
                />
              );
            })}
          </div>
        </div>

        {/* Content Card */}
        <div className="rounded-xl border bg-card p-6">{renderStep()}</div>
      </div>
    </div>
  );
}

export default SetupWizard;
