/**
 * Cross-Platform Utilities
 * Handles all OS-specific operations and compatibility issues
 */

import { arch, cpus, freemem, homedir, hostname, platform, release, tmpdir, totalmem, uptime } from 'os'
import { basename, delimiter, extname, join, relative, sep } from 'path'
import { existsSync, mkdirSync, statSync } from 'fs'

import { Logger } from './logger'
import { spawnSync } from 'child_process'

// Import electron app conditionally
let electronApp: any = null
try {
  // eslint-disable-next-line
  electronApp = require('electron').app
} catch {
  // Not available in renderer process
}

export interface PlatformInfo {
  name: 'windows' | 'macos' | 'linux' | 'unknown'
  version: string
  arch: string
  isWindows: boolean
  isMacOS: boolean
  isLinux: boolean
  pathSeparator: string
  pathDelimiter: string
  homeDir: string
  tempDir: string
  isCaseSensitive: boolean
  hiddenFilePrefix: string
  executableExtension: string
}

export class PlatformUtils {
  private static instance: PlatformUtils
  private platformInfo: PlatformInfo
  private logger?: Logger

  private constructor() {
    this.platformInfo = this.detectPlatform()
  }

  private getLogger(): Logger {
    if (!this.logger) {
      this.logger = Logger.getInstance()
    }
    return this.logger
  }

  static getInstance(): PlatformUtils {
    if (!PlatformUtils.instance) {
      PlatformUtils.instance = new PlatformUtils()
    }
    return PlatformUtils.instance
  }

  /**
   * Detect and return comprehensive platform information
   */
  private detectPlatform(): PlatformInfo {
    const osPlatform = platform()
    const osArch = arch()

    let platformName: PlatformInfo['name'] = 'unknown'
    let isCaseSensitive = true
    let hiddenFilePrefix = ''
    let executableExtension = ''

    switch (osPlatform) {
      case 'win32':
        platformName = 'windows'
        isCaseSensitive = false
        executableExtension = '.exe'
        break
      case 'darwin':
        platformName = 'macos'
        isCaseSensitive = true
        hiddenFilePrefix = '.'
        break
      case 'linux':
        platformName = 'linux'
        isCaseSensitive = true
        hiddenFilePrefix = '.'
        break
      default:
        platformName = 'unknown'
        isCaseSensitive = true
        hiddenFilePrefix = '.'
    }

    return {
      name: platformName,
      version: process.version,
      arch: osArch,
      isWindows: platformName === 'windows',
      isMacOS: platformName === 'macos',
      isLinux: platformName === 'linux',
      pathSeparator: sep,
      pathDelimiter: delimiter,
      homeDir: homedir(),
      tempDir: tmpdir(),
      isCaseSensitive,
      hiddenFilePrefix,
      executableExtension,
    }
  }

  /**
   * Get current platform information
   */
  getPlatformInfo(): PlatformInfo {
    return { ...this.platformInfo }
  }

  /**
   * Normalize path for current platform
   */
  normalizePath(path: string): string {
    // Replace all path separators with platform-specific separator
    return path.replace(/[/\\]/g, this.platformInfo.pathSeparator)
  }

  /**
   * Join paths in a cross-platform way
   */
  joinPath(...paths: string[]): string {
    return join(...paths)
  }

  /**
   * Resolve executable path for current platform
   */
  resolveExecutable(baseName: string, searchPaths?: string[]): string | null {
    const extensions = this.platformInfo.isWindows
      ? [this.platformInfo.executableExtension, ''] // Try .exe first, then no extension
      : [''] // Unix systems don't need extensions

    const paths = searchPaths || this.getDefaultExecutablePaths(baseName)

    for (const basePath of paths) {
      for (const ext of extensions) {
        const fullPath = ext ? `${basePath}${ext}` : basePath
        if (existsSync(fullPath) && this.isExecutable(fullPath)) {
          this.getLogger().debug('Found executable', { name: baseName, path: fullPath })
          return fullPath
        }
      }
    }

    // Try system PATH as fallback
    if (this.isInSystemPath(baseName)) {
      return baseName
    }

    this.getLogger().warn('Executable not found', { name: baseName, searched: paths })
    return null
  }

  /**
   * Get default search paths for executables
   */
  private getDefaultExecutablePaths(baseName: string): string[] {
    const paths: string[] = []

    // Application resources directory
    const resourcesDir = join(process.cwd(), 'resources')

    if (this.platformInfo.isWindows) {
      paths.push(join(resourcesDir, `${baseName}.exe`), join(resourcesDir, 'windows', `${baseName}.exe`))
    } else if (this.platformInfo.isMacOS) {
      paths.push(join(resourcesDir, baseName), join(resourcesDir, 'macos', baseName))
    } else if (this.platformInfo.isLinux) {
      paths.push(join(resourcesDir, baseName), join(resourcesDir, 'linux', baseName))
    }

    return paths
  }

