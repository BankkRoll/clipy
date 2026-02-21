import { useState, useEffect, useCallback } from "react";
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
import { useBinaryStatus, useFileSystem } from "@/hooks";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import {
  VIDEO_QUALITIES,
  VIDEO_FORMATS,
  ENCODING_PRESETS,
} from "@/lib/constants";
import { SUBTITLE_LANGUAGES } from "@/types/download";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface SetupWizardProps {
  onComplete: () => void;
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
  { value: "chrome", label: "Chrome" },
  { value: "firefox", label: "Firefox" },
  { value: "edge", label: "Edge" },
  { value: "brave", label: "Brave" },
] as const;

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>("welcome");
  const [isInstalling, setIsInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const { status: binaryStatus, installFfmpeg, installYtdlp, refresh: refreshBinaries } = useBinaryStatus();
  const { getDefaultDownloadPath } = useFileSystem();
  const { updateDownloadSettings, updateAdvancedSettings, settings } = useSettingsStore();
  const completeOnboarding = useUIStore((state) => state.completeOnboarding);

  // Basic settings
  const [downloadPath, setDownloadPath] = useState(settings?.download?.downloadPath || "");
  const [defaultQuality, setDefaultQuality] = useState(settings?.download?.defaultQuality || "1080");
  const [defaultFormat, setDefaultFormat] = useState(settings?.download?.defaultFormat || "mp4");

  // Preference settings
  const [embedThumbnail, setEmbedThumbnail] = useState(settings?.download?.embedThumbnail ?? true);
  const [embedMetadata, setEmbedMetadata] = useState(settings?.download?.embedMetadata ?? true);
  const [createChannelSubfolder, setCreateChannelSubfolder] = useState(
    settings?.download?.createChannelSubfolder ?? false
  );
  const [downloadSubtitles, setDownloadSubtitles] = useState(settings?.download?.downloadSubtitles ?? false);
  const [subtitleLanguage, setSubtitleLanguage] = useState(settings?.download?.subtitleLanguage || "en");

  // Advanced settings
  const [cookiesFromBrowser, setCookiesFromBrowser] = useState(settings?.download?.cookiesFromBrowser || "none");
  const [hardwareAcceleration, setHardwareAcceleration] = useState(settings?.advanced?.hardwareAcceleration ?? true);
  const [crfQuality, setCrfQuality] = useState(settings?.download?.crfQuality ?? 23);
  const [encodingPreset, setEncodingPreset] = useState(settings?.download?.encodingPreset || "medium");

  // Get default download path on mount
  useEffect(() => {
    if (!downloadPath) {
      getDefaultDownloadPath().then(setDownloadPath).catch((err) =>
        logger.error("SetupWizard", "Failed to get default path:", err)
      );
    }
  }, [downloadPath, getDefaultDownloadPath]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleInstallBinaries = useCallback(async () => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      if (!binaryStatus?.ffmpegInstalled) {
        await installFfmpeg();
      }
      if (!binaryStatus?.ytdlpInstalled) {
        await installYtdlp();
      }
      await refreshBinaries();
      setCurrentStep("basics");
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      setIsInstalling(false);
    }
  }, [binaryStatus, installFfmpeg, installYtdlp, refreshBinaries]);

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
    try {
      // Save all settings to Tauri backend
      const settingsToSave = [
        { key: "download.downloadPath", value: downloadPath },
        { key: "download.defaultQuality", value: defaultQuality },
        { key: "download.defaultFormat", value: defaultFormat },
        { key: "download.embedThumbnail", value: embedThumbnail },
        { key: "download.embedMetadata", value: embedMetadata },
        { key: "download.createChannelSubfolder", value: createChannelSubfolder },
        { key: "download.downloadSubtitles", value: downloadSubtitles },
        { key: "download.subtitleLanguage", value: subtitleLanguage },
        { key: "download.cookiesFromBrowser", value: cookiesFromBrowser === "none" ? "" : cookiesFromBrowser },
        { key: "download.crfQuality", value: crfQuality },
        { key: "download.encodingPreset", value: encodingPreset },
        { key: "advanced.hardwareAcceleration", value: hardwareAcceleration },
      ];

      // Save each setting to Tauri backend
      for (const { key, value } of settingsToSave) {
        await invoke("update_setting", { key, value });
      }

      // Also update Zustand store for immediate UI sync
      updateDownloadSettings({
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
      });

      updateAdvancedSettings({
        hardwareAcceleration,
      });

      logger.info("SetupWizard", "All settings saved successfully");
    } catch (err) {
      logger.error("SetupWizard", "Failed to save settings:", err);
    }

    completeOnboarding();
    onComplete();
  }, [
    downloadPath, defaultQuality, defaultFormat, embedThumbnail, embedMetadata,
    createChannelSubfolder, downloadSubtitles, subtitleLanguage, cookiesFromBrowser,
    crfQuality, encodingPreset, hardwareAcceleration, updateDownloadSettings,
    updateAdvancedSettings, completeOnboarding, onComplete,
  ]);

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    const nextStep = STEPS[nextIndex];
    if (nextStep) {
      setCurrentStep(nextStep.key);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    const prevStep = STEPS[prevIndex];
    if (prevStep) {
      setCurrentStep(prevStep.key);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return (
          <div className="space-y-8">
            <div className="text-center space-y-3">
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

      case "binaries":
        const allInstalled = binaryStatus?.ffmpegInstalled && binaryStatus?.ytdlpInstalled;
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
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
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-4",
                    binary.installed
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-border"
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
                  <span className="text-xs text-muted-foreground font-mono">
                    {binary.installed ? binary.version || "Installed" : binary.size}
                  </span>
                </div>
              ))}
            </div>

            {installError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {installError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              {allInstalled ? (
                <Button className="flex-1" onClick={goNext}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  onClick={handleInstallBinaries}
                  disabled={isInstalling}
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    "Download & Install"
                  )}
                </Button>
              )}
            </div>
          </div>
        );

      case "basics":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Basic Settings</h2>
              <p className="text-sm text-muted-foreground">
                Where and how to save your downloads
              </p>
            </div>

            <div className="space-y-5">
              {/* Download Location */}
              <div className="space-y-2">
                <Label>Download Location</Label>
                <div className="flex gap-2">
                  <Input
                    value={downloadPath}
                    onChange={(e) => setDownloadPath(e.target.value)}
                    placeholder="Select a folder..."
                    className="flex-1 font-mono text-sm"
                  />
                  <Button variant="outline" size="icon" onClick={handleBrowseFolder}>
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
                      <span className="font-medium">{q.label.replace(/p$/, '')}</span>
                      {q.badge && (
                        <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">
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
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Preferences</h2>
              <p className="text-sm text-muted-foreground">
                Customize your download experience
              </p>
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
                  className="flex items-center justify-between py-3 border-b border-border/50 last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">{pref.label}</p>
                    <p className="text-xs text-muted-foreground">{pref.desc}</p>
                  </div>
                  <Switch checked={pref.checked} onCheckedChange={pref.onChange} />
                </div>
              ))}
            </div>

            {downloadSubtitles && (
              <div className="flex items-center justify-between pt-2">
                <Label className="text-sm">Subtitle Language</Label>
                <Select value={subtitleLanguage} onValueChange={setSubtitleLanguage}>
                  <SelectTrigger className="w-[140px] h-9">
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
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold">Advanced Options</h2>
              <p className="text-sm text-muted-foreground">
                Fine-tune performance and access
              </p>
            </div>

            <div className="space-y-4">
              {/* Hardware Acceleration */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Hardware Acceleration</p>
                  <p className="text-xs text-muted-foreground">Use GPU for faster encoding</p>
                </div>
                <Switch checked={hardwareAcceleration} onCheckedChange={setHardwareAcceleration} />
              </div>

              {/* Browser Cookies */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-sm">Browser Cookies</p>
                  <p className="text-xs text-muted-foreground">For age-restricted videos</p>
                </div>
                <Select value={cookiesFromBrowser} onValueChange={setCookiesFromBrowser}>
                  <SelectTrigger className="w-[120px] h-9">
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
                  <p className="font-medium text-sm">Encoding Speed</p>
                  <p className="text-xs text-muted-foreground">Speed vs quality tradeoff</p>
                </div>
                <Select value={encodingPreset} onValueChange={setEncodingPreset}>
                  <SelectTrigger className="w-[120px] h-9">
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
                    <p className="font-medium text-sm">Quality Level (CRF)</p>
                    <p className="text-xs text-muted-foreground">Lower = better quality, larger files</p>
                  </div>
                  <span className="text-sm font-mono tabular-nums">{crfQuality}</span>
                </div>
                <Slider
                  value={[crfQuality]}
                  onValueChange={(values) => setCrfQuality(values[0] ?? 23)}
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
                <p className="text-sm text-muted-foreground mt-1">
                  Clipy is ready. Start by pasting a video URL.
                </p>
              </div>
            </div>

            <div className="text-left space-y-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
              <p className="font-medium text-foreground">Quick Tips</p>
              <ul className="space-y-1.5">
                <li>• Press <kbd className="mx-0.5 rounded bg-muted px-1.5 py-0.5 text-xs font-mono">Ctrl+K</kbd> for command palette</li>
                <li>• Paste URLs directly on the home screen</li>
                <li>• Drag videos from library to editor</li>
                <li>• All settings can be changed anytime</li>
              </ul>
            </div>

            <Button size="lg" className="w-full" onClick={handleComplete}>
              Start Using Clipy
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
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
        <div className="rounded-xl border bg-card p-6">
          {renderStep()}
        </div>
      </div>
    </div>
  );
}

export default SetupWizard;
