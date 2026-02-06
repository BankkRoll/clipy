/**
 * Clipy - Main Process Entry Point
 *
 * This is the Electron main process that handles:
 * - Window creation and management
 * - IPC handler registration
 * - Custom protocol for secure local file access
 * - Security policies (navigation, permissions, etc.)
 */

import { BrowserWindow, app, net, protocol, screen, session } from 'electron'
import { startStreamingProxy, stopStreamingProxy } from './services/streaming-proxy'

import { ConfigManager } from './utils/config'
import { Logger } from './utils/logger'
import type { WindowState } from './types/system'
import path from 'path'
import { pathToFileURL } from 'url'
import { setupCoreHandlers } from './ipc/core-handlers'
import { setupDownloadHandlers } from './ipc/download-handlers'
import { setupVideoHandlers } from './ipc/video-handlers'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

const logger = Logger.getInstance()
const configManager = ConfigManager.getInstance()
const inDevelopment = process.env.NODE_ENV === 'development'

logger.debug('Main process initializing')

// Register custom protocol as privileged BEFORE app is ready
// This is required for the protocol to work with media streaming, fetch, etc.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipy-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true, // Required for video/audio streaming
      bypassCSP: false, // Don't bypass CSP, we've added it to the policy
    },
  },
])

logger.debug('Protocol schemes registered')

/**
 * Retrieves saved window state from config, with validation.
 * Falls back to defaults if saved position is off-screen (e.g., monitor was disconnected).
 */
function getWindowState(): WindowState {
  const defaultState: WindowState = {
    width: 1200,
    height: 800,
    isMaximized: false,
  }

  try {
    const savedState = configManager.get('windowState') as WindowState | undefined
    if (savedState) {
      // Validate the saved state is within current screen bounds
      const displays = screen.getAllDisplays()
      const isValidPosition =
        savedState.x !== undefined &&
        savedState.y !== undefined &&
        displays.some(display => {
          const bounds = display.bounds
          return (
            savedState.x! >= bounds.x &&
            savedState.x! < bounds.x + bounds.width &&
            savedState.y! >= bounds.y &&
            savedState.y! < bounds.y + bounds.height
          )
        })

      return {
        width: savedState.width || defaultState.width,
        height: savedState.height || defaultState.height,
        x: isValidPosition ? savedState.x : undefined,
        y: isValidPosition ? savedState.y : undefined,
        isMaximized: savedState.isMaximized || false,
      }
    }
  } catch (error) {
    logger.warn('Failed to load window state, using defaults', error as Error)
  }

  return defaultState
}

/**
 * Persists current window bounds to config.
 * Skips saving position when maximized (we only care about the maximized flag then).
 */
function saveWindowState(window: BrowserWindow): void {
  try {
    const isMaximized = window.isMaximized()
    const bounds = window.getBounds()

    const state: WindowState = {
      x: isMaximized ? undefined : bounds.x,
      y: isMaximized ? undefined : bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    }

    configManager.set('windowState', state)
  } catch (error) {
    logger.warn('Failed to save window state', error as Error)
  }
}

/**
 * Sets up CORS bypass for YouTube/Google Video streaming URLs.
 * This allows the renderer to directly fetch video streams without a proxy server.
 *
 * Why this approach:
 * - Node.js proxy servers get "socket hang up" errors from googlevideo.com (known issue)
 * - Electron's webRequest API intercepts at the browser level, before CORS checks
 * - More reliable than proxying - requests go directly to Google's servers
 *
 * @see https://github.com/nodejs/help/issues/1837 (Node.js socket hangup with Google)
 * @see https://repalash.com/blog/electron-app-cors-bypass.html
 */
