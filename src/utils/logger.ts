/**
 * Logger Utility
 * Structured logging with file output and console output
 */

import { WriteStream, createWriteStream } from 'fs'

import { PlatformUtils } from './platform'
import { join } from 'path'

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  context?: Record<string, any>
  error?: Error
}

export class Logger {
  private static instance: Logger
  private logLevel: LogLevel = LogLevel.INFO
  private logsDir: string
  private currentLogFile: string
  private writeStream: WriteStream | null = null
  private logBuffer: LogEntry[] = []
  private maxBufferSize = 100
  private isInitialized = false
  private platform = PlatformUtils.getInstance()

  private constructor() {
    this.logsDir = join(this.platform.getAppDataDir('clipy'), 'logs')
    this.currentLogFile = this.generateLogFileName()
    this.initializeLogger()
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * Initialize logger
   */
  private initializeLogger(): void {
    try {
      // Ensure logs directory exists
      this.platform.ensureDirectory(this.logsDir)

      // Create write stream
      this.writeStream = createWriteStream(this.currentLogFile, {
        flags: 'a',
        encoding: 'utf8',
      })

      this.writeStream.on('error', error => {
        console.error('Logger write stream error:', error)
      })

      // Flush any buffered logs
      this.flushBuffer()

      this.isInitialized = true

      // Log initialization
      this.writeToStream({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Logger initialized',
        context: { logFile: this.currentLogFile },
      })
    } catch (error) {
      console.error('Failed to initialize logger:', error)
      // Fallback to console only
    }
  }

  /**
   * Set log level
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * Info level logging
   */
  info(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * Error level logging
   */
  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, { ...context, error: error?.message, stack: error?.stack })
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: Record<string, any>): void {
    if (level < this.logLevel) {
      return
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message: this.formatMessage(message, context),
      context,
    }

    // Console output
    this.writeToConsole(entry)

    // File output
    this.writeToFile(entry)
  }

  /**
   * Write to console
   */
  private writeToConsole(entry: LogEntry): void {
    const color = this.getLogColor(entry.level)
    const reset = '\x1b[0m'
    const output = `${color}[${entry.timestamp}] [${entry.level}] ${entry.message}${reset}`

    switch (entry.level) {
      case 'ERROR':
        console.error(output)
        break
      case 'WARN':
        console.warn(output)
        break
      case 'DEBUG':
        console.debug(output)
        break
      default:
        console.log(output)
    }
  }

  /**
   * Write to file
   */
  private writeToFile(entry: LogEntry): void {
    if (this.writeStream && this.isInitialized) {
      try {
        this.writeStream.write(`${JSON.stringify(entry)}\n`)
      } catch (error) {
        // If file writing fails, buffer the log
        this.bufferLog(entry)
      }
    } else {
      // Buffer logs until initialized
      this.bufferLog(entry)
    }
  }

  /**
   * Write directly to stream
   */
  private writeToStream(entry: LogEntry): void {
    if (this.writeStream) {
      try {
        this.writeStream.write(`${JSON.stringify(entry)}\n`)
      } catch (error) {
        console.error('Failed to write to log stream:', error)
      }
    }
  }

  /**
   * Buffer log entry
   */
  private bufferLog(entry: LogEntry): void {
    this.logBuffer.push(entry)

    if (this.logBuffer.length >= this.maxBufferSize) {
      // Prevent buffer overflow
      this.logBuffer.shift()
    }
  }

  /**
   * Flush buffered logs
   */
  private flushBuffer(): void {
    while (this.logBuffer.length > 0) {
      const entry = this.logBuffer.shift()!
      this.writeToStream(entry)
    }
  }

  /**
   * Format log message
   */
  private formatMessage(message: string, context?: Record<string, any>): string {
    let formatted = message

    if (context) {
      // Add context as formatted string
      const contextStr = Object.entries(context)
        .map(([key, value]) => `${key}=${this.formatValue(value)}`)
        .join(' ')
      formatted += ` | ${contextStr}`
    }

    return formatted
  }

  /**
   * Format value for logging
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return String(value)
    }

    if (typeof value === 'string') {
      return value
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    if (value instanceof Error) {
      return `${value.name}: ${value.message}`
    }

    if (Array.isArray(value)) {
      return `[${value.map(v => this.formatValue(v)).join(', ')}]`
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return '[object Object]'
      }
    }

    return String(value)
  }

  /**
   * Get console color for log level
   */
  private getLogColor(level: string): string {
    switch (level) {
      case 'ERROR':
        return '\x1b[31m' // Red
      case 'WARN':
        return '\x1b[33m' // Yellow
      case 'INFO':
        return '\x1b[36m' // Cyan
      case 'DEBUG':
        return '\x1b[35m' // Magenta
      default:
        return '\x1b[0m' // Reset
    }
  }

  /**
   * Generate log file name
   */
  private generateLogFileName(): string {
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
    return join(this.logsDir, `clipy-${timestamp}.log`)
  }

  /**
   * Rotate log file (create new file)
   */
  rotateLogFile(): void {
    if (this.writeStream) {
      this.writeStream.end()
    }

    this.currentLogFile = this.generateLogFileName()
    this.initializeLogger()
  }

  /**
   * Get current log file path
   */
  getCurrentLogFile(): string {
    return this.currentLogFile
  }

  /**
   * Get logs directory
   */
  getLogsDirectory(): string {
    return this.logsDir
  }

  /**
   * Cleanup old log files
   */
  cleanupOldLogs(maxAge: number = 30 * 24 * 60 * 60 * 1000): void {
    // This would clean up old log files - implementation can be added later
    this.info('Log cleanup requested', { maxAge })
  }

  /**
   * Flush any pending logs and close
   */
  close(): void {
    this.flushBuffer()
    if (this.writeStream) {
      this.writeStream.end()
      this.writeStream = null
    }
  }
}
