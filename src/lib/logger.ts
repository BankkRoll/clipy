/* eslint-disable no-console -- This module is the sanctioned logging wrapper; it is the one place console is intended to be used. */
/**
 * Logger that respects the backend `advanced.debugMode` setting.
 *
 * - INFO level (always on): essential startup info, ASCII banner
 * - DEBUG level (when debug mode is on): verbose logging throughout the app
 * - WARN/ERROR: always logged
 *
 * Debug mode is pushed in by the settings hook whenever backend settings load
 * ({@link logger.setDebugMode}); until then it is off.
 */

const ASCII_BANNER = `
   ██████╗██╗     ██╗██████╗ ██╗   ██╗
  ██╔════╝██║     ██║██╔══██╗╚██╗ ██╔╝
  ██║     ██║     ██║██████╔╝ ╚████╔╝
  ██║     ██║     ██║██╔═══╝   ╚██╔╝
  ╚██████╗███████╗██║██║        ██║
   ╚═════╝╚══════╝╚═╝╚═╝        ╚═╝
`;

let debugMode = false;

const getTimestamp = (): string => new Date().toLocaleTimeString("en-US", { hour12: false });

/** Application logger. */
export const logger = {
  /** Enable or disable debug-level output (mirrors `advanced.debugMode`). */
  setDebugMode: (enabled: boolean): void => {
    debugMode = enabled;
  },

  /** Whether debug-level output is currently enabled. */
  isDebugMode: (): boolean => debugMode,

  /** Always logs (INFO level) - for essential startup info. */
  info: (message: string, ...args: unknown[]): void => {
    console.log(
      `%c[Clipy]%c ${message}`,
      "color: #3b82f6; font-weight: bold",
      "color: inherit",
      ...args
    );
  },

  /** Only logs when debug mode is enabled. */
  debug: (prefix: string, message: string, ...args: unknown[]): void => {
    if (!debugMode) return;
    console.log(
      `%c[${prefix}]%c ${getTimestamp()} ${message}`,
      "color: #8b5cf6; font-weight: bold",
      "color: #6b7280",
      ...args
    );
  },

  /** Always logs warnings. */
  warn: (prefix: string, message: string, ...args: unknown[]): void => {
    console.warn(`[${prefix}] ${message}`, ...args);
  },

  /** Always logs errors. */
  error: (prefix: string, message: string, ...args: unknown[]): void => {
    console.error(`[${prefix}] ${message}`, ...args);
  },

  /** Print the startup banner (always shown). */
  banner: (version: string): void => {
    console.log(`%c${ASCII_BANNER}`, "color: #3b82f6; font-weight: bold");
    console.log(`%c  Version:%c ${version}`, "color: #6b7280", "color: inherit; font-weight: bold");
    console.log(`%c  Platform:%c ${navigator.platform}`, "color: #6b7280", "color: inherit");
    console.log(
      `%c  Debug Mode:%c ${debugMode ? "ON" : "OFF"}`,
      "color: #6b7280",
      debugMode ? "color: #22c55e; font-weight: bold" : "color: inherit"
    );
    console.log("");

    if (debugMode) {
      console.log("%c[Clipy] Debug mode is enabled - verbose logging active", "color: #22c55e");
      console.log("");
    }
  },

  /** Log a group of related debug messages (only when debug mode is enabled). */
  debugGroup: (prefix: string, title: string, data: Record<string, unknown>): void => {
    if (!debugMode) return;
    console.groupCollapsed(`[${prefix}] ${title}`);
    Object.entries(data).forEach(([key, value]) => {
      console.log(`  ${key}:`, value);
    });
    console.groupEnd();
  },

  /** Start a performance timer (only when debug mode is enabled). */
  time: (label: string): void => {
    if (debugMode) console.time(`[Perf] ${label}`);
  },

  /** Stop a performance timer (only when debug mode is enabled). */
  timeEnd: (label: string): void => {
    if (debugMode) console.timeEnd(`[Perf] ${label}`);
  },
};

export default logger;
