/**
 * Test harness for code that talks to the Tauri backend.
 *
 * Built on the official `@tauri-apps/api/mocks` IPC interceptor, so every
 * `invoke()`, plugin call (`plugin:dialog|open`, `plugin:shell|open`, ...) and
 * `listen()`/`emit()` goes through one programmable fake instead of per-module
 * `vi.mock` stubs. Responsibilities:
 * - route commands to per-test handlers, falling back to sane defaults
 * - record every IPC call for assertions
 * - deliver backend events to frontend listeners
 */
import { clearMocks, mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import { act } from "@testing-library/react";

/** Handler for one IPC command; receives the invoke payload. May throw to simulate a backend error. */
export type IpcHandler = (args: Record<string, unknown>) => unknown;

/** A single recorded IPC call. */
export interface IpcCall {
  cmd: string;
  args: Record<string, unknown>;
}

/** Live view of the mocked backend returned by {@link mockBackend}. */
export interface MockBackend {
  /** Every IPC call, in order, including plugin calls. */
  calls: IpcCall[];
  /** Calls made to a single command. */
  callsTo(cmd: string): IpcCall[];
  /** Replace or add a handler after setup. */
  on(cmd: string, handler: IpcHandler): void;
}

let current: MockBackend | null = null;

/**
 * Install a fake backend for the current test.
 *
 * Unhandled commands resolve to `null`, matching a unit-returning Rust command,
 * so components under test never hang on an unexpected call.
 *
 * @param handlers - Command name to handler map; overrides defaults.
 * @returns The live backend, for asserting on calls.
 * @example
 * const backend = mockBackend({ get_settings: () => fixtures.settings() });
 * render(<Settings />);
 * expect(backend.callsTo("get_settings")).toHaveLength(1);
 */
export function mockBackend(handlers: Record<string, IpcHandler> = {}): MockBackend {
  const table = new Map<string, IpcHandler>(Object.entries(handlers));
  const calls: IpcCall[] = [];

  mockWindows("main");
  mockConvertFileSrc("windows");
  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      calls.push({ cmd, args });
      const handler = table.get(cmd);
      return handler ? handler(args) : null;
    },
    { shouldMockEvents: true },
  );

  current = {
    calls,
    callsTo: (cmd) => calls.filter((c) => c.cmd === cmd),
    on: (cmd, handler) => table.set(cmd, handler),
  };
  return current;
}

/**
 * Emit a backend event to all frontend listeners, wrapped in `act`.
 *
 * @param event - Event name, e.g. `download-progress`.
 * @param payload - Event payload as the Rust side would serialize it.
 */
export async function emitBackendEvent(event: string, payload: unknown): Promise<void> {
  await act(async () => {
    await emit(event, payload);
  });
}

/** Remove the fake backend. Called automatically after each test from setup.ts. */
export function resetBackend(): void {
  current = null;
  clearMocks();
}