  /**
   * Check if file is executable
   */
  private isExecutable(filePath: string): boolean {
    try {
      if (!this.platformInfo.isWindows) {
        // On Unix systems, check if file has execute permission
        const stats = statSync(filePath)
        // Check if any of owner/group/other has execute permission
        const mode = stats.mode
        return !!(mode & 0o111) // 0o111 = execute permission for user/group/other
      }
      // On Windows, just check if file exists (extensions handle executability)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if executable is in system PATH
   */
  private isInSystemPath(executableName: string): boolean {
    try {
      const result = spawnSync(this.platformInfo.isWindows ? 'where' : 'which', [executableName], { stdio: 'pipe' })
      return result.status === 0
    } catch {
      return false
    }
  }

  /**
   * Get platform-specific application data directory
   */
  getAppDataDir(appName: string = 'clipy'): string {
    // Use Electron's app.getPath for consistency
    if (electronApp) {
      try {
        if (this.platformInfo.isWindows) {
          return electronApp.getPath('userData')
        } else if (this.platformInfo.isMacOS) {
          return join(this.platformInfo.homeDir, 'Library', 'Application Support', appName)
        } else {
          // Linux and others
          return electronApp.getPath('userData')
        }
      } catch {
        // Fallback to home directory
        return join(this.platformInfo.homeDir, `.${appName}`)
      }
    } else {
      // Not in Electron main process, use fallback
      return join(this.platformInfo.homeDir, `.${appName}`)
    }
  }

  /**
   * Get platform-specific temporary directory
   */
  getTempDir(subdir?: string): string {
    const baseTemp = this.platformInfo.tempDir
    return subdir ? join(baseTemp, subdir) : baseTemp
  }

  /**
   * Get platform-specific downloads directory
   */
  getDownloadsDir(): string {
    if (electronApp) {
      try {
        return electronApp.getPath('downloads')
      } catch {
        // Fallback to home directory
        return join(this.platformInfo.homeDir, 'Downloads')
      }
    } else {
      // Not in Electron main process, use fallback
      return join(this.platformInfo.homeDir, 'Downloads')
    }
  }

  /**
   * Sanitize filename for current platform
   */
  sanitizeFilename(filename: string): string {
    let sanitized = filename

    // Remove or replace platform-specific invalid characters
    if (this.platformInfo.isWindows) {
      // Windows invalid characters: < > : " | ? *
      sanitized = sanitized.replace(/[<>:"|?*]/g, '_')

      // Remove control characters (0-31 ASCII)
      sanitized = [...sanitized]
        .filter(char => {
          const code = char.charCodeAt(0)
          return code >= 32 || code === 9 || code === 10 || code === 13 // Allow tab, LF, CR
        })
        .join('')
    } else {
      // Unix systems: mainly / and null bytes
      sanitized = [...sanitized]
        .map(char => {
          const code = char.charCodeAt(0)
          if (code === 0) return '_' // Replace null bytes
          if (char === '/') return '_' // Replace forward slashes
          return char
        })
        .join('')
    }

    // Remove leading/trailing whitespace and dots
    sanitized = sanitized.trim()
    if (this.platformInfo.isWindows) {
      sanitized = sanitized.replace(/^[.]+|[.]+$/g, '')
    }

    // Limit length (Windows has 255 char limit for filenames)
    if (sanitized.length > 200) {
      const ext = extname(sanitized)
      const nameWithoutExt = basename(sanitized, ext)
      sanitized = nameWithoutExt.substring(0, 200 - ext.length) + ext
    }

    return sanitized
  }

  /**
   * Check if path is absolute
   */
  isAbsolutePath(path: string): boolean {
    if (this.platformInfo.isWindows) {
      // Windows: starts with drive letter (C:) or UNC path (\\)
      return /^[a-zA-Z]:/.test(path) || path.startsWith('\\\\')
    } else {
      // Unix: starts with /
      return path.startsWith('/')
    }
  }

  /**
   * Get relative path from absolute path
   */
  relativePath(from: string, to: string): string {
    return relative(from, to)
  }

  /**
   * Ensure directory exists with proper permissions
   */
  async ensureDirectory(dirPath: string): Promise<void> {
    try {
      mkdirSync(dirPath, { recursive: true, mode: 0o755 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        this.getLogger().error('Failed to create directory', error as Error, { path: dirPath })
        throw error
      }
    }
  }

  /**
   * Get file permissions in platform-agnostic way
   */
  getFilePermissions(filePath: string): {
    readable: boolean
    writable: boolean
    executable: boolean
  } {
    try {
      const stats = statSync(filePath)

      if (this.platformInfo.isWindows) {
        // On Windows, check if file is read-only
        const isReadOnly = !!(stats.mode & 0o0001) // Check if readonly attribute is set
        return {
          readable: true, // Assume readable if we can stat it
          writable: !isReadOnly,
          executable:
            !!this.platformInfo.executableExtension &&
            filePath.toLowerCase().endsWith(this.platformInfo.executableExtension.toLowerCase()),
        }
      } else {
        // Unix permissions
        const uid = process.getuid?.() ?? 0
        const gid = process.getgid?.() ?? 0

        const isOwner = stats.uid === uid
        const isGroup = stats.gid === gid
        const isOther = !isOwner && !isGroup

        let permissions = 0
        if (isOwner) permissions = (stats.mode >> 6) & 0o7
        else if (isGroup) permissions = (stats.mode >> 3) & 0o7
        else if (isOther) permissions = stats.mode & 0o7

        return {
          readable: !!(permissions & 0o4),
          writable: !!(permissions & 0o2),
          executable: !!(permissions & 0o1),
        }
      }
    } catch (error) {
      this.getLogger().error('Failed to get file permissions', error as Error, { filePath })
      return { readable: false, writable: false, executable: false }
    }
  }

  /**
   * Get platform-specific line ending
   */
  getLineEnding(): string {
    return this.platformInfo.isWindows ? '\r\n' : '\n'
  }

  /**
   * Check if running in development mode
   */
  isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development'
  }

  /**
   * Get platform-specific environment variable
   */
  getEnvironmentVariable(name: string): string | undefined {
    return process.env[name]
  }

  /**
   * Set environment variable safely
   */
  setEnvironmentVariable(name: string, value: string): void {
    process.env[name] = value
  }

  /**
   * Get system information
   */
  getSystemInfo() {
    return {
      platform: this.platformInfo.name,
      version: release(),
      arch: this.platformInfo.arch,
      hostname: hostname(),
      cpus: cpus().length,
      totalMemory: totalmem(),
      freeMemory: freemem(),
      uptime: uptime(),
    }
  }
}
