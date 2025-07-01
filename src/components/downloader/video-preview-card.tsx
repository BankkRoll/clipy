import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { DownloadProgress, VideoInfo } from "@/types/download";
import { useNavigate } from "@tanstack/react-router";
import {
    CheckCircle2,
    Clock,
    Download,
    Eye,
    FileVideo,
    Image as ImageIcon,
    Info,
    Pause,
    Play,
    Scissors,
    Settings,
    SkipBack,
    SkipForward,
    Subtitles,
    X,
    Zap
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface VideoPreviewCardProps {
    videoInfo: VideoInfo;
    onDownload: (options: DownloadOptions) => void;
    onReset: () => void;
}

interface DownloadOptions {
    quality: string;
    format: 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus';
    startTime?: number;
    endTime?: number;
    downloadSubtitles: boolean;
    downloadThumbnail: boolean;
    saveMetadata: boolean;
    createSubdirectories: boolean;
}

function formatTime(seconds: number): string {
    const floor = Math.floor(seconds);
    const min = Math.floor(floor / 60);
    const sec = floor % 60;
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function VideoPreviewCard({ videoInfo, onDownload, onReset }: VideoPreviewCardProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);

    const [trimRange, setTrimRange] = useState<[number, number]>([0, videoInfo.duration]);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);

    const isTrimmed = trimRange[0] > 0 || trimRange[1] < videoInfo.duration;

    const [downloadOptions, setDownloadOptions] = useState<DownloadOptions>({
        quality: 'best',
        format: 'mp4',
        downloadSubtitles: true,
        downloadThumbnail: true,
        saveMetadata: true,
        createSubdirectories: true,
    });

    useEffect(() => {
        const loadUserDefaults = async () => {
            try {
                const config = await window.configManager.get();
                if (config.success) {
                    const userDefaultQuality = config.data.download.defaultVideoQuality;
                    const userDefaultFormat = config.data.download.videoFormat;

                    const availableQualities = videoInfo.availableQualities;
                    let selectedQuality = userDefaultQuality;

                    if (!availableQualities.includes(userDefaultQuality)) {
                        if (availableQualities.includes('best')) {
                            selectedQuality = 'best';
                        } else if (availableQualities.includes('4K')) {
                            selectedQuality = '4K';
                        } else if (availableQualities.includes('1440p')) {
                            selectedQuality = '1440p';
                        } else if (availableQualities.includes('1080p')) {
                            selectedQuality = '1080p';
                        } else if (availableQualities.includes('720p')) {
                            selectedQuality = '720p';
                        } else {
                            selectedQuality = availableQualities[0] || 'best';
                        }
                    }

                    setDownloadOptions(prev => ({
                        ...prev,
                        quality: selectedQuality,
                        format: userDefaultFormat as 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus',
                        downloadSubtitles: config.data.download.downloadSubtitles,
                        downloadThumbnail: config.data.download.downloadThumbnails,
                        saveMetadata: config.data.download.saveMetadata,
                        createSubdirectories: config.data.download.createSubdirectories,
                    }));
                }
            } catch (error) {
                console.error('Failed to load user defaults:', error);
            }
        };

        loadUserDefaults();
    }, [videoInfo.availableQualities]);

    const togglePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const seekToStart = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = trimRange[0];
            setCurrentTime(trimRange[0]);
        }
    };

    const seekToEnd = () => {
        if (videoRef.current) {
            videoRef.current.currentTime = trimRange[1];
            setCurrentTime(trimRange[1]);
        }
    };

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            const time = videoRef.current.currentTime;
            setCurrentTime(time);

            if (time >= trimRange[1] && isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        }
    };

    const handleTrimRangeChange = (newRange: [number, number]) => {
        setTrimRange(newRange);
        if (currentTime < newRange[0] || currentTime > newRange[1]) {
            if (videoRef.current) {
                videoRef.current.currentTime = newRange[0];
                setCurrentTime(newRange[0]);
            }
        }
    };

    useEffect(() => {
        const handleProgressUpdate = (progress: DownloadProgress) => {
            if (progress.title === videoInfo.title) {
                setDownloadProgress(progress);
                if (progress.status === 'completed') {
                    setIsDownloading(false);
                    toast.success(t("msgDownloadCompleted"));
                    setTimeout(() => {
                        navigate({ to: "/library" });
                    }, 2000);
                } else if (progress.status === 'failed') {
                    setIsDownloading(false);
                    toast.error(progress.error?.message || t("msgDownloadFailed"));
                }
            }
        };

        window.addEventListener('download-progress-update', handleProgressUpdate as any);
        return () => {
            window.removeEventListener('download-progress-update', handleProgressUpdate as any);
        };
    }, [videoInfo.title, t, navigate]);

    const handleDownload = async () => {
        setIsDownloading(true);
        setDownloadProgress(null);

        const options = {
            ...downloadOptions,
            startTime: isTrimmed ? trimRange[0] : undefined,
            endTime: isTrimmed ? trimRange[1] : undefined,
        };

        onDownload(options);
        toast.success(t("msgDownloadStarted"));
    };

    const getEstimatedFileSize = () => {
        const duration = isTrimmed ? (trimRange[1] - trimRange[0]) : videoInfo.duration;
        const qualityMultiplier = {
            '4K': 50, '1440p': 25, '1080p': 15, '720p': 8, '480p': 4,
            '360p': 2, '240p': 1, '144p': 0.5, 'tiny': 0.3, 'best': 15, 'worst': 1
        };

        const multiplier = qualityMultiplier[downloadOptions.quality as keyof typeof qualityMultiplier] || 15;
        const estimatedBytes = duration * multiplier * 1024 * 1024;
        return formatFileSize(estimatedBytes);
    };

    return (
        <div className="container mx-auto max-w-6xl space-y-8 p-6">
            <Card className="p-0 border-0 shadow-xl overflow-hidden">
                <div className="relative">
                    <AspectRatio ratio={16 / 9} className="bg-black">
                        <video
                            ref={videoRef}
                            className="w-full h-full object-cover"
                            src={videoInfo.bestVideoFormat?.url || videoInfo.formats.find(f => f.hasVideo && f.url)?.url}
                            poster={videoInfo.thumbnails.at(-1)?.url}
                            onTimeUpdate={handleTimeUpdate}
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    videoRef.current.currentTime = trimRange[0];
                                }
                            }}
                        />

                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40 opacity-0 hover:opacity-100 transition-opacity duration-300">
                            <div className="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/60 to-transparent">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-white font-semibold text-lg leading-tight line-clamp-2 mb-2">
                                            {videoInfo.title}
                                        </h2>
                                        <div className="flex items-center gap-3 mb-3">
                                            <Avatar className="h-8 w-8 ring-2 ring-white/20">
                                                <AvatarImage src={videoInfo.channel.thumbnail} alt={videoInfo.channel.name} />
                                                <AvatarFallback className="text-sm font-semibold text-black">
                                                    {videoInfo.channel.name?.[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-medium">{videoInfo.channel.name}</span>
                                                {videoInfo.channel.verified && (
                                                    <CheckCircle2 className="h-4 w-4 text-white" />
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 text-sm text-white/80">
                                            <span>{videoInfo.viewsFormatted} views</span>
                                            <span>•</span>
                                            <span>{videoInfo.uploadDate}</span>
                                            {isTrimmed && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-yellow-300 font-medium">
                                                        Clip: {formatTime(trimRange[1] - trimRange[0])}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex items-center gap-4">
                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0"
                                        onClick={seekToStart}
                                    >
                                        <SkipBack className="h-6 w-6 text-white" />
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0"
                                        onClick={togglePlayPause}
                                    >
                                        {isPlaying ? (
                                            <Pause className="h-8 w-8 text-white" fill="white" />
                                        ) : (
                                            <Play className="h-8 w-8 text-white" fill="white" />
                                        )}
                                    </Button>

                                    <Button
                                        variant="secondary"
                                        size="icon"
                                        className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border-0"
                                        onClick={seekToEnd}
                                    >
                                        <SkipForward className="h-6 w-6 text-white" />
                                    </Button>
                                </div>
                            </div>

                            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 text-white/90 text-sm">
                                        <Clock className="h-4 w-4" />
                                        <span className="font-mono">
                                            {formatTime(currentTime)} / {formatTime(videoInfo.duration)}
                                        </span>
                                    </div>
                                    <div className="flex-1" />
                                    <div className="flex items-center gap-3 text-white/80 text-sm">
                                        <div className="flex items-center gap-1">
                                            <Eye className="h-4 w-4" />
                                            <span>{videoInfo.viewsFormatted}</span>
                                        </div>
                                        {videoInfo.isLive && (
                                            <Badge variant="destructive" className="animate-pulse text-xs">
                                                • LIVE
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {videoInfo.isLive && (
                            <div className="absolute bottom-4 right-4">
                                <Badge variant="destructive" className="animate-pulse">
                                    • LIVE
                                </Badge>
                            </div>
                        )}
                    </AspectRatio>

                    <div className="p-6 bg-muted/30 border-t">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Scissors className="h-5 w-5 text-primary" />
                                    <Label className="text-base font-semibold">Trim Video</Label>
                                </div>
                                <div className="flex items-center gap-2 font-mono text-sm bg-background px-3 py-1 rounded-lg border">
                                    <span className="text-primary font-semibold">{formatTime(trimRange[0])}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="text-primary font-semibold">{formatTime(trimRange[1])}</span>
                                </div>
                            </div>

                            <div className="relative">
                                <Slider
                                    value={trimRange}
                                    onValueChange={handleTrimRangeChange}
                                    max={videoInfo.duration}
                                    step={1}
                                    className="w-full"
                                />
                                <div
                                    className="absolute top-0 w-1 h-6 bg-yellow-500 rounded-full transform -translate-x-1/2 pointer-events-none"
                                    style={{
                                        left: `${(currentTime / videoInfo.duration) * 100}%`,
                                        top: '-2px'
                                    }}
                                />
                                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                                    <span>0:00</span>
                                    <span className="text-yellow-600 font-medium">{formatTime(currentTime)}</span>
                                    <span>{formatTime(videoInfo.duration)}</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setTrimRange([0, videoInfo.duration])}
                                    disabled={!isTrimmed}
                                >
                                    Reset Trim
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={seekToStart}
                                >
                                    Go to Start
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={seekToEnd}
                                >
                                    Go to End
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <Card className="bg-muted/30 border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Settings className="h-5 w-5 text-primary" />
                            </div>
                            Quality & Format
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <Label className="text-base font-medium flex items-center gap-2">
                                <Zap className="h-4 w-4" />
                                Video Quality
                            </Label>
                            <Select
                                value={downloadOptions.quality}
                                onValueChange={(quality) => setDownloadOptions(prev => ({ ...prev, quality }))}
                            >
                                <SelectTrigger className="h-12">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {videoInfo.availableQualities.map((quality) => (
                                        <SelectItem key={quality} value={quality}>
                                            <div className="flex items-center gap-3 py-1">
                                                {quality === 'best' && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        Recommended
                                                    </Badge>
                                                )}
                                                <span className="font-medium">{quality}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-base font-medium flex items-center gap-2">
                                <FileVideo className="h-4 w-4" />
                                File Format
                            </Label>
                            <Select
                                value={downloadOptions.format}
                                onValueChange={(format: 'mp4' | 'webm' | 'mkv' | 'mp3' | 'm4a' | 'opus') =>
                                    setDownloadOptions(prev => ({ ...prev, format }))
                                }
                            >
                                <SelectTrigger className="h-12">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mp4">
                                        <div className="flex items-center gap-3 py-1">
                                            <Badge variant="secondary" className="text-xs">
                                                Most Compatible
                                            </Badge>
                                            <span className="font-medium">MP4</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="webm">
                                        <span className="font-medium">WebM</span>
                                    </SelectItem>
                                    <SelectItem value="mkv">
                                        <span className="font-medium">MKV</span>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="p-6 rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-semibold text-lg">Estimated Size</p>
                                    <p className="text-sm text-muted-foreground">
                                        {isTrimmed ? 'Trimmed clip size' : 'Full video size'}
                                    </p>
                                </div>
                                <Badge variant="outline" className="text-xl font-mono px-4 py-2 bg-background">
                                    {getEstimatedFileSize()}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Download className="h-5 w-5 text-primary" />
                            </div>
                            Download Options
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Download Options */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Subtitles className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Download Subtitles</p>
                                        <p className="text-sm text-muted-foreground">Include subtitle files</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={downloadOptions.downloadSubtitles}
                                    onCheckedChange={(checked) =>
                                        setDownloadOptions(prev => ({ ...prev, downloadSubtitles: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <ImageIcon className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Download Thumbnail</p>
                                        <p className="text-sm text-muted-foreground">Save video thumbnail</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={downloadOptions.downloadThumbnail}
                                    onCheckedChange={(checked) =>
                                        setDownloadOptions(prev => ({ ...prev, downloadThumbnail: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-lg bg-primary/10">
                                        <Info className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="font-medium">Save Metadata</p>
                                        <p className="text-sm text-muted-foreground">Include video information</p>
                                    </div>
                                </div>
                                <Switch
                                    checked={downloadOptions.saveMetadata}
                                    onCheckedChange={(checked) =>
                                        setDownloadOptions(prev => ({ ...prev, saveMetadata: checked }))
                                    }
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {downloadProgress && (
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-primary/10">
                                <Download className="h-5 w-5 text-primary animate-pulse" />
                            </div>
                            Download Progress
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="font-medium">Progress</span>
                                <span className="font-mono text-lg">{downloadProgress.progress}%</span>
                            </div>
                            <Progress value={downloadProgress.progress} className="h-3" />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="p-4 rounded-xl bg-muted/30 text-center">
                                <p className="text-sm text-muted-foreground mb-1">Speed</p>
                                <p className="font-semibold text-lg">{downloadProgress.speed}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted/30 text-center">
                                <p className="text-sm text-muted-foreground mb-1">ETA</p>
                                <p className="font-semibold text-lg">{downloadProgress.eta}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-muted/30 text-center">
                                <p className="text-sm text-muted-foreground mb-1">Size</p>
                                <p className="font-semibold text-lg">{downloadProgress.size}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-end">
                <Button
                    variant="outline"
                    onClick={onReset}
                    disabled={isDownloading}
                    className="h-12 px-8"
                >
                    <X className="h-4 w-4 mr-2" />
                    Reset
                </Button>
                <Button
                    onClick={handleDownload}
                    disabled={isDownloading}
                    className="h-12 px-8 gap-3 text-lg font-semibold"
                    size="lg"
                >
                    <Download className="h-5 w-5" />
                    {isDownloading ? 'Downloading...' : (isTrimmed ? 'Download Clip' : 'Download Video')}
                </Button>
            </div>
        </div>
    );
} 