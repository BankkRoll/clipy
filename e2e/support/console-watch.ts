/**
 * Starts `console-watch.ps1` for the duration of a spec and collects every
 * console window that appears. No-op off Windows, where the bug can't occur.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

/** Handle to a running watcher. */
export interface ConsoleWatch {
  /** Console windows seen since start, as "handle|class|title". */
  readonly windows: string[];
  stop(): void;
}

/**
 * Start watching; resolves once the baseline is recorded.
 *
 * @returns A watch whose `windows` fills in as consoles appear.
 */
export async function watchConsoleWindows(): Promise<ConsoleWatch> {
  const windows: string[] = [];
  if (process.platform !== "win32") return { windows, stop: () => {} };

  const script = path.join(import.meta.dirname, "console-watch.ps1");
  const child: ChildProcess = spawn(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
    { stdio: ["ignore", "pipe", "inherit"], windowsHide: true }
  );
  await new Promise<void>((resolve, reject) => {
    let buffer = "";
    child.stdout!.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line === "READY") resolve();
        else if (line.startsWith("NEW ")) windows.push(line.slice(4));
      }
    });
    child.once("exit", (code) => reject(new Error(`console watcher exited (${code})`)));
  });
  return { windows, stop: () => child.kill() };
}
