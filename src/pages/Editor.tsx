import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import {
  Film,
  Plus,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
  Save,
  FolderOpen,
  Upload,
  Image,
  Type,
  Layers,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Download,
  X,
  Loader2,
  RotateCcw,
  Copy,
  Music,
  Video,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Clipboard,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useEditorStore } from "@/stores/editorStore";
import { useVideoMetadata, useProject, useExport, useExportOptions } from "@/hooks/useEditor";
import { useLibrary, type LibraryVideo } from "@/hooks/useLibrary";
import { formatDuration, cn, generateId } from "@/lib/utils";
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { FilterType, Clip } from "@/types/editor";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { ExportDialog, type ExportSettings } from "@/components/editor/export-dialog";

// Filter presets
const FILTER_PRESETS = [
  { id: "brightness", name: "Brightness", min: 0, max: 2, default: 1 },
  { id: "contrast", name: "Contrast", min: 0, max: 2, default: 1 },
  { id: "saturation", name: "Saturation", min: 0, max: 2, default: 1 },
  { id: "hue", name: "Hue Shift", min: -180, max: 180, default: 0 },
  { id: "blur", name: "Blur", min: 0, max: 20, default: 0 },
  { id: "sharpen", name: "Sharpen", min: 0, max: 10, default: 0 },
] as const;

// Pixels per second at zoom 1
const PIXELS_PER_SECOND = 50;
// Snap threshold in pixels
const SNAP_THRESHOLD = 10;

export function Editor() {
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const importVideoId = searchParams.get("import");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const playbackIntervalRef = useRef<number | null>(null);

  // Local state
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [activeLeftTab, setActiveLeftTab] = useState<"media" | "library">("library");
  const [activeRightTab, setActiveRightTab] = useState<"properties" | "filters" | "text">(
    "properties"
  );
  const [showExportDialog, setShowExportDialog] = useState(false);

  // Drag state
  const [draggingClip, setDraggingClip] = useState<{
    clipId: string;
    startX: number;
    initialStart: number;
  } | null>(null);
  const [trimming, setTrimming] = useState<{
    clipId: string;
    edge: "start" | "end";
    startX: number;
    initialTime: number;
  } | null>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);

  // Clipboard
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);

  // Video preview state
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const lastVideoSrcRef = useRef<string>("");
  const importedRef = useRef(false);

  // Hooks
  const { videos: libraryVideos, loading: libraryLoading, refresh: refreshLibrary } = useLibrary();
  const { getMetadata } = useVideoMetadata();
  const { loadProject: loadProjectFile, saveProject: saveProjectFile } = useProject();
  const { exporting, progress: exportProgress, startExport, cancelExport } = useExport();
  const { loadOptions: loadExportOptions } = useExportOptions();

  // Editor store
  const {
    project,
    createProject,
    loadProject,
    saveProject,
    setProjectName,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    zoom,
    selectedClipIds,
    selectedTrackId,
    history,
    historyIndex,
    addTrack,
    removeTrack,
    updateTrack,
    addClip,
    updateClip,
    splitClip,
    duplicateClip,
    selectClip,
    selectTrack,
    deleteSelected,
    togglePlay,
    pause,
    seek,
    seekRelative,
    setVolume,
    toggleMute,
    zoomIn,
    zoomOut,
    undo,
    redo,
    clearSelection,
  } = useEditorStore();

  // Calculate timeline width
  const timelineWidth = useMemo(() => {
    return Math.max(duration * PIXELS_PER_SECOND * zoom, 800);
  }, [duration, zoom]);

  // Get current clip at playhead position
  const currentClip = useMemo(() => {
    if (!project) return null;
    for (const track of project.tracks) {
      if (track.type === "video" && !track.muted) {
        const clip = track.clips.find((c) => currentTime >= c.startTime && currentTime < c.endTime);
        if (clip) return clip;
      }
    }
    return null;
  }, [project, currentTime]);

  // Get current audio clip at playhead
  const currentAudioClip = useMemo(() => {
    if (!project) return null;
    for (const track of project.tracks) {
      if (track.type === "audio" && !track.muted) {
        const clip = track.clips.find((c) => currentTime >= c.startTime && currentTime < c.endTime);
        if (clip) return clip;
      }
    }
    return null;
  }, [project, currentTime]);

  // Calculate video time within clip
  const getVideoTimeForClip = useCallback((clip: Clip, time: number) => {
    const clipProgress = time - clip.startTime;
    const sourceTime = clip.sourceStart + clipProgress * (clip.properties.speed || 1);
    return Math.min(sourceTime, clip.sourceEnd);
  }, []);

  // Get selected clip
  const selectedClip = useMemo(() => {
    if (!project || selectedClipIds.length !== 1) return null;
    for (const track of project.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipIds[0]);
      if (clip) return clip;
    }
    return null;
  }, [project, selectedClipIds]);

  // Initialize project
  useEffect(() => {
    if (!project && !projectId) {
      createProject("Untitled Project");
    }
    loadExportOptions();
  }, [project, projectId, createProject, loadExportOptions]);

  // Refresh library on mount
  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Reset import ref when import ID changes
  useEffect(() => {
    if (!importVideoId) {
      importedRef.current = false;
    }
  }, [importVideoId]);

  // Sync video element with current clip and time
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      setVideoError(null);
      return;
    }

    if (!currentClip) {
      // Clear video when no clip
      if (video.src) {
        video.src = "";
        lastVideoSrcRef.current = "";
      }
      setVideoError(null);
      setVideoLoading(false);
      return;
    }

    const videoSrc = convertFileSrc(currentClip.sourcePath);
    const targetTime = getVideoTimeForClip(currentClip, currentTime);

    // Only update source if it actually changed (prevents memory leak)
    if (lastVideoSrcRef.current !== videoSrc) {
      logger.debug("Editor", "Loading new video source:", currentClip.sourcePath);
      logger.debug("Editor", "Converted URL:", videoSrc);
      lastVideoSrcRef.current = videoSrc;
      setVideoLoading(true);
      setVideoError(null);
      video.src = videoSrc;
      video.load();
    }

    // Set video time when not playing
    if (!isPlaying && Math.abs(video.currentTime - targetTime) > 0.1) {
      video.currentTime = targetTime;
    }

    // Set volume
    video.volume = isMuted ? 0 : volume * (currentClip.properties.volume || 1);
    video.muted = isMuted;
    video.playbackRate = currentClip.properties.speed || 1;
  }, [currentClip, currentTime, isPlaying, isMuted, volume, getVideoTimeForClip]);

  // Handle playback loop
  useEffect(() => {
    if (isPlaying) {
      const video = videoRef.current;
      if (video && currentClip) {
        video.play().catch(() => {});
      }

      // Use interval for smooth playback tracking
      let lastTime = performance.now();
      const tick = () => {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        const state = useEditorStore.getState();
        const newTime = state.currentTime + delta;

        if (newTime >= state.duration) {
          pause();
          seek(0);
        } else {
          seek(newTime);
        }

        if (state.isPlaying) {
          playbackIntervalRef.current = requestAnimationFrame(tick);
        }
      };

      playbackIntervalRef.current = requestAnimationFrame(tick);

      return () => {
        if (playbackIntervalRef.current) {
          cancelAnimationFrame(playbackIntervalRef.current);
        }
      };
    } else {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  }, [isPlaying, currentClip, pause, seek]);

  // Convert pixel position to time
  const pixelToTime = useCallback(
    (px: number) => {
      return px / (PIXELS_PER_SECOND * zoom);
    },
    [zoom]
  );

  // Convert time to pixel position
  const timeToPixel = useCallback(
    (time: number) => {
      return time * PIXELS_PER_SECOND * zoom;
    },
    [zoom]
  );

  // Snap time to grid or other clips
  const snapTime = useCallback(
    (time: number, excludeClipId?: string) => {
      if (!project) return time;

      const snapPoints: number[] = [0, duration];

      // Add clip edges as snap points
      project.tracks.forEach((track) => {
        track.clips.forEach((clip) => {
          if (clip.id !== excludeClipId) {
            snapPoints.push(clip.startTime, clip.endTime);
          }
        });
      });

      // Find nearest snap point
      const snapPixels = SNAP_THRESHOLD / (PIXELS_PER_SECOND * zoom);
      for (const point of snapPoints) {
        if (Math.abs(time - point) < snapPixels) {
          return point;
        }
      }

      return time;
    },
    [project, duration, zoom]
  );

  // Generate time ruler markers
  const timeRulerMarkers = useMemo(() => {
    const markers: { time: number; label: string; major: boolean }[] = [];
    const visibleDuration = Math.max(duration, 60);

    // Determine interval based on zoom
    let interval = 1;
    if (zoom < 0.3) interval = 10;
    else if (zoom < 0.5) interval = 5;
    else if (zoom < 1) interval = 2;
    else if (zoom > 2) interval = 0.5;
    else if (zoom > 4) interval = 0.25;

    for (let t = 0; t <= visibleDuration; t += interval) {
      const isMajor = t % (interval * 2) === 0 || interval >= 5;
      markers.push({
        time: t,
        label: formatDuration(t),
        major: isMajor,
      });
    }

    return markers;
  }, [duration, zoom]);

  // Handlers
  const handleAddMediaToTimeline = useCallback(
    (video: LibraryVideo) => {
      if (!project) {
        toast.error("No project loaded");
        return;
      }

      try {
        const clipDuration = video.duration || 60;

        let videoTrack = project.tracks.find((t) => t.type === "video");
        let trackId = videoTrack?.id;

        if (!trackId) {
          trackId = addTrack("video");
        }

        const existingClips = project.tracks.flatMap((t) => t.clips);
        const startTime =
          existingClips.length > 0 ? Math.max(...existingClips.map((c) => c.endTime)) : 0;

        addClip(trackId, {
          type: "video",
          name: video.title,
          startTime,
          endTime: startTime + clipDuration,
          sourceStart: 0,
          sourceEnd: clipDuration,
          sourcePath: video.filePath,
          thumbnails: [],
          properties: {
            volume: 1,
            opacity: 1,
            speed: 1,
            fadeIn: 0,
            fadeOut: 0,
            filters: [],
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
          },
        });

        toast.success(`Added "${video.title}" to timeline`);
      } catch (err) {
        logger.error("Editor", "Failed to add media:", err);
        toast.error(`Failed to add media: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    },
    [project, addTrack, addClip]
  );

  // Handle import from library (use ref to prevent infinite loop)
  useEffect(() => {
    if (importVideoId && project && libraryVideos.length > 0 && !importedRef.current) {
      const video = libraryVideos.find((v) => v.id === importVideoId);
      if (video) {
        importedRef.current = true;
        handleAddMediaToTimeline(video);
        navigate(`/editor/${project.id}`, { replace: true });
      }
    }
  }, [importVideoId, project, libraryVideos, navigate, handleAddMediaToTimeline]);

  const handleImportFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: "Media Files",
            extensions: [
              "mp4",
              "mkv",
              "avi",
              "mov",
              "webm",
              "mp3",
              "wav",
              "ogg",
              "jpg",
              "jpeg",
              "png",
              "gif",
            ],
          },
          { name: "Video", extensions: ["mp4", "mkv", "avi", "mov", "webm"] },
          { name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a"] },
          { name: "Images", extensions: ["jpg", "jpeg", "png", "gif", "webp"] },
        ],
      });

      if (!selected || !project) return;

      const files = Array.isArray(selected) ? selected : [selected];
      let addedCount = 0;

      for (const filePath of files) {
        try {
          const ext = filePath.split(".").pop()?.toLowerCase() || "";
          const isVideo = ["mp4", "mkv", "avi", "mov", "webm"].includes(ext);
          const isAudio = ["mp3", "wav", "ogg", "m4a"].includes(ext);
          const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext);

          let clipDuration = 60;
          if (isVideo || isAudio) {
            try {
              const metadata = await getMetadata(filePath);
              clipDuration = metadata.duration || 60;
            } catch {
              logger.warn("Editor", "Could not get metadata for:", filePath);
            }
          } else if (isImage) {
            clipDuration = 5;
          }

          const trackType = isVideo ? "video" : isAudio ? "audio" : "video";
          let track = project.tracks.find((t) => t.type === trackType);
          let trackId = track?.id;

          if (!trackId) {
            trackId = addTrack(trackType);
          }

          const existingClips = project.tracks.flatMap((t) => t.clips);
          const startTime =
            existingClips.length > 0 ? Math.max(...existingClips.map((c) => c.endTime)) : 0;

          addClip(trackId, {
            type: isImage ? "image" : isAudio ? "audio" : "video",
            name: filePath.split(/[/\\]/).pop() || "Media",
            startTime,
            endTime: startTime + clipDuration,
            sourceStart: 0,
            sourceEnd: clipDuration,
            sourcePath: filePath,
            thumbnails: [],
            properties: {
              volume: isAudio ? 1 : 0,
              opacity: 1,
              speed: 1,
              fadeIn: 0,
              fadeOut: 0,
              filters: [],
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            },
          });
          addedCount++;
        } catch (err) {
          logger.error("Editor", "Failed to add file:", filePath, err);
          toast.error(`Failed to add: ${filePath.split(/[/\\]/).pop()}`);
        }
      }

      if (addedCount > 0) {
        toast.success(`Added ${addedCount} file(s) to timeline`);
      }
    } catch (err) {
      logger.error("Editor", "Import failed:", err);
      toast.error("Failed to import files");
    }
  }, [project, getMetadata, addTrack, addClip]);

  const handleSaveProject = useCallback(async () => {
    if (!project) return;

    try {
      const path = await save({
        filters: [{ name: "Clipy Project", extensions: ["clipy"] }],
        defaultPath: `${project.name}.clipy`,
      });

      if (path) {
        saveProject();
        await saveProjectFile(path);
        toast.success("Project saved");
      }
    } catch (err) {
      logger.error("Editor", "Save failed:", err);
      toast.error("Failed to save project");
    }
  }, [project, saveProject, saveProjectFile]);

  const handleOpenProject = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "Clipy Project", extensions: ["clipy"] }],
      });

      if (path && typeof path === "string") {
        const loaded = await loadProjectFile(path);
        if (loaded) {
          loadProject({
            id: loaded.id,
            name: loaded.name,
            createdAt: loaded.createdAt,
            modifiedAt: loaded.modifiedAt,
            duration: loaded.duration,
            tracks: loaded.tracks.map((t) => ({
              id: t.id,
              type: t.trackType,
              name: t.name,
              clips: t.clips.map((c) => ({
                id: c.id,
                trackId: c.trackId,
                type: c.clipType as "video" | "audio" | "text" | "image",
                name: c.name,
                startTime: c.startTime,
                endTime: c.endTime,
                sourceStart: c.sourceStart,
                sourceEnd: c.sourceEnd,
                sourcePath: c.sourcePath,
                thumbnails: c.thumbnails,
                properties: {
                  volume: c.properties.volume,
                  opacity: c.properties.opacity,
                  speed: c.properties.speed,
                  fadeIn: c.properties.fadeIn,
                  fadeOut: c.properties.fadeOut,
                  filters: c.properties.filters.map((f) => ({
                    id: f.id,
                    type: f.filterType as FilterType,
                    enabled: f.enabled,
                    params: f.params as Record<string, number | string | boolean>,
                  })),
                  transform: c.properties.transform,
                  ...(c.properties.text ? { text: c.properties.text } : {}),
                },
              })),
              muted: t.muted,
              locked: t.locked,
              volume: t.volume,
              height: t.height,
            })),
            settings: loaded.settings,
          });
          toast.success("Project loaded");
        }
      }
    } catch (err) {
      logger.error("Editor", "Load failed:", err);
      toast.error("Failed to load project");
    }
  }, [loadProjectFile, loadProject]);

  const handleExport = useCallback(async (settings: ExportSettings) => {
    if (!project || !settings.outputPath) {
      toast.error("Please select an output location");
      return;
    }

    try {
      const backendProject = {
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt,
        duration: project.duration,
        tracks: project.tracks.map((t) => ({
          id: t.id,
          trackType: t.type,
          name: t.name,
          clips: t.clips.map((c) => ({
            id: c.id,
            trackId: c.trackId,
            clipType: c.type,
            name: c.name,
            startTime: c.startTime,
            endTime: c.endTime,
            sourceStart: c.sourceStart,
            sourceEnd: c.sourceEnd,
            sourcePath: c.sourcePath,
            thumbnails: c.thumbnails,
            properties: {
              volume: c.properties.volume,
              opacity: c.properties.opacity,
              speed: c.properties.speed,
              fadeIn: c.properties.fadeIn,
              fadeOut: c.properties.fadeOut,
              filters: c.properties.filters.map((f) => ({
                id: f.id,
                filterType: f.type,
                enabled: f.enabled,
                params: f.params,
              })),
              transform: c.properties.transform,
              text: c.properties.text || null,
            },
          })),
          muted: t.muted,
          locked: t.locked,
          volume: t.volume,
          height: t.height,
        })),
        settings: project.settings,
      };

      // Map CRF to bitrate (lower CRF = higher quality = higher bitrate)
      const crfToBitrate = (crf: number) => {
        if (crf <= 18) return 20000;
        if (crf <= 20) return 15000;
        if (crf <= 23) return 10000;
        if (crf <= 26) return 6000;
        return 4000;
      };

      await startExport(backendProject, {
        format: settings.format,
        quality: settings.encodingPreset,
        resolution: settings.resolution,
        fps: settings.frameRate === "original" ? project.settings.fps : parseInt(settings.frameRate),
        videoBitrate: crfToBitrate(settings.crfQuality),
        audioBitrate: parseInt(settings.audioBitrate),
        useHardwareAcceleration: settings.hardwareAcceleration,
        outputPath: settings.outputPath,
        videoCodec: settings.videoCodec,
        audioCodec: settings.audioCodec,
        crfQuality: settings.crfQuality,
        encodingPreset: settings.encodingPreset,
        hardwareAccelerationType: settings.hardwareAccelerationType,
      });
    } catch (err) {
      logger.error("Editor", "Export failed:", err);
      toast.error("Export failed");
    }
  }, [project, startExport]);

  const handleSplitAtPlayhead = useCallback(() => {
    const clipId = selectedClipIds[0];
    if (selectedClipIds.length === 1 && clipId) {
      splitClip(clipId, currentTime);
      toast.success("Clip split");
    }
  }, [selectedClipIds, splitClip, currentTime]);

  const handleDuplicateClip = useCallback(() => {
    const clipId = selectedClipIds[0];
    if (selectedClipIds.length === 1 && clipId) {
      duplicateClip(clipId);
      toast.success("Clip duplicated");
    }
  }, [selectedClipIds, duplicateClip]);

  const handleDeleteSelected = useCallback(async () => {
    if (selectedClipIds.length > 0) {
      const confirmed = await ask(`Delete ${selectedClipIds.length} clip(s)?`, {
        title: "Delete Clips",
        kind: "warning",
      });

      if (confirmed) {
        deleteSelected();
        toast.success(`Deleted ${selectedClipIds.length} clip(s)`);
      }
    }
  }, [selectedClipIds, deleteSelected]);

  const handleCopyClip = useCallback(() => {
    if (selectedClip) {
      setClipboardClip({ ...selectedClip });
      toast.success("Clip copied");
    }
  }, [selectedClip]);

  const handlePasteClip = useCallback(() => {
    if (!clipboardClip || !project) return;

    const trackId =
      selectedTrackId || project.tracks.find((t) => t.type === clipboardClip.type)?.id;
    if (!trackId) {
      toast.error("No suitable track found");
      return;
    }

    const clipDuration = clipboardClip.endTime - clipboardClip.startTime;
    addClip(trackId, {
      ...clipboardClip,
      name: `${clipboardClip.name} (pasted)`,
      startTime: currentTime,
      endTime: currentTime + clipDuration,
    });
    toast.success("Clip pasted");
  }, [clipboardClip, project, selectedTrackId, currentTime, addClip]);

  const handleCutClip = useCallback(() => {
    if (selectedClip) {
      setClipboardClip({ ...selectedClip });
      deleteSelected();
      toast.success("Clip cut");
    }
  }, [selectedClip, deleteSelected]);

  const handleAddTextTrack = useCallback(() => {
    if (!project) return;

    // Add a text track
    const trackId = addTrack("text");

    // Add a default text clip to the new track
    const textClip: Omit<Clip, "id" | "trackId"> = {
      type: "text",
      name: "New Text",
      startTime: currentTime,
      endTime: currentTime + 5, // 5 second default duration
      sourceStart: 0,
      sourceEnd: 5,
      sourcePath: "",
      thumbnails: [],
      properties: {
        volume: 1,
        opacity: 1,
        speed: 1,
        fadeIn: 0,
        fadeOut: 0,
        filters: [],
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        text: {
          content: "Enter your text here",
          fontFamily: "Arial",
          fontSize: 48,
          fontWeight: 400,
          color: "#ffffff",
          backgroundColor: "transparent",
          align: "center",
          verticalAlign: "middle",
        },
      },
    };

    const clipId = addClip(trackId, textClip);
    selectClip(clipId, false);
    setActiveRightTab("text");
    toast.success("Text added - Edit in the Text panel on the right");
  }, [project, addTrack, addClip, currentTime, selectClip]);

  const handleUpdateClipProperty = useCallback(
    (property: string, value: number | string | boolean) => {
      if (!selectedClip) return;

      if (property.startsWith("transform.")) {
        const transformKey = property.split(
          "."
        )[1] as keyof typeof selectedClip.properties.transform;
        updateClip(selectedClip.id, {
          properties: {
            ...selectedClip.properties,
            transform: {
              ...selectedClip.properties.transform,
              [transformKey]: value,
            },
          },
        });
      } else {
        updateClip(selectedClip.id, {
          properties: {
            ...selectedClip.properties,
            [property]: value,
          },
        });
      }
    },
    [selectedClip, updateClip]
  );

  const handleAddFilter = useCallback(
    (filterType: FilterType) => {
      if (!selectedClip) return;

      const newFilter = {
        id: generateId(),
        type: filterType,
        enabled: true,
        params: { value: FILTER_PRESETS.find((f) => f.id === filterType)?.default || 1 },
      };

      updateClip(selectedClip.id, {
        properties: {
          ...selectedClip.properties,
          filters: [...selectedClip.properties.filters, newFilter],
        },
      });
    },
    [selectedClip, updateClip]
  );

  const handleRemoveFilter = useCallback(
    (filterId: string) => {
      if (!selectedClip) return;

      updateClip(selectedClip.id, {
        properties: {
          ...selectedClip.properties,
          filters: selectedClip.properties.filters.filter((f) => f.id !== filterId),
        },
      });
    },
    [selectedClip, updateClip]
  );

  const handleUpdateFilter = useCallback(
    (filterId: string, value: number) => {
      if (!selectedClip) return;

      updateClip(selectedClip.id, {
        properties: {
          ...selectedClip.properties,
          filters: selectedClip.properties.filters.map((f) =>
            f.id === filterId ? { ...f, params: { ...f.params, value } } : f
          ),
        },
      });
    },
    [selectedClip, updateClip]
  );

  // Timeline interaction handlers
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!timelineContentRef.current) return;
      const rect = timelineContentRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = pixelToTime(x);
      seek(Math.max(0, Math.min(time, duration)));
      clearSelection();
    },
    [pixelToTime, seek, duration, clearSelection]
  );

  const handleClipMouseDown = useCallback(
    (e: React.MouseEvent, clip: Clip, track: { id: string; locked: boolean }) => {
      e.stopPropagation();
      if (track.locked) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX;

      // Check if clicking on trim handles (edges) - 12px matches w-3 class
      const isLeftEdge = e.clientX - rect.left < 12;
      const isRightEdge = rect.right - e.clientX < 12;

      if (isLeftEdge) {
        setTrimming({ clipId: clip.id, edge: "start", startX: x, initialTime: clip.startTime });
      } else if (isRightEdge) {
        setTrimming({ clipId: clip.id, edge: "end", startX: x, initialTime: clip.endTime });
      } else {
        setDraggingClip({ clipId: clip.id, startX: x, initialStart: clip.startTime });
      }

      selectClip(clip.id, e.shiftKey || e.ctrlKey);
    },
    [selectClip]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (draggingClip && project) {
        const deltaX = e.clientX - draggingClip.startX;
        const deltaTime = pixelToTime(deltaX);
        let newStartTime = Math.max(0, draggingClip.initialStart + deltaTime);
        newStartTime = snapTime(newStartTime, draggingClip.clipId);

        // Find the clip and its duration
        for (const track of project.tracks) {
          const clip = track.clips.find((c) => c.id === draggingClip.clipId);
          if (clip) {
            const clipDuration = clip.endTime - clip.startTime;
            updateClip(clip.id, {
              startTime: newStartTime,
              endTime: newStartTime + clipDuration,
            });
            break;
          }
        }
      }

      if (trimming && project) {
        const deltaX = e.clientX - trimming.startX;
        const deltaTime = pixelToTime(deltaX);

        for (const track of project.tracks) {
          const clip = track.clips.find((c) => c.id === trimming.clipId);
          if (clip) {
            if (trimming.edge === "start") {
              let newStartTime = Math.max(0, trimming.initialTime + deltaTime);
              newStartTime = snapTime(newStartTime, trimming.clipId);
              newStartTime = Math.min(newStartTime, clip.endTime - 0.1);

              const trimAmount = newStartTime - clip.startTime;
              updateClip(clip.id, {
                startTime: newStartTime,
                sourceStart: clip.sourceStart + trimAmount,
              });
            } else {
              let newEndTime = Math.max(clip.startTime + 0.1, trimming.initialTime + deltaTime);
              newEndTime = snapTime(newEndTime, trimming.clipId);

              const trimAmount = newEndTime - clip.endTime;
              updateClip(clip.id, {
                endTime: newEndTime,
                sourceEnd: clip.sourceEnd + trimAmount,
              });
            }
            break;
          }
        }
      }

      if (draggingPlayhead && timelineContentRef.current) {
        const rect = timelineContentRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = Math.max(0, Math.min(pixelToTime(x), duration));
        seek(time);
      }
    },
    [
      draggingClip,
      trimming,
      draggingPlayhead,
      project,
      pixelToTime,
      snapTime,
      updateClip,
      seek,
      duration,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
    setTrimming(null);
    setDraggingPlayhead(false);
  }, []);

  // Add global mouse event listeners for drag operations
  useEffect(() => {
    if (draggingClip || trimming || draggingPlayhead) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [draggingClip, trimming, draggingPlayhead, handleMouseMove, handleMouseUp]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleSaveProject();
      } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleCopyClip();
      } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePasteClip();
      } else if (e.key === "x" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleCutClip();
      } else if (e.key === "d" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleDuplicateClip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekRelative(e.shiftKey ? -5 : -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekRelative(e.shiftKey ? 5 : 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        seek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seek(duration);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    togglePlay,
    handleDeleteSelected,
    handleSaveProject,
    undo,
    redo,
    handleCopyClip,
    handlePasteClip,
    handleCutClip,
    handleDuplicateClip,
    seekRelative,
    seek,
    duration,
  ]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Film className="mx-auto h-12 w-12 animate-pulse text-muted-foreground/50" />
          <h2 className="mt-4 text-lg font-medium">Initializing editor...</h2>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background">
        {/* Toolbar */}
        <header className="flex h-12 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleOpenProject}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Open
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSaveProject}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
            <Separator orientation="vertical" className="mx-2 h-6" />
            <Input
              value={project.name}
              onChange={(e) => setProjectName(e.target.value)}
              className="h-8 w-48"
            />
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={undo} disabled={historyIndex <= 0}>
                  <Undo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                >
                  <Redo className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-2 h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopyClip}
                  disabled={selectedClipIds.length !== 1}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy (Ctrl+C)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePasteClip}
                  disabled={!clipboardClip}
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Paste (Ctrl+V)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-2 h-6" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSplitAtPlayhead}
                  disabled={selectedClipIds.length !== 1}
                >
                  <Scissors className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split at Playhead (S)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDeleteSelected}
                  disabled={selectedClipIds.length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete (Del)</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-2 h-6" />
            <Button variant="default" size="sm" onClick={() => setShowExportDialog(true)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Media Browser */}
          <div
            className={cn(
              "flex flex-col border-r border-border bg-card transition-all",
              leftPanelOpen ? "w-64" : "w-0"
            )}
          >
            {leftPanelOpen && (
              <>
                <div className="flex h-10 items-center justify-between border-b border-border px-3">
                  <span className="text-sm font-medium">Media</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setLeftPanelOpen(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <Tabs
                  value={activeLeftTab}
                  onValueChange={(v) => setActiveLeftTab(v as "media" | "library")}
                  className="flex flex-1 flex-col"
                >
                  <TabsList className="mx-2 mt-2">
                    <TabsTrigger value="library" className="flex-1">
                      Library
                    </TabsTrigger>
                    <TabsTrigger value="media" className="flex-1">
                      Import
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="library" className="m-0 flex-1 overflow-auto p-2">
                    <div className="space-y-2">
                      {libraryLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : libraryVideos.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                          <Film className="mx-auto mb-2 h-8 w-8 opacity-50" />
                          <p>No videos in library</p>
                        </div>
                      ) : (
                        libraryVideos.map((video) => (
                          <div
                            key={video.id}
                            className="group relative cursor-pointer overflow-hidden rounded-lg border border-border hover:border-primary/50"
                            onClick={() => handleAddMediaToTimeline(video)}
                          >
                            <div className="aspect-video bg-muted">
                              {video.thumbnail && (
                                <img
                                  src={video.thumbnail}
                                  alt={video.title}
                                  className="h-full w-full object-cover"
                                />
                              )}
                              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                                <Plus className="h-8 w-8 text-white" />
                              </div>
                            </div>
                            <div className="p-2">
                              <p className="truncate text-xs font-medium">{video.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDuration(video.duration)}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="media" className="m-0 flex-1 overflow-auto p-2">
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={handleImportFile}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Import Files
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={handleAddTextTrack}
                      >
                        <Type className="mr-2 h-4 w-4" />
                        Add Text
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => addTrack("audio")}
                      >
                        <Music className="mr-2 h-4 w-4" />
                        Add Audio Track
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => addTrack("video")}
                      >
                        <Video className="mr-2 h-4 w-4" />
                        Add Video Track
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </>
            )}
          </div>

          {/* Toggle Left Panel Button */}
          {!leftPanelOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-0 top-1/2 z-10 h-8 w-6 -translate-y-1/2 rounded-l-none"
              onClick={() => setLeftPanelOpen(true)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}

          {/* Center - Preview */}
          <div className="flex flex-1 flex-col">
            {/* Video Preview */}
            <div className="flex flex-1 items-center justify-center bg-black p-4">
              <div className="relative aspect-video w-full max-w-4xl overflow-hidden rounded bg-neutral-900">
                {currentClip ? (
                  <>
                    <video
                      ref={videoRef}
                      className="h-full w-full object-contain"
                      playsInline
                      onLoadedData={() => {
                        logger.debug("Editor", "Video loaded successfully");
                        setVideoLoading(false);
                        setVideoError(null);
                      }}
                      onCanPlay={() => {
                        logger.debug("Editor", "Video can play");
                        setVideoLoading(false);
                      }}
                      onError={(e) => {
                        const video = e.currentTarget;
                        const mediaError = video.error;
                        let errorMsg = "Failed to load video";
                        if (mediaError) {
                          logger.error("Editor", "Video error:", mediaError.code, mediaError.message, "src:", video.src);
                          switch (mediaError.code) {
                            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                              errorMsg = "Video format not supported or file not found";
                              break;
                            case MediaError.MEDIA_ERR_NETWORK:
                              errorMsg = "Network error loading video";
                              break;
                            case MediaError.MEDIA_ERR_DECODE:
                              errorMsg = "Video decoding failed";
                              break;
                          }
                        }
                        setVideoError(errorMsg);
                        setVideoLoading(false);
                      }}
                      style={{
                        opacity: currentClip.properties.opacity,
                        filter: currentClip.properties.filters
                          .filter((f) => f.enabled)
                          .map((f) => {
                            const v = f.params.value as number;
                            switch (f.type) {
                              case "brightness":
                                return `brightness(${v})`;
                              case "contrast":
                                return `contrast(${v})`;
                              case "saturation":
                                return `saturate(${v})`;
                              case "hue":
                                return `hue-rotate(${v}deg)`;
                              case "blur":
                                return `blur(${v}px)`;
                              default:
                                return "";
                            }
                          })
                          .join(" "),
                      }}
                    />
                    {/* Loading overlay */}
                    {videoLoading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </div>
                    )}
                    {/* Error overlay */}
                    {videoError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                        <div className="text-center text-white">
                          <Film className="mx-auto h-12 w-12 opacity-50" />
                          <p className="mt-2 font-medium">Unable to load video</p>
                          <p className="mt-1 text-sm text-white/60">{videoError}</p>
                          <p className="mt-2 text-xs text-white/40">
                            Path: {currentClip.sourcePath}
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Hidden audio element for separate audio clips */}
                    {currentAudioClip && (
                      <audio
                        ref={audioRef}
                        src={convertFileSrc(currentAudioClip.sourcePath)}
                        style={{ display: "none" }}
                      />
                    )}
                  </>
                ) : (
                  <Empty className="h-full">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Film />
                      </EmptyMedia>
                      <EmptyTitle>No preview</EmptyTitle>
                      <EmptyDescription>Add media to the timeline to preview</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex h-16 items-center justify-center gap-4 border-t border-border bg-card px-4">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => seek(0)}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Go to Start (Home)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => seekRelative(-5)}>
                    <SkipBack className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Back 5s (Shift+←)</TooltipContent>
              </Tooltip>
              <Button
                variant="default"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={togglePlay}
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => seekRelative(5)}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Forward 5s (Shift+→)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => seek(duration)}>
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Go to End (End)</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex items-center gap-2 font-mono text-sm text-muted-foreground">
                <span>{formatDuration(currentTime)}</span>
                <span>/</span>
                <span>{formatDuration(duration)}</span>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={toggleMute}>
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume * 100]}
                  onValueChange={([v]) => v !== undefined && setVolume(v / 100)}
                  max={100}
                  step={1}
                  className="w-24"
                />
              </div>
            </div>
          </div>

          {/* Right Panel - Properties */}
          <div
            className={cn(
              "flex flex-col border-l border-border bg-card transition-all",
              rightPanelOpen ? "w-72" : "w-0"
            )}
          >
            {rightPanelOpen && (
              <>
                <div className="flex h-10 items-center justify-between border-b border-border px-3">
                  <span className="text-sm font-medium">Properties</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setRightPanelOpen(false)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {selectedClip ? (
                  <Tabs
                    value={activeRightTab}
                    onValueChange={(v) => setActiveRightTab(v as "properties" | "filters" | "text")}
                    className="flex flex-1 flex-col"
                  >
                    <TabsList className="mx-2 mt-2">
                      <TabsTrigger value="properties" className="flex-1">
                        Props
                      </TabsTrigger>
                      <TabsTrigger value="filters" className="flex-1">
                        Filters
                      </TabsTrigger>
                      {selectedClip.type === "text" && (
                        <TabsTrigger value="text" className="flex-1">
                          Text
                        </TabsTrigger>
                      )}
                    </TabsList>

                    <TabsContent
                      value="properties"
                      className="m-0 flex-1 space-y-4 overflow-auto p-3"
                    >
                      <div className="space-y-2">
                        <Label className="text-xs">Clip Name</Label>
                        <Input
                          value={selectedClip.name}
                          onChange={(e) => updateClip(selectedClip.id, { name: e.target.value })}
                          className="h-8"
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-xs">Volume</Label>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[selectedClip.properties.volume * 100]}
                            onValueChange={([v]) =>
                              v !== undefined && handleUpdateClipProperty("volume", v / 100)
                            }
                            max={200}
                            step={1}
                          />
                          <span className="w-12 text-right text-xs">
                            {Math.round(selectedClip.properties.volume * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Opacity</Label>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[selectedClip.properties.opacity * 100]}
                            onValueChange={([v]) =>
                              v !== undefined && handleUpdateClipProperty("opacity", v / 100)
                            }
                            max={100}
                            step={1}
                          />
                          <span className="w-12 text-right text-xs">
                            {Math.round(selectedClip.properties.opacity * 100)}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Speed</Label>
                        <div className="flex items-center gap-2">
                          <Slider
                            value={[selectedClip.properties.speed * 100]}
                            onValueChange={([v]) =>
                              v !== undefined && handleUpdateClipProperty("speed", v / 100)
                            }
                            min={25}
                            max={400}
                            step={25}
                          />
                          <span className="w-12 text-right text-xs">
                            {Math.round(selectedClip.properties.speed * 100)}%
                          </span>
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-xs">Fade In (seconds)</Label>
                        <Slider
                          value={[selectedClip.properties.fadeIn]}
                          onValueChange={([v]) =>
                            v !== undefined && handleUpdateClipProperty("fadeIn", v)
                          }
                          max={5}
                          step={0.1}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">Fade Out (seconds)</Label>
                        <Slider
                          value={[selectedClip.properties.fadeOut]}
                          onValueChange={([v]) =>
                            v !== undefined && handleUpdateClipProperty("fadeOut", v)
                          }
                          max={5}
                          step={0.1}
                        />
                      </div>

                      <Separator />

                      <div className="space-y-2">
                        <Label className="text-xs">Transform</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground">X Position</Label>
                            <Input
                              type="number"
                              value={selectedClip.properties.transform.x}
                              onChange={(e) =>
                                handleUpdateClipProperty(
                                  "transform.x",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Y Position</Label>
                            <Input
                              type="number"
                              value={selectedClip.properties.transform.y}
                              onChange={(e) =>
                                handleUpdateClipProperty(
                                  "transform.y",
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Scale X</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={selectedClip.properties.transform.scaleX}
                              onChange={(e) =>
                                handleUpdateClipProperty(
                                  "transform.scaleX",
                                  parseFloat(e.target.value) || 1
                                )
                              }
                              className="h-7 text-xs"
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] text-muted-foreground">Scale Y</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={selectedClip.properties.transform.scaleY}
                              onChange={(e) =>
                                handleUpdateClipProperty(
                                  "transform.scaleY",
                                  parseFloat(e.target.value) || 1
                                )
                              }
                              className="h-7 text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            Rotation (degrees)
                          </Label>
                          <Input
                            type="number"
                            value={selectedClip.properties.transform.rotation}
                            onChange={(e) =>
                              handleUpdateClipProperty(
                                "transform.rotation",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => {
                            updateClip(selectedClip.id, {
                              properties: {
                                ...selectedClip.properties,
                                transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
                              },
                            });
                          }}
                        >
                          <RotateCcw className="mr-2 h-3 w-3" />
                          Reset Transform
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="filters" className="m-0 flex-1 space-y-4 overflow-auto p-3">
                      <div className="space-y-2">
                        <Label className="text-xs">Add Filter</Label>
                        <Select onValueChange={(v) => handleAddFilter(v as FilterType)}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select filter..." />
                          </SelectTrigger>
                          <SelectContent>
                            {FILTER_PRESETS.map((filter) => (
                              <SelectItem key={filter.id} value={filter.id}>
                                {filter.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        {selectedClip.properties.filters.length === 0 ? (
                          <p className="py-4 text-center text-xs text-muted-foreground">
                            No filters applied
                          </p>
                        ) : (
                          selectedClip.properties.filters.map((filter) => {
                            const preset = FILTER_PRESETS.find((p) => p.id === filter.type);
                            if (!preset) return null;
                            return (
                              <div
                                key={filter.id}
                                className="space-y-2 rounded border border-border p-2"
                              >
                                <div className="flex items-center justify-between">
                                  <Label className="text-xs">{preset.name}</Label>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleRemoveFilter(filter.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Slider
                                    value={[filter.params.value as number]}
                                    onValueChange={([v]) =>
                                      v !== undefined && handleUpdateFilter(filter.id, v)
                                    }
                                    min={preset.min}
                                    max={preset.max}
                                    step={0.01}
                                  />
                                  <span className="w-12 text-right text-xs">
                                    {(filter.params.value as number).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </TabsContent>

                    {selectedClip.type === "text" && (
                      <TabsContent value="text" className="m-0 flex-1 space-y-4 overflow-auto p-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Text Content</Label>
                          <textarea
                            value={selectedClip.properties.text?.content || ""}
                            onChange={(e) =>
                              updateClip(selectedClip.id, {
                                properties: {
                                  ...selectedClip.properties,
                                  text: {
                                    ...selectedClip.properties.text!,
                                    content: e.target.value,
                                  },
                                },
                                name: e.target.value.slice(0, 20) || "Text",
                              })
                            }
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Enter your text..."
                          />
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label className="text-xs">Font Family</Label>
                          <Select
                            value={selectedClip.properties.text?.fontFamily || "Arial"}
                            onValueChange={(value) =>
                              updateClip(selectedClip.id, {
                                properties: {
                                  ...selectedClip.properties,
                                  text: {
                                    ...selectedClip.properties.text!,
                                    fontFamily: value,
                                  },
                                },
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Arial">Arial</SelectItem>
                              <SelectItem value="Helvetica">Helvetica</SelectItem>
                              <SelectItem value="Times New Roman">Times New Roman</SelectItem>
                              <SelectItem value="Georgia">Georgia</SelectItem>
                              <SelectItem value="Verdana">Verdana</SelectItem>
                              <SelectItem value="Courier New">Courier New</SelectItem>
                              <SelectItem value="Impact">Impact</SelectItem>
                              <SelectItem value="Comic Sans MS">Comic Sans MS</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">
                              Font Size: {selectedClip.properties.text?.fontSize || 48}px
                            </Label>
                            <Slider
                              value={[selectedClip.properties.text?.fontSize || 48]}
                              onValueChange={([v]) =>
                                v !== undefined &&
                                updateClip(selectedClip.id, {
                                  properties: {
                                    ...selectedClip.properties,
                                    text: {
                                      ...selectedClip.properties.text!,
                                      fontSize: v,
                                    },
                                  },
                                })
                              }
                              min={12}
                              max={200}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Font Weight</Label>
                            <Select
                              value={String(selectedClip.properties.text?.fontWeight || 400)}
                              onValueChange={(value) =>
                                updateClip(selectedClip.id, {
                                  properties: {
                                    ...selectedClip.properties,
                                    text: {
                                      ...selectedClip.properties.text!,
                                      fontWeight: parseInt(value),
                                    },
                                  },
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="300">Light</SelectItem>
                                <SelectItem value="400">Normal</SelectItem>
                                <SelectItem value="500">Medium</SelectItem>
                                <SelectItem value="600">Semi Bold</SelectItem>
                                <SelectItem value="700">Bold</SelectItem>
                                <SelectItem value="800">Extra Bold</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <Separator />

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-2">
                            <Label className="text-xs">Text Color</Label>
                            <Input
                              type="color"
                              value={selectedClip.properties.text?.color || "#ffffff"}
                              onChange={(e) =>
                                updateClip(selectedClip.id, {
                                  properties: {
                                    ...selectedClip.properties,
                                    text: {
                                      ...selectedClip.properties.text!,
                                      color: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="h-8 w-full"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">Background</Label>
                            <Input
                              type="color"
                              value={
                                selectedClip.properties.text?.backgroundColor === "transparent"
                                  ? "#000000"
                                  : selectedClip.properties.text?.backgroundColor || "#000000"
                              }
                              onChange={(e) =>
                                updateClip(selectedClip.id, {
                                  properties: {
                                    ...selectedClip.properties,
                                    text: {
                                      ...selectedClip.properties.text!,
                                      backgroundColor: e.target.value,
                                    },
                                  },
                                })
                              }
                              className="h-8 w-full"
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="space-y-2">
                          <Label className="text-xs">Horizontal Alignment</Label>
                          <div className="flex gap-1">
                            {(["left", "center", "right"] as const).map((align) => (
                              <Button
                                key={align}
                                variant={
                                  selectedClip.properties.text?.align === align
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                className="flex-1 capitalize"
                                onClick={() =>
                                  updateClip(selectedClip.id, {
                                    properties: {
                                      ...selectedClip.properties,
                                      text: {
                                        ...selectedClip.properties.text!,
                                        align,
                                      },
                                    },
                                  })
                                }
                              >
                                {align}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Vertical Alignment</Label>
                          <div className="flex gap-1">
                            {(["top", "middle", "bottom"] as const).map((vAlign) => (
                              <Button
                                key={vAlign}
                                variant={
                                  selectedClip.properties.text?.verticalAlign === vAlign
                                    ? "default"
                                    : "outline"
                                }
                                size="sm"
                                className="flex-1 capitalize"
                                onClick={() =>
                                  updateClip(selectedClip.id, {
                                    properties: {
                                      ...selectedClip.properties,
                                      text: {
                                        ...selectedClip.properties.text!,
                                        verticalAlign: vAlign,
                                      },
                                    },
                                  })
                                }
                              >
                                {vAlign}
                              </Button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                          <p>
                            Text will be rendered on export using FFmpeg. Preview shows text
                            properties only.
                          </p>
                        </div>
                      </TabsContent>
                    )}
                  </Tabs>
                ) : (
                  <div className="flex flex-1 items-center justify-center p-4">
                    <div className="text-center text-muted-foreground">
                      <Settings2 className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p className="text-sm">Select a clip to edit</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Toggle Right Panel Button */}
          {!rightPanelOpen && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 z-10 h-8 w-6 -translate-y-1/2 rounded-r-none"
              onClick={() => setRightPanelOpen(true)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Timeline */}
        <div className="flex h-72 flex-col border-t border-border bg-card">
          {/* Timeline Header */}
          <div className="flex h-8 flex-shrink-0 items-center justify-between border-b border-border px-4">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
                    <Plus className="h-3 w-3" />
                    Add Track
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => addTrack("video")}>
                    <Video className="mr-2 h-4 w-4" />
                    Video Track
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addTrack("audio")}>
                    <Music className="mr-2 h-4 w-4" />
                    Audio Track
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addTrack("text")}>
                    <Type className="mr-2 h-4 w-4" />
                    Text Track
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoomOut}>
                <ZoomOut className="h-3 w-3" />
              </Button>
              <span className="w-12 text-center text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={zoomIn}>
                <ZoomIn className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Time Ruler */}
          <div className="flex h-6 flex-shrink-0 border-b border-border">
            <div className="w-40 flex-shrink-0 bg-muted/30" />
            <div
              className="relative flex-1 cursor-pointer overflow-hidden bg-muted/20"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                seek(pixelToTime(x));
              }}
              style={{ minWidth: timelineWidth }}
            >
              {timeRulerMarkers.map((marker) => (
                <div
                  key={marker.time}
                  className="absolute bottom-0 top-0 flex flex-col items-center"
                  style={{ left: timeToPixel(marker.time) }}
                >
                  <div className={cn("w-px bg-border", marker.major ? "h-full" : "h-2")} />
                  {marker.major && (
                    <span className="mt-0.5 text-[10px] text-muted-foreground">{marker.label}</span>
                  )}
                </div>
              ))}
              {/* Playhead on ruler */}
              <div
                className="absolute bottom-0 top-0 z-10 w-0.5 bg-red-500"
                style={{ left: timeToPixel(currentTime) }}
              >
                <div className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-red-500" />
              </div>
            </div>
          </div>

          {/* Timeline Tracks */}
          <div className="flex-1 overflow-auto" ref={timelineRef}>
            {project.tracks.length === 0 ? (
              <Empty className="h-full">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Layers />
                  </EmptyMedia>
                  <EmptyTitle>No tracks</EmptyTitle>
                  <EmptyDescription>Add a track or import media to get started</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              project.tracks.map((track, index) => (
                <div
                  key={track.id}
                  className={cn(
                    "flex border-b border-border transition-colors duration-150",
                    index % 2 === 0 ? "bg-muted/30" : "bg-background",
                    selectedTrackId === track.id && "bg-primary/10 ring-1 ring-inset ring-primary",
                    selectedTrackId !== track.id && "hover:bg-muted/50"
                  )}
                  style={{ height: track.height }}
                  onClick={() => selectTrack(track.id)}
                >
                  {/* Track Header with Context Menu */}
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "flex w-40 flex-shrink-0 items-center gap-2 border-r px-3 transition-colors",
                          selectedTrackId === track.id
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/50" />
                        <div
                          className={cn(
                            "h-2 w-2 rounded-full",
                            track.type === "video"
                              ? "bg-blue-500"
                              : track.type === "audio"
                                ? "bg-green-500"
                                : track.type === "text"
                                  ? "bg-purple-500"
                                  : "bg-orange-500"
                          )}
                        />
                        <span className="flex-1 truncate text-xs font-medium">{track.name}</span>
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTrack(track.id, { muted: !track.muted });
                            }}
                          >
                            {track.muted ? (
                              <EyeOff className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTrack(track.id, { locked: !track.locked });
                            }}
                          >
                            {track.locked ? (
                              <Lock className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <Unlock className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem
                        onClick={() => updateTrack(track.id, { muted: !track.muted })}
                      >
                        {track.muted ? (
                          <Eye className="mr-2 h-4 w-4" />
                        ) : (
                          <EyeOff className="mr-2 h-4 w-4" />
                        )}
                        {track.muted ? "Show Track" : "Hide Track"}
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => updateTrack(track.id, { locked: !track.locked })}
                      >
                        {track.locked ? (
                          <Unlock className="mr-2 h-4 w-4" />
                        ) : (
                          <Lock className="mr-2 h-4 w-4" />
                        )}
                        {track.locked ? "Unlock Track" : "Lock Track"}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={() => {
                          // Add a new track of the same type
                          const newTrackId = addTrack(track.type);
                          // Update the name to indicate it's a copy
                          updateTrack(newTrackId, { name: `${track.name} (copy)` });
                          toast.success("Track duplicated");
                        }}
                      >
                        <Layers className="mr-2 h-4 w-4" />
                        Duplicate Track
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={async () => {
                          if (project && project.tracks.length > 1) {
                            const confirmed = await ask("Delete this track and all its clips?", {
                              title: "Delete Track",
                              kind: "warning",
                            });
                            if (confirmed) {
                              removeTrack(track.id);
                              toast.success("Track deleted");
                            }
                          } else {
                            toast.error("Cannot delete the last track");
                          }
                        }}
                        disabled={project && project.tracks.length <= 1}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Track
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>

                  {/* Track Content */}
                  <div
                    ref={timelineContentRef}
                    className="relative flex-1"
                    style={{ minWidth: timelineWidth }}
                    onClick={handleTimelineClick}
                  >
                    {/* Grid lines */}
                    {timeRulerMarkers
                      .filter((m) => m.major)
                      .map((marker) => (
                        <div
                          key={marker.time}
                          className="absolute bottom-0 top-0 w-px bg-border/30"
                          style={{ left: timeToPixel(marker.time) }}
                        />
                      ))}

                    {/* Playhead - line is pointer-events-none, only the handle area captures events */}
                    <div
                      className="pointer-events-none absolute bottom-0 top-0 z-10 w-0.5 bg-red-500"
                      style={{ left: timeToPixel(currentTime) }}
                    />
                    {/* Playhead drag handle - wider invisible area for easier grabbing */}
                    <div
                      className="absolute bottom-0 top-0 z-30 -ml-1.5 w-3 cursor-ew-resize hover:bg-red-500/10"
                      style={{ left: timeToPixel(currentTime) }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingPlayhead(true);
                      }}
                    />

                    {/* Clips */}
                    {track.clips.map((clip) => {
                      const isSelected = selectedClipIds.includes(clip.id);
                      const clipWidth = timeToPixel(clip.endTime - clip.startTime);
                      const clipLeft = timeToPixel(clip.startTime);

                      return (
                        <ContextMenu key={clip.id}>
                          <ContextMenuTrigger asChild>
                            <div
                              className={cn(
                                "group absolute bottom-1 top-1 rounded transition-all duration-150",
                                "flex items-center overflow-hidden",
                                clip.type === "video"
                                  ? "bg-blue-500/80 hover:bg-blue-500"
                                  : clip.type === "audio"
                                    ? "bg-green-500/80 hover:bg-green-500"
                                    : clip.type === "text"
                                      ? "bg-purple-500/80 hover:bg-purple-500"
                                      : "bg-orange-500/80 hover:bg-orange-500",
                                isSelected &&
                                  "shadow-[0_0_10px_rgba(255,255,255,0.3)] ring-2 ring-white ring-offset-1 ring-offset-black/50",
                                !isSelected && "hover:ring-1 hover:ring-white/50",
                                track.locked && "cursor-not-allowed opacity-50",
                                !track.locked && "cursor-grab active:cursor-grabbing"
                              )}
                              style={{
                                left: clipLeft,
                                width: Math.max(clipWidth, 20),
                              }}
                              onMouseDown={(e) => handleClipMouseDown(e, clip, track)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* Selection indicator badge */}
                              {isSelected && (
                                <div className="absolute -left-1 -top-1 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-md">
                                  <div className="h-2 w-2 rounded-full bg-primary" />
                                </div>
                              )}

                              {/* Left trim handle - wider for easier grabbing */}
                              {!track.locked && (
                                <div
                                  className={cn(
                                    "absolute bottom-0 left-0 top-0 z-10 w-3 cursor-ew-resize",
                                    "bg-gradient-to-r from-white/20 to-transparent transition-colors hover:from-white/40",
                                    "flex items-center justify-start pl-0.5"
                                  )}
                                >
                                  <div className="h-6 w-1 rounded-full bg-white/60 opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                              )}

                              {/* Clip content */}
                              <div className="flex min-w-0 flex-1 items-center gap-1 px-4">
                                {clip.type === "video" && (
                                  <Video className="h-3 w-3 flex-shrink-0 text-white" />
                                )}
                                {clip.type === "audio" && (
                                  <Music className="h-3 w-3 flex-shrink-0 text-white" />
                                )}
                                {clip.type === "text" && (
                                  <Type className="h-3 w-3 flex-shrink-0 text-white" />
                                )}
                                {clip.type === "image" && (
                                  <Image className="h-3 w-3 flex-shrink-0 text-white" />
                                )}
                                <span className="truncate text-xs font-medium text-white">
                                  {clip.name}
                                </span>
                              </div>

                              {/* Right trim handle - wider for easier grabbing */}
                              {!track.locked && (
                                <div
                                  className={cn(
                                    "absolute bottom-0 right-0 top-0 z-10 w-3 cursor-ew-resize",
                                    "bg-gradient-to-l from-white/20 to-transparent transition-colors hover:from-white/40",
                                    "flex items-center justify-end pr-0.5"
                                  )}
                                >
                                  <div className="h-6 w-1 rounded-full bg-white/60 opacity-0 transition-opacity group-hover:opacity-100" />
                                </div>
                              )}
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-48">
                            <ContextMenuItem
                              onClick={() => {
                                selectClip(clip.id, false);
                                handleCutClip();
                              }}
                              disabled={track.locked}
                            >
                              <Scissors className="mr-2 h-4 w-4" />
                              Cut
                              <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => {
                                selectClip(clip.id, false);
                                handleCopyClip();
                              }}
                            >
                              <Copy className="mr-2 h-4 w-4" />
                              Copy
                              <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={handlePasteClip}
                              disabled={!clipboardClip || track.locked}
                            >
                              <Clipboard className="mr-2 h-4 w-4" />
                              Paste
                              <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => {
                                selectClip(clip.id, false);
                                handleDuplicateClip();
                              }}
                              disabled={track.locked}
                            >
                              <Layers className="mr-2 h-4 w-4" />
                              Duplicate
                              <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                            </ContextMenuItem>
                            <ContextMenuItem
                              onClick={() => {
                                selectClip(clip.id, false);
                                if (currentTime > clip.startTime && currentTime < clip.endTime) {
                                  splitClip(clip.id, currentTime);
                                  toast.success("Clip split at playhead");
                                } else {
                                  toast.error("Playhead must be within clip to split");
                                }
                              }}
                              disabled={
                                track.locked ||
                                currentTime <= clip.startTime ||
                                currentTime >= clip.endTime
                              }
                            >
                              <Scissors className="mr-2 h-4 w-4" />
                              Split at Playhead
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              onClick={() => {
                                selectClip(clip.id, false);
                                handleDeleteSelected();
                              }}
                              disabled={track.locked}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                              <ContextMenuShortcut>Del</ContextMenuShortcut>
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Export Dialog */}
        <ExportDialog
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
          projectName={project?.name}
          onExport={handleExport}
          onCancel={cancelExport}
          exporting={exporting}
          exportProgress={exportProgress}
        />
      </div>
    </TooltipProvider>
  );
}
