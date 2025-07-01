import type { DownloadListData, DownloadProgress, VideoInfo } from './download';
import type {
    EditorExportData,
    EditorFileData,
    EditorMergeData,
    EditorProjectData,
    EditorSplitData,
    EditorTrimData
} from './editor';
import type { ThemeMode } from './theme';

export interface BaseResponse {
    success: boolean;
    timestamp: number;
}

export interface SuccessResponse<T = unknown> extends BaseResponse {
    success: true;
    data: T;
}

export interface ErrorResponse extends BaseResponse {
    success: false;
    error: string;
    code: string;
    retryable?: boolean;
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

export type DownloadStartResponse = ApiResponse<{ downloadId: string; message: string }>;
export type DownloadProgressResponse = ApiResponse<DownloadProgress | DownloadProgress[]>;
export type DownloadCancelResponse = ApiResponse<{ downloadId: string; message: string }>;
export type DownloadListResponse = ApiResponse<DownloadListData>;
export type VideoInfoResponse = ApiResponse<VideoInfo>;

export type EditorOpenResponse = ApiResponse<EditorFileData>;
export type EditorSaveResponse = ApiResponse<EditorProjectData>;
export type EditorExportResponse = ApiResponse<EditorExportData>;
export type EditorTrimResponse = ApiResponse<EditorTrimData>;
export type EditorSplitResponse = ApiResponse<EditorSplitData>;
export type EditorMergeResponse = ApiResponse<EditorMergeData>;

export type ThemeCurrentResponse = ApiResponse<ThemeMode>;
export type ThemeToggleResponse = ApiResponse<boolean>;
export type ThemeSetResponse = ApiResponse<void>;

export type WindowActionResponse = ApiResponse<void>;

export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
    return {
        success: true,
        data,
        timestamp: Date.now()
    };
}

export function createErrorResponse(
    error: string,
    code: string,
    retryable?: boolean
): ErrorResponse {
    return {
        success: false,
        error,
        code,
        retryable,
        timestamp: Date.now()
    };
}

export function isSuccessResponse<T>(response: ApiResponse<T>): response is SuccessResponse<T> {
    return response.success === true;
}

export function isErrorResponse<T>(response: ApiResponse<T>): response is ErrorResponse {
    return response.success === false;
} 