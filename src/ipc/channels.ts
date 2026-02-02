/**
 * IPC Channel Constants
 * Single source of truth for all Inter-Process Communication channels
 */

/**
 * Allowed broadcast channels for renderer process event listeners.
 * Only these channels can be listened to via contextBridge.
 * This is a security measure to prevent unauthorized channel listening.
 */
export const ALLOWED_BROADCAST_CHANNELS = [
  'download-progress-update',
  'download-completed',
  'download-failed',
  'download-deleted',
  'theme-changed',
] as const

export type AllowedBroadcastChannel = (typeof ALLOWED_BROADCAST_CHANNELS)[number]

export const IPC_CHANNELS = {
  // Core System Operations
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',

  // Theme Operations
  THEME_GET: 'theme:get',
  THEME_SET: 'theme:set',
  THEME_TOGGLE: 'theme:toggle',
  THEME_SYSTEM: 'theme:system',

  // Shell Operations
  SHELL_OPEN_PATH: 'shell:open-path',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',

  // Download Operations
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_DELETE: 'download:delete',
  DOWNLOAD_RETRY: 'download:retry',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_INFO: 'download:info',
  DOWNLOAD_STREAMING_INFO: 'download:streaming-info', // Get video info with streaming URL for editor preview

  // File Operations
  FILE_EXISTS: 'file:exists',
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',

  // Storage Operations
  STORAGE_LOAD: 'storage:load',
  STORAGE_SAVE: 'storage:save',
  STORAGE_CLEAR: 'storage:clear',

  // Configuration Operations
  CONFIG_GET: 'config:get',
  CONFIG_UPDATE: 'config:update',
  CONFIG_RESET: 'config:reset',

  // System Information
  SYSTEM_INFO: 'system:info',
  SYSTEM_OPEN_DIALOG: 'system:open-dialog',
  SYSTEM_SAVE_DIALOG: 'system:save-dialog',

  // Storage Management
  STORAGE_USAGE: 'storage:usage',
  STORAGE_PATHS: 'storage:paths',
  STORAGE_CLEANUP: 'storage:cleanup',

  // Video Processing
  VIDEO_PROCESS: 'video:process',
  VIDEO_PREVIEW: 'video:preview',
  VIDEO_TRIM: 'video:trim',
  VIDEO_INFO: 'video:info',

  // Streaming Proxy
  PROXY_GET_URL: 'proxy:get-url', // Get proxy URL for a video stream
  PROXY_STATUS: 'proxy:status', // Check if proxy is running
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