function setupYouTubeCORSBypass(win: BrowserWindow): void {
  const youtubeFilter = {
    urls: ['*://*.googlevideo.com/*', '*://*.youtube.com/*', '*://*.ytimg.com/*', '*://*.ggpht.com/*'],
  }

  // Modify outgoing request headers to look like a legitimate browser request
  win.webContents.session.webRequest.onBeforeSendHeaders(youtubeFilter, (details, callback) => {
    const headers = { ...details.requestHeaders }

    // Set Origin and Referer to YouTube (required by googlevideo.com)
    headers['Origin'] = 'https://www.youtube.com'
    headers['Referer'] = 'https://www.youtube.com/'

    // Ensure we have a proper User-Agent
    if (!headers['User-Agent']) {
      headers['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }

    // Remove Sec-Fetch headers that might cause issues (optional, for stricter servers)
    // These headers can reveal that the request is cross-origin
    delete headers['Sec-Fetch-Site']
    delete headers['Sec-Fetch-Mode']
    delete headers['Sec-Fetch-Dest']

    callback({ requestHeaders: headers })
  })

  // Inject CORS headers into responses from YouTube/Google Video
  win.webContents.session.webRequest.onHeadersReceived(youtubeFilter, (details, callback) => {
    const responseHeaders = { ...details.responseHeaders }

    // Add permissive CORS headers
    responseHeaders['Access-Control-Allow-Origin'] = ['*']
    responseHeaders['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS']
    responseHeaders['Access-Control-Allow-Headers'] = ['Range, Content-Type, Origin, Referer']
    responseHeaders['Access-Control-Expose-Headers'] = ['Content-Length, Content-Range, Accept-Ranges']

    // Handle preflight OPTIONS requests
    if (details.method === 'OPTIONS') {
      callback({
        responseHeaders,
        statusLine: 'HTTP/1.1 200 OK',
      })
      return
    }

    callback({ responseHeaders })
  })

  logger.info('CORS proxy running', { filters: youtubeFilter.urls })
}

/**
 * Creates the main application window with security settings and event handlers.
 * Sets up navigation restrictions, permission handling, and IPC channels.
 */
function createWindow() {
  const preload = path.join(__dirname, 'preload.js')
  const windowState = getWindowState()

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true, // Enable sandbox for additional security
      webSecurity: true, // Explicitly enable web security (default, but explicit is better)
      allowRunningInsecureContent: false, // Block mixed content
      preload: preload,
    },
    titleBarStyle: 'hidden',
  })

  // Restore maximized state if previously maximized
  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  // Debounced save to avoid writing to disk on every pixel change
  let saveTimeout: NodeJS.Timeout | null = null
  const debouncedSave = () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => saveWindowState(mainWindow), 500)
  }

  // Persist window state on close/resize/move for next launch
  mainWindow.on('close', () => {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveWindowState(mainWindow)
  })
  mainWindow.on('resize', () => {
    if (!mainWindow.isMaximized()) {
      debouncedSave()
    }
  })
  mainWindow.on('move', () => {
    if (!mainWindow.isMaximized()) {
      debouncedSave()
    }
  })

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    const currentUrl = mainWindow.webContents.getURL()

    // Allow navigation within the app (file:// protocol or dev server)
    if (parsedUrl.protocol === 'file:') {
      return // Allow file:// navigation
    }

    // In development, allow navigation to the Vite dev server
    if (inDevelopment && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const devServerUrl = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      if (parsedUrl.origin === devServerUrl.origin) {
        return // Allow dev server navigation
      }
    }

    // Block all other navigation (external URLs)
    logger.warn('Blocked navigation to external URL', { url: navigationUrl, from: currentUrl })
    event.preventDefault()
  })

  // Security: Prevent opening new windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    logger.warn('Blocked attempt to open new window', { url })
    // Optionally open in default browser instead:
    // shell.openExternal(url)
    return { action: 'deny' }
  })

  // Security: Block permission requests (camera, microphone, etc.)
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['clipboard-read', 'clipboard-write', 'fullscreen', 'window-management']

    if (allowedPermissions.includes(permission)) {
      callback(true)
    } else {
      logger.warn('Blocked permission request', { permission })
      callback(false)
    }
  })

  // Register all IPC handlers for renderer communication
  setupCoreHandlers()
  setupDownloadHandlers()
  setupVideoHandlers()

  // Setup CORS bypass for YouTube streaming - allows direct fetch from googlevideo.com
  // This is more reliable than a proxy server (which gets socket hangup errors)
  setupYouTubeCORSBypass(mainWindow)

  // Load the app - dev server in development, built files in production
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  mainWindow.show()

  logger.info('Main window created successfully', {
    sandbox: true,
    webSecurity: true,
    windowState: { width: windowState.width, height: windowState.height },
  })
}

