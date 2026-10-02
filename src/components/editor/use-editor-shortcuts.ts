/**
 * Global keyboard shortcuts for the editor page.
 */
import { useEffect, useRef } from "react";
import { resolveShortcut, shouldIgnoreShortcut, type ShortcutAction } from "@/lib/editor/shortcuts";

/** Handler per shortcut action; missing actions are ignored. */
export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Listen for editor shortcuts on `window` while mounted.
 *
 * Handlers are read through a ref, so callers may pass a fresh object every
 * render without re-subscribing.
 *
 * @param handlers - Action handlers.
 */
export function useEditorShortcuts(handlers: ShortcutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || shouldIgnoreShortcut(e)) return;
      const action = resolveShortcut(e);
      const handler = action ? handlersRef.current[action] : undefined;
      if (!handler) return;
      e.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
