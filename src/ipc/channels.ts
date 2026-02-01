/**
 * IPC Channel Constants
 * Single source of truth for all Inter-Process Communication channels
 */

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

  // Download Operations
  DOWNLOAD_START: 'download:start',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_DELETE: 'download:delete',
  DOWNLOAD_RETRY: 'download:retry',
  DOWNLOAD_PROGRESS: 'download:progress',
  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_INFO: 'download:info',

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
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
