/**
 * Core IPC Handlers
 * Handles core system operations: window management, shell operations, and theming
 */

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { createErrorResponse, createSuccessResponse } from '../types/api'

import { ConfigManager } from '../utils/config'
import { IPC_CHANNELS } from './channels'
import { Logger } from '../utils/logger'
import type { ThemeMode } from '../types/system'

const logger = Logger.getInstance()
const configManager = ConfigManager.getInstance()

/**
 * Window Management Handlers
 */
export function setupWindowHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow()
      if (window) {
        window.minimize()
        return createSuccessResponse(undefined)
      }
      return createErrorResponse('No focused window found', 'WINDOW_NOT_FOUND')
    } catch (error) {
      logger.error('Failed to minimize window', error as Error)
      return createErrorResponse('Failed to minimize window', 'WINDOW_MINIMIZE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_MAXIMIZE, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow()
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize()
        } else {
          window.maximize()
        }
        return createSuccessResponse(undefined)
      }
      return createErrorResponse('No focused window found', 'WINDOW_NOT_FOUND')
    } catch (error) {
      logger.error('Failed to toggle maximize window', error as Error)
      return createErrorResponse('Failed to toggle maximize window', 'WINDOW_MAXIMIZE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow()
      if (window) {
        window.close()
        return createSuccessResponse(undefined)
      }
      return createErrorResponse('No focused window found', 'WINDOW_NOT_FOUND')
    } catch (error) {
      logger.error('Failed to close window', error as Error)
      return createErrorResponse('Failed to close window', 'WINDOW_CLOSE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, async () => {
    try {
      const window = BrowserWindow.getFocusedWindow()
      const isMaximized = window?.isMaximized() ?? false
      return createSuccessResponse(isMaximized)
    } catch (error) {
      logger.error('Failed to check window maximized state', error as Error)
      return createErrorResponse('Failed to check window state', 'WINDOW_STATE_CHECK_FAILED')
    }
  })
}

/**
 * Shell Operation Handlers
 */
export function setupShellHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SHELL_OPEN_PATH, async (_event, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return createErrorResponse('Invalid file path provided', 'INVALID_FILE_PATH')
      }

      await shell.openPath(filePath)
      logger.info('Opened file in default application', { filePath })
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to open file path', error as Error, { filePath })
      return createErrorResponse('Failed to open file', 'SHELL_OPEN_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, async (_event, filePath: string) => {
    try {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        return createErrorResponse('Invalid file path provided', 'INVALID_FILE_PATH')
      }

      await shell.showItemInFolder(filePath)
      logger.info('Showed item in folder', { filePath })
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to show item in folder', error as Error, { filePath })
      return createErrorResponse('Failed to show item in folder', 'SHELL_SHOW_FAILED')
    }
  })
}

/**
 * Theme Management Handlers
 */
export function setupThemeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.THEME_GET, async () => {
    try {
      const theme = configManager.get('theme')
      return createSuccessResponse(theme)
    } catch (error) {
      logger.error('Failed to get theme', error as Error)
      return createErrorResponse('Failed to get theme', 'THEME_GET_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SET, async (_event, theme: ThemeMode) => {
    try {
      if (!['light', 'dark', 'system'].includes(theme)) {
        return createErrorResponse('Invalid theme mode', 'INVALID_THEME_MODE')
      }

      configManager.set('theme', theme)

      // Broadcast theme change to all windows
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('theme-changed', theme)
        }
      })

      logger.info('Theme changed', { theme })
      return createSuccessResponse(undefined)
    } catch (error) {
      logger.error('Failed to set theme', error as Error, { theme })
      return createErrorResponse('Failed to set theme', 'THEME_SET_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.THEME_TOGGLE, async () => {
    try {
      const currentTheme = configManager.get('theme')
      const newTheme: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark'

      configManager.set('theme', newTheme)

      // Broadcast theme change
      const windows = BrowserWindow.getAllWindows()
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('theme-changed', newTheme)
        }
      })

      logger.info('Theme toggled', { from: currentTheme, to: newTheme })
      return createSuccessResponse(newTheme)
    } catch (error) {
      logger.error('Failed to toggle theme', error as Error)
      return createErrorResponse('Failed to toggle theme', 'THEME_TOGGLE_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.THEME_SYSTEM, async () => {
    try {
      // This would detect system theme - for now just return current theme
      const currentTheme = configManager.get('theme')
      return createSuccessResponse(currentTheme)
    } catch (error) {
      logger.error('Failed to get system theme', error as Error)
      return createErrorResponse('Failed to get system theme', 'THEME_SYSTEM_FAILED')
    }
  })
}

/**
 * System Information Handlers
 */
export function setupSystemHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SYSTEM_INFO, async () => {
    try {
      const systemInfo = {
        appName: app.getName(),
        appVersion: app.getVersion(),
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        packageInfo: null, // Could load package.json here if needed
      }
      return createSuccessResponse(systemInfo)
    } catch (error) {
      logger.error('Failed to get system info', error as Error)
      return createErrorResponse('Failed to get system info', 'SYSTEM_INFO_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_OPEN_DIALOG, async (_event, options) => {
    try {
      const result = await dialog.showOpenDialog(options || {})
      return createSuccessResponse(result.filePaths[0] || null)
    } catch (error) {
      logger.error('Failed to open dialog', error as Error)
      return createErrorResponse('Failed to open dialog', 'DIALOG_OPEN_FAILED')
    }
  })

  ipcMain.handle(IPC_CHANNELS.SYSTEM_SAVE_DIALOG, async (_event, options) => {
    try {
      const result = await dialog.showSaveDialog(options || {})
      return createSuccessResponse(result)
    } catch (error) {
      logger.error('Failed to save dialog', error as Error)
      return createErrorResponse('Failed to save dialog', 'DIALOG_SAVE_FAILED')
    }
  })
}

/**
 * Setup all core handlers
 */
export function setupCoreHandlers(): void {
  logger.info('Setting up core IPC handlers')

  setupWindowHandlers()
  setupShellHandlers()
  setupThemeHandlers()
  setupSystemHandlers()

  logger.info('Core IPC handlers initialized successfully')
}