app.whenReady().then(() => {
  logger.info('Application ready', { userDataPath: app.getPath('userData') })

  // Register custom protocol for serving local files safely
  // This allows the renderer to load local files (thumbnails, videos) without CORS issues
  protocol.handle('clipy-file', async request => {
    try {
      // Extract the file path from the URL
      // clipy-file:///C:/path/to/file.jpg -> C:/path/to/file.jpg
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)

      // Handle platform-specific path quirks
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\/+/, '') // strip leading slashes from /C:/path
        if (/^[a-zA-Z]:(?![/\\])/.test(filePath)) {
          filePath = filePath.replace(/^([a-zA-Z]:)/, '$1/') // ensure C:/ not C:
        }
      } else {
        filePath = '/' + filePath.replace(/^\/+/, '') // normalize to single leading slash
      }

      const normalizedFilePath = path.normalize(filePath)

      // Security: Only allow access to specific directories
      const config = configManager.getAll()
      const allowedBasePaths = [
        app.getPath('userData'),
        app.getPath('downloads'),
        path.join(process.cwd(), 'resources'),
        // Also allow the configured download path
        config.download?.downloadPath || app.getPath('downloads'),
      ].filter(Boolean) as string[]

      // Windows paths are case-insensitive
      const normalizeForComparison = (p: string): string => {
        const normalized = path.normalize(p)
        return process.platform === 'win32' ? normalized.toLowerCase() : normalized
      }

      const normalizedFilePathForCompare = normalizeForComparison(normalizedFilePath)

      const isAllowed = allowedBasePaths.some(basePath => {
        const normalizedBasePath = normalizeForComparison(basePath)

        // Match full path segments to avoid /downloads/Clipy matching /downloads/ClipyOther
        if (normalizedFilePathForCompare === normalizedBasePath) {
          return true
        }

        // Check subdirectories (ensure trailing sep for proper prefix matching)
        const basePathWithSep = normalizedBasePath.endsWith(path.sep)
          ? normalizedBasePath
          : normalizedBasePath + path.sep

        return normalizedFilePathForCompare.startsWith(basePathWithSep)
      })

      if (!isAllowed) {
        logger.warn('Blocked file access outside allowed paths', {
          filePath: normalizedFilePath,
          normalizedForCompare: normalizedFilePathForCompare,
          allowedPaths: allowedBasePaths,
        })
        return new Response('Forbidden', { status: 403 })
      }

      const fileUrl = pathToFileURL(normalizedFilePath).href
      return net.fetch(fileUrl)
    } catch (error) {
      logger.error('Error serving file via clipy-file protocol', error as Error)
      return new Response('Not Found', { status: 404 })
    }
  })

  logger.info('Registered clipy-file protocol for local file access')

  // Start streaming proxy - proxies YouTube streams to bypass CORS for video preview
  startStreamingProxy()
    .then(port => {
      logger.info('Streaming proxy started for YouTube preview', { port })
    })
    .catch(error => {
      logger.warn('Failed to start streaming proxy (YouTube preview will not work)', error)
    })

  configManager.getAll()
  createWindow()
})

// Clean up resources when all windows are closed
app.on('window-all-closed', () => {
  stopStreamingProxy().catch(error => {
    logger.warn('Error stopping streaming proxy', error)
  })

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Focus existing window when a second instance tries to launch
app.on('second-instance', () => {
  const windows = BrowserWindow.getAllWindows()
  if (windows.length > 0) {
    const mainWindow = windows[0]
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// macOS: re-create window when dock icon is clicked and no windows exist
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
