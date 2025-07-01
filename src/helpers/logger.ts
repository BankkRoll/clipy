import { app } from 'electron';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'util';

const LOG_HISTORY: string[] = [];
let logFilePath: string;

function getTimestamp(): string {
  return new Date().toISOString();
}

export function initializeLogging() {
  const logDir = join(app.getPath('userData'), 'logs');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  logFilePath = join(logDir, `session-${timestamp}.log`);

  logInfo('Logging initialized.');

  app.on('before-quit', async () => {
    logInfo('Application shutting down. Saving logs...');
    await saveLogsToFile();
  });
}

export function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', message: string, ...args: any[]) {
  const timestamp = getTimestamp();
  const formattedMessage = format(message, ...args);
  const logEntry = `[${timestamp}] [${level}] ${formattedMessage}`;
  
  console.log(logEntry);
  LOG_HISTORY.push(logEntry);
}

export function logInfo(message: string, ...args: any[]) {
    log('INFO', message, ...args);
}

export function logWarn(message: string, ...args: any[]) {
    log('WARN', message, ...args);
}

export function logError(message: string, ...args: any[]) {
    log('ERROR', message, ...args);
}

export function logDebug(message: string, ...args: any[]) {
    if (process.env.NODE_ENV !== 'production') {
        log('DEBUG', message, ...args);
    }
}


export async function saveLogsToFile(): Promise<void> {
  if (!logFilePath) {
    console.error('Log file path not set. Cannot save logs.');
    return;
  }

  return new Promise((resolve) => {
    const stream = createWriteStream(logFilePath, { flags: 'a' });
    stream.on('error', (err) => {
      console.error('Failed to write logs to file:', err);
      resolve();
    });
    
    LOG_HISTORY.forEach(entry => {
      stream.write(entry + '\n');
    });
    
    stream.end(() => {
      console.log(`Logs saved to ${logFilePath}`);
      resolve();
    });
  });
} 