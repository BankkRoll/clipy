import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { resetBackend } from "./tauri";
import { resetAppState } from "./state";

// jsdom does not implement matchMedia; provide a minimal stub for hooks/components
// that read prefers-color-scheme.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// NOTE: jsdom lacks the layout/media APIs Radix, cmdk and react-resizable-panels
// touch on mount. These are inert stand-ins; tests that care about behaviour
// stub them per-test.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};
HTMLMediaElement.prototype.play = function () {
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {};
HTMLMediaElement.prototype.load = function () {};

// jsdom has no MediaError; the player reads its code constants.
globalThis.MediaError ??= Object.assign(function MediaError() {}, {
  MEDIA_ERR_ABORTED: 1,
  MEDIA_ERR_NETWORK: 2,
  MEDIA_ERR_DECODE: 3,
  MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
}) as unknown as typeof MediaError;

// Fullscreen / Picture-in-Picture are absent from jsdom. Tests that exercise
// them override these per-test; the defaults just resolve.
Element.prototype.requestFullscreen ??= function () {
  return Promise.resolve();
};
document.exitFullscreen ??= () => Promise.resolve();
HTMLVideoElement.prototype.requestPictureInPicture ??= function () {
  return Promise.resolve({} as PictureInPictureWindow);
};
document.exitPictureInPicture ??= () => Promise.resolve();

// Ensure React testing-library DOM, any fake backend, and app-wide state are
// torn down between tests so nothing leaks across files run in one worker.
afterEach(() => {
  cleanup();
  resetBackend();
  resetAppState();
});
