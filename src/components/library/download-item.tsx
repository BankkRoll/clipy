import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DownloadProgress } from "@/types/download";
import {
    AlertCircle,
    CheckCircle,
    Clock,
    Download,
    FileVideo,
    FolderOpen,
    MoreHorizontal,
    Play,
    X
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface DownloadItemProps {
  download: DownloadProgress;
  onCancel: (downloadId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case 'downloading':
      return <Download className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-pulse" />;
    case 'cancelled':
      return <X className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="default" className="bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600">{status}</Badge>;
    case 'failed':
      return <Badge variant="destructive">{status}</Badge>;
    case 'downloading':
      return <Badge variant="secondary" className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">{status}</Badge>;
    case 'cancelled':
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function DownloadItem({ download, onCancel }: DownloadItemProps) {
  const { t } = useTranslation();

  const handleOpenFile = async (filePath: string) => {
    try {
      toast.info(`Opening file: ${filePath}`);
    } catch (error) {
      toast.error(t('msgFileOpenFailed'));
    }
  };

  const handleOpenFolder = async (filePath: string) => {
    try {
      toast.info(`Opening folder containing: ${filePath}`);
    } catch (error) {
      toast.error(t('msgFolderOpenFailed'));
    }
  };

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-20 h-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
            <FileVideo className="h-6 w-6 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate text-base">{download.title}</h3>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  {getStatusIcon(download.status)}
                  {getStatusBadge(download.status)}
                  <span>•</span>
                  <span>{formatFileSize(download.totalBytes)}</span>
                  <span>•</span>
                  <span>{new Date(download.startTime).toLocaleDateString()}</span>
                </div>
                
                {download.status === 'downloading' && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('progress')}</span>
                      <span>{download.progress}%</span>
                    </div>
                    <Progress value={download.progress} className="w-full" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{download.speed}</span>
                      <span>{download.eta}</span>
                    </div>
                  </div>
                )}
                
                {download.status === 'failed' && download.error && (
                  <p className="text-sm text-destructive mt-2">{download.error.message}</p>
                )}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                {download.status === 'downloading' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(download.downloadId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
                
                {download.status === 'completed' && download.filePath && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenFile(download.filePath!)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenFolder(download.filePath!)}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </>
                )}
                
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 