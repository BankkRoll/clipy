/**
 * API Response Types
 * Standardized response shapes for IPC communication between main and renderer.
 */

import type { DownloadListData, DownloadProgress, VideoInfo } from './download'
import type { ThemeMode } from './system'

export interface BaseResponse {
  success: boolean
  timestamp: number
}

export interface SuccessResponse<T = unknown> extends BaseResponse {
  success: true
  data: T
}

export interface ErrorResponse extends BaseResponse {
  success: false
  error: string
  code: string
  retryable?: boolean
}

export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse

export type DownloadStartResponse = ApiResponse<{ downloadId: string; message: string }>
export type DownloadProgressResponse = ApiResponse<DownloadProgress | DownloadProgress[]>
export type DownloadCancelResponse = ApiResponse<{ downloadId: string; message: string }>
export type DownloadListResponse = ApiResponse<DownloadListData>
export type VideoInfoResponse = ApiResponse<VideoInfo>

export type ThemeCurrentResponse = ApiResponse<ThemeMode>
export type ThemeToggleResponse = ApiResponse<boolean>
export type ThemeSetResponse = ApiResponse<void>

export type WindowActionResponse = ApiResponse<void>

export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: Date.now(),
  }
}

export function createErrorResponse(error: string, code: string, retryable?: boolean): ErrorResponse {
  return {
    success: false,
    error,
    code,
    retryable,
    timestamp: Date.now(),
  }
}

export function isSuccessResponse<T>(response: ApiResponse<T>): response is SuccessResponse<T> {
  return response.success === true
}

export function isErrorResponse<T>(response: ApiResponse<T>): response is ErrorResponse {
  return response.success === false
}
