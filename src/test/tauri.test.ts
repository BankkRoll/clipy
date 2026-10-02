import { describe, it, expect, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { emitBackendEvent, mockBackend } from "./tauri";

describe("mockBackend harness", () => {
  it("routes commands to handlers and records calls", async () => {
    const backend = mockBackend({ add: (a) => (a.a as number) + (a.b as number) });
    await expect(invoke("add", { a: 2, b: 3 })).resolves.toBe(5);
    await expect(invoke("unknown")).resolves.toBeNull();
    expect(backend.callsTo("add")).toEqual([{ cmd: "add", args: { a: 2, b: 3 } }]);
  });

  it("propagates handler errors as rejections", async () => {
    mockBackend({
      boom: () => {
        throw "backend failed";
      },
    });
    await expect(invoke("boom")).rejects.toBe("backend failed");
  });

  it("delivers emitted events to listeners", async () => {
    mockBackend();
    const handler = vi.fn();
    await listen("download-progress", handler);
    await emitBackendEvent("download-progress", { id: "x", progress: 50 });
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { id: "x", progress: 50 } }),
    );
  });
});
