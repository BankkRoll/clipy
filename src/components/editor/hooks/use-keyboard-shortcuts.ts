import { useEffect } from "react";

interface KeyboardShortcutHandlers {
  onTogglePlay: () => void;
  onDelete: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onSeekRelative: (delta: number) => void;
  onSeek: (time: number) => void;
  duration: number;
  canCopy: boolean;
  canPaste: boolean;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      const isCtrl = e.ctrlKey || e.metaKey;

      // Space - toggle play
      if (key === " " && !isCtrl) {
        e.preventDefault();
        handlers.onTogglePlay();
        return;
      }

      // Delete/Backspace - delete selected
      if ((key === "delete" || key === "backspace") && !isCtrl) {
        e.preventDefault();
        handlers.onDelete();
        return;
      }

      // Ctrl+S - save
      if (isCtrl && key === "s") {
        e.preventDefault();
        handlers.onSave();
        return;
      }

      // Ctrl+Z - undo
      if (isCtrl && key === "z" && !e.shiftKey) {
        e.preventDefault();
        handlers.onUndo();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y - redo
      if ((isCtrl && key === "z" && e.shiftKey) || (isCtrl && key === "y")) {
        e.preventDefault();
        handlers.onRedo();
        return;
      }

      // Ctrl+C - copy
      if (isCtrl && key === "c" && handlers.canCopy) {
        e.preventDefault();
        handlers.onCopy();
        return;
      }

      // Ctrl+V - paste
      if (isCtrl && key === "v" && handlers.canPaste) {
        e.preventDefault();
        handlers.onPaste();
        return;
      }

      // Ctrl+X - cut
      if (isCtrl && key === "x" && handlers.canCopy) {
        e.preventDefault();
        handlers.onCut();
        return;
      }

      // Ctrl+D - duplicate
      if (isCtrl && key === "d" && handlers.canCopy) {
        e.preventDefault();
        handlers.onDuplicate();
        return;
      }

      // Arrow keys - seek
      if (key === "arrowleft") {
        e.preventDefault();
        handlers.onSeekRelative(e.shiftKey ? -5 : -1);
        return;
      }

      if (key === "arrowright") {
        e.preventDefault();
        handlers.onSeekRelative(e.shiftKey ? 5 : 1);
        return;
      }

      // Home - go to start
      if (key === "home") {
        e.preventDefault();
        handlers.onSeek(0);
        return;
      }

      // End - go to end
      if (key === "end") {
        e.preventDefault();
        handlers.onSeek(handlers.duration);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
