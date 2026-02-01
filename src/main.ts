import { BrowserWindow, app } from 'electron'

import { ConfigManager } from './utils/config'
import { Logger } from './utils/logger'
import path from 'path'
import { setupCoreHandlers } from './ipc/core-handlers'
import { setupDownloadHandlers } from './ipc/download-handlers'

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

console.log('Initializing logger and config manager')
const logger = Logger.getInstance()
const configManager = ConfigManager.getInstance()
const inDevelopment = process.env.NODE_ENV === 'development'
console.log('Initialization complete')

function createWindow() {
  const preload = path.join(__dirname, 'preload.js')
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    titleBarStyle: 'hidden',
  })

  // Setup IPC handlers
  setupCoreHandlers()
  setupDownloadHandlers()

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  // Show the window after loading
  mainWindow.show()

  logger.info('Main window created successfully')
}

app.whenReady().then(() => {
  console.log('Application starting up')
  logger.info('Application starting up')
  console.log('Log files will be saved in:', app.getPath('userData'))
  logger.info('Log files will be saved in:', { path: app.getPath('userData') })

  // Ensure configuration is loaded
  console.log('Loading configuration')
  configManager.getAll()

  console.log('Creating window')
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
