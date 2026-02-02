/**
 * Clipy - Preload Script
 *
 * Runs in a sandboxed context before the renderer loads.
 * Sets up the secure contextBridge to expose electronAPI to the renderer.
 * This is the only bridge between renderer and main process.
 */

import { setupContextBridge } from './ipc/context-bridge'

setupContextBridge()
