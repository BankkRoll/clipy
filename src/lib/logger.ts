/**
 * Logger utility that respects debugMode setting
 *
 * - INFO level (always on): Essential startup info, ASCII banner
 * - DEBUG level (when debugMode enabled): Verbose logging throughout app
 * - WARN/ERROR: Always logged regardless of debug mode
 */

import { useSettingsStore } from "@/stores/settingsStore";

const ASCII_BANNER = `
   ██████╗██╗     ██╗██████╗ ██╗   ██╗
  ██╔════╝██║     ██║██╔══██╗╚██╗ ██╔╝
  ██║     ██║     ██║██████╔╝ ╚████╔╝
  ██║     ██║     ██║██╔═══╝   ╚██╔╝
  ╚██████╗███████╗██║██║        ██║
   ╚═════╝╚══════╝╚═╝╚═╝        ╚═╝
`;

/**
 * Get debugMode from store (non-reactive for use outside React)
 */
const isDebugMode = (): boolean => {
  try {
    return useSettingsStore.getState().settings.advanced.debugMode;
  } catch {
    return false;
  }
};

/**
 * Format timestamp for log messages
 */
const getTimestamp = (): string => {
  const now = new Date();
  return now.toLocaleTimeString("en-US", { hour12: false });
};

export const logger = {
  /**
   * Always logs (INFO level) - for essential startup info
   */
  info: (message: string, ...args: unknown[]): void => {
    console.log(`%c[Clipy]%c ${message}`, "color: #3b82f6; font-weight: bold", "color: inherit", ...args);
  },

  /**
   * Only logs when debugMode is enabled
   */
  debug: (prefix: string, message: string, ...args: unknown[]): void => {
    if (isDebugMode()) {
      console.log(
        `%c[${prefix}]%c ${getTimestamp()} ${message}`,
        "color: #8b5cf6; font-weight: bold",
        "color: #6b7280",
        ...args
      );
    }
  },

  /**
   * Always logs warnings
   */
  warn: (prefix: string, message: string, ...args: unknown[]): void => {
    console.warn(`[${prefix}] ${message}`, ...args);
  },

  /**
   * Always logs errors
   */
  error: (prefix: string, message: string, ...args: unknown[]): void => {
    console.error(`[${prefix}] ${message}`, ...args);
  },

  /**
   * Print startup banner (always shown)
   */
  banner: (version: string): void => {
    const debugMode = isDebugMode();

    console.log(
      `%c${ASCII_BANNER}`,
      "color: #3b82f6; font-weight: bold"
    );
    console.log(
      `%c  Version:%c ${version}`,
      "color: #6b7280",
      "color: inherit; font-weight: bold"
    );
    console.log(
      `%c  Platform:%c ${navigator.platform}`,
      "color: #6b7280",
      "color: inherit"
    );
    console.log(
      `%c  Debug Mode:%c ${debugMode ? "ON" : "OFF"}`,
      "color: #6b7280",
      debugMode ? "color: #22c55e; font-weight: bold" : "color: inherit"
    );
    console.log("");

    if (debugMode) {
      console.log(
        "%c[Clipy] Debug mode is enabled - verbose logging active",
        "color: #22c55e"
      );
      console.log("");
    }
  },

  /**
   * Log a group of related debug messages (only when debug mode enabled)
   */
  debugGroup: (prefix: string, title: string, data: Record<string, unknown>): void => {
    if (isDebugMode()) {
      console.groupCollapsed(`[${prefix}] ${title}`);
      Object.entries(data).forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
      });
      console.groupEnd();
    }
  },

  /**
   * Log performance timing (only when debug mode enabled)
   */
  time: (label: string): void => {
    if (isDebugMode()) {
      console.time(`[Perf] ${label}`);
    }
  },

  timeEnd: (label: string): void => {
    if (isDebugMode()) {
      console.timeEnd(`[Perf] ${label}`);
    }
  },
};

export default logger;
