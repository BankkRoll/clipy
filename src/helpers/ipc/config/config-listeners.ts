import checkDiskSpace from 'check-disk-space';
import { app, dialog, ipcMain } from 'electron';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import {
    createErrorResponse,
    createSuccessResponse,
} from '../../../types/api';
import {
    getConfig,
    updateDownloadConfig,
    updateEditorConfig,
} from '../../config_helpers';
import {
    CONFIG_GET_CHANNEL,
    CONFIG_UPDATE_DOWNLOAD_CHANNEL,
    CONFIG_UPDATE_EDITOR_CHANNEL,
    STORAGE_CLEAR_CACHE_CHANNEL,
    STORAGE_GET_USAGE_CHANNEL,
    SYSTEM_GET_INFO_CHANNEL,
    SYSTEM_OPEN_DIALOG_CHANNEL,
} from './config-channels';

async function getDirectorySize(directory: string): Promise<number> {
  try {
    const files = await fs.readdir(directory, { withFileTypes: true });
    const sizes = await Promise.all(
      files.map(async (file) => {
        const path = join(directory, file.name);
        if (file.isDirectory()) {
          return getDirectorySize(path);
        }
        const stats = await fs.stat(path);
        return stats.size;
      })
    );
    return sizes.reduce((acc, size) => acc + size, 0);
  } catch (e) {
    return 0;
  }
}

async function getPackageInfo() {
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const packageContent = await fs.readFile(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    
    return {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      license: packageJson.license,
      author: packageJson.author,
      repository: packageJson.repository,
      homepage: packageJson.homepage,
      bugs: packageJson.bugs,
      keywords: packageJson.keywords || [],
    };
  } catch (error) {
    console.error('Failed to read package.json:', error);
    return null;
  }
}

export function addConfigEventListeners() {
  ipcMain.handle(CONFIG_GET_CHANNEL, async () => {
    try {
      const config = getConfig();
      return createSuccessResponse(config);
    } catch (e) {
      return createErrorResponse(
        e instanceof Error ? e.message : 'Unknown error',
        'CONFIG_GET_FAILED'
      );
    }
  });

  ipcMain.handle(
    CONFIG_UPDATE_DOWNLOAD_CHANNEL,
    async (event, updates: any) => {
      try {
        const config = updateDownloadConfig(updates);
        return createSuccessResponse(config);
      } catch (e) {
        return createErrorResponse(
          e instanceof Error ? e.message : 'Unknown error',
          'CONFIG_UPDATE_FAILED'
        );
      }
    }
  );

  ipcMain.handle(CONFIG_UPDATE_EDITOR_CHANNEL, async (event, updates: any) => {
    try {
      const config = updateEditorConfig(updates);
      return createSuccessResponse(config);
    } catch (e) {
      return createErrorResponse(
        e instanceof Error ? e.message : 'Unknown error',
        'CONFIG_UPDATE_FAILED'
      );
    }
  });

  ipcMain.handle(SYSTEM_GET_INFO_CHANNEL, async () => {
    try {
      const packageInfo = await getPackageInfo();
      
      const info = {
        appName: app.getName(),
        appVersion: app.getVersion(),
        os: `${os.type()} ${os.release()}`,
        arch: os.arch(),
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron,
        packageInfo,
      };
      return createSuccessResponse(info);
    } catch (e) {
      return createErrorResponse(
        e instanceof Error ? e.message : 'Unknown error',
        'SYSTEM_INFO_FAILED'
      );
    }
  });

  ipcMain.handle(SYSTEM_OPEN_DIALOG_CHANNEL, async () => {
    try {
      const { filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory'],
      });
      return createSuccessResponse(filePaths?.[0]);
    } catch (e) {
      return createErrorResponse(
        e instanceof Error ? e.message : 'Unknown error',
        'DIALOG_OPEN_FAILED'
      );
    }
  });

  ipcMain.handle(STORAGE_GET_USAGE_CHANNEL, async () => {
    try {
      const config = getConfig();
      const [diskSpace, downloadSize, cacheSize, tempSize] =
        await Promise.all([
          checkDiskSpace(config.storage.cachePath),
          getDirectorySize(config.download.downloadPath),
          getDirectorySize(config.storage.cachePath),
          getDirectorySize(config.storage.tempPath),
        ]);

      const usage = {
        available: diskSpace.free,
        downloads: downloadSize,
        cache: cacheSize,
        temp: tempSize,
        totalUsed: downloadSize + cacheSize + tempSize,
      };
      return createSuccessResponse(usage);
    } catch (e) {
      return createErrorResponse(
        e instanceof Error ? e.message : 'Unknown error',
        'STORAGE_USAGE_FAILED'
      );
    }
  });

  ipcMain.handle(
    STORAGE_CLEAR_CACHE_CHANNEL,
    async (event, type: 'temp' | 'thumbnails') => {
      try {
        const config = getConfig();
        const path =
          type === 'temp'
            ? config.storage.tempPath
            : config.storage.cachePath;
        await fs.rm(path, { recursive: true, force: true });
        await fs.mkdir(path, { recursive: true });
        return createSuccessResponse(undefined);
      } catch (e) {
        return createErrorResponse(
          e instanceof Error ? e.message : 'Unknown error',
          'CACHE_CLEAR_FAILED'
        );
      }
    }
  );
} 