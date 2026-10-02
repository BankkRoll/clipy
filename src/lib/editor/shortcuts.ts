/**
 * Editor keyboard map and the rules for when a keystroke belongs to the
 * focused control instead of the editor.
 */

/** Editor command a keystroke can trigger. */
export type ShortcutAction =
  | "togglePlay"
  | "delete"
  | "save"
  | "undo"
  | "redo"
  | "copy"
  | "paste"
  | "cut"
  | "duplicate"
  | "split"
  | "seekBack"
  | "seekBackFar"
  | "seekForward"
  | "seekForwardFar"
  | "seekStart"
  | "seekEnd";

/** The parts of a `KeyboardEvent` the resolver looks at. */
export interface KeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Map a keystroke to an editor action.
 *
 * Letter keys are compared case-insensitively because Shift (and Caps Lock)
 * turn `e.key` into an upper-case letter: Ctrl+Shift+Z arrives as `"Z"`.
 *
 * @param e - Keystroke.
 * @returns The action, or `null` when the key is not an editor shortcut.
 * @example
 * resolveShortcut({ key: "Z", ctrlKey: true, shiftKey: true, metaKey: false, altKey: false }); // "redo"
 */
export function resolveShortcut(e: KeyInput): ShortcutAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod) {
    switch (key) {
      case "s":
        return "save";
      case "z":
        return e.shiftKey ? "redo" : "undo";
      case "y":
        return "redo";
      case "c":
        return "copy";
      case "v":
        return "paste";
      case "x":
        return "cut";
      case "d":
        return "duplicate";
      default:
        return null;
    }
  }

  switch (key) {
    case " ":
      return "togglePlay";
    case "Delete":
    case "Backspace":
      return "delete";
    case "s":
      return e.shiftKey ? null : "split";
    case "ArrowLeft":
      return e.shiftKey ? "seekBackFar" : "seekBack";
    case "ArrowRight":
      return e.shiftKey ? "seekForwardFar" : "seekForward";
    case "Home":
      return "seekStart";
    case "End":
      return "seekEnd";
    default:
      return null;
  }
}

const TEXT_ENTRY_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"]';

const CONTROL_SELECTOR =
  'button, a[href], [role="slider"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [role="spinbutton"]';

// Tooltips are deliberately not listed: a hovered tooltip must not swallow shortcuts.
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Whether the editor should leave a keystroke alone.
 *
 * - Text entry (inputs, textareas, selects, contentEditable) owns every key.
 * - Other focused controls (buttons, sliders, tabs, ...) own unmodified keys,
 *   so Space activates the button and arrows move the slider.
 * - While a dialog or menu is open, the editor ignores the keyboard entirely.
 *
 * @param e - Keystroke with its target.
 * @param doc - Document to inspect for open overlays.
 * @returns `true` when the editor must not handle the key.
 */
export function shouldIgnoreShortcut(
  e: Pick<KeyboardEvent, "target" | "ctrlKey" | "metaKey" | "altKey">,
  doc: Document = document
): boolean {
  if (doc.querySelector(OVERLAY_SELECTOR)) return true;

  const target = e.target instanceof Element ? e.target : null;
  if (!target) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest(TEXT_ENTRY_SELECTOR)) return true;

  const modified = e.ctrlKey || e.metaKey || e.altKey;
  return !modified && target.closest(CONTROL_SELECTOR) !== null;
}
