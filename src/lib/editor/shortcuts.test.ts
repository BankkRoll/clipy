import { describe, it, expect, afterEach } from "vitest";
import { resolveShortcut, shouldIgnoreShortcut, type KeyInput } from "./shortcuts";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("resolveShortcut", () => {
  it.each([
    [key(" "), "togglePlay"],
    [key("Delete"), "delete"],
    [key("Backspace"), "delete"],
    [key("s"), "split"],
    [key("S", { shiftKey: true }), null],
    [key("ArrowLeft"), "seekBack"],
    [key("ArrowLeft", { shiftKey: true }), "seekBackFar"],
    [key("ArrowRight"), "seekForward"],
    [key("ArrowRight", { shiftKey: true }), "seekForwardFar"],
    [key("Home"), "seekStart"],
    [key("End"), "seekEnd"],
    [key("q"), null],
    [key("s", { ctrlKey: true }), "save"],
    [key("s", { metaKey: true }), "save"],
    [key("z", { ctrlKey: true }), "undo"],
    // Shift turns the key upper-case; this used to fall through and never redo.
    [key("Z", { ctrlKey: true, shiftKey: true }), "redo"],
    [key("y", { ctrlKey: true }), "redo"],
    [key("c", { ctrlKey: true }), "copy"],
    [key("v", { ctrlKey: true }), "paste"],
    [key("x", { ctrlKey: true }), "cut"],
    [key("D", { ctrlKey: true }), "duplicate"],
    [key("q", { ctrlKey: true }), null],
    [key("s", { altKey: true }), null],
  ])("%o -> %s", (input, action) => {
    expect(resolveShortcut(input)).toBe(action);
  });
});

describe("shouldIgnoreShortcut", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const mount = (html: string) => {
    document.body.innerHTML = html;
    return document.body.querySelector("[data-target]")!;
  };
  const ev = (target: EventTarget | null, mods: Partial<KeyInput> = {}) => ({
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });

  it("lets the editor handle keys on plain elements and non-element targets", () => {
    expect(shouldIgnoreShortcut(ev(mount('<div data-target tabindex="0"></div>')))).toBe(false);
    expect(shouldIgnoreShortcut(ev(window))).toBe(false);
    expect(shouldIgnoreShortcut(ev(null))).toBe(false);
  });

  it.each([
    "<input data-target />",
    "<textarea data-target></textarea>",
    "<select data-target></select>",
    '<div contenteditable="true"><span data-target></span></div>',
    '<div role="combobox" data-target></div>',
  ])("ignores every key in text entry: %s", (html) => {
    const target = mount(html);
    expect(shouldIgnoreShortcut(ev(target))).toBe(true);
    expect(shouldIgnoreShortcut(ev(target, { ctrlKey: true }))).toBe(true);
  });

  it("honours inherited isContentEditable", () => {
    const target = mount("<div data-target></div>");
    Object.defineProperty(target, "isContentEditable", { value: true });
    expect(shouldIgnoreShortcut(ev(target))).toBe(true);
  });

  it.each([
    "<button data-target>Go</button>",
    '<span role="slider" data-target></span>',
    '<button role="tab"><svg data-target></svg></button>',
  ])("ignores unmodified keys on focused controls: %s", (html) => {
    const target = mount(html);
    expect(shouldIgnoreShortcut(ev(target))).toBe(true);
    expect(shouldIgnoreShortcut(ev(target, { ctrlKey: true }))).toBe(false);
    expect(shouldIgnoreShortcut(ev(target, { metaKey: true }))).toBe(false);
    expect(shouldIgnoreShortcut(ev(target, { altKey: true }))).toBe(false);
  });

  it("ignores everything while a dialog or menu is open", () => {
    mount('<div data-target></div><div role="dialog"></div>');
    expect(shouldIgnoreShortcut(ev(document.body))).toBe(true);
    document.body.innerHTML = '<div role="menu"></div>';
    expect(shouldIgnoreShortcut(ev(document.body, { ctrlKey: true }))).toBe(true);
  });
});
