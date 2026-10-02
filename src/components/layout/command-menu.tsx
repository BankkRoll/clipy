/**
 * Command palette (Ctrl/⌘+K) and the app-wide navigation shortcuts it advertises.
 */
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Download,
  Film,
  FolderOpen,
  Home,
  Monitor,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { toast } from "sonner";

import { cn, isEditableTarget } from "@/lib/utils";
import { logger } from "@/lib/logger";
import type { LibraryVideo } from "@/hooks/useLibrary";
import { useTheme } from "@/hooks/useSettings";
import { useNavigate } from "react-router-dom";
import type { Theme } from "@/types/settings";

const RECENT_LIMIT = 5;

/** Props for {@link CommandMenu}. */
export interface CommandMenuProps {
  /** Render the trigger as an icon-only button (collapsed sidebar). */
  collapsed?: boolean;
}

/** A global keyboard shortcut: modifier (Ctrl/⌘) plus `key`, optionally with Shift. */
interface Shortcut {
  key: string;
  shift?: boolean;
}

interface QuickAction {
  name: string;
  icon: typeof Plus;
  action: () => void;
  shortcut?: Shortcut;
}

function isMac(): boolean {
  return /mac/i.test(navigator.platform);
}

function formatShortcut({ key, shift }: Shortcut): string {
  const label = key.toUpperCase();
  return isMac() ? `⌘${shift ? "⇧" : ""}${label}` : `Ctrl+${shift ? "Shift+" : ""}${label}`;
}

function matches(e: KeyboardEvent, shortcut: Shortcut): boolean {
  return (
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    Boolean(shortcut.shift) === e.shiftKey &&
    e.key.toLowerCase() === shortcut.key
  );
}

/** Command palette trigger, dialog and global navigation shortcuts. */
export function CommandMenu({ collapsed = false }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const pages = useMemo(
    () => [
      { name: "Home", icon: Home, path: "/", shortcut: { key: "1" } },
      { name: "Editor", icon: Film, path: "/editor", shortcut: { key: "2" } },
      { name: "Library", icon: FolderOpen, path: "/library", shortcut: { key: "3" } },
      { name: "Downloads", icon: Download, path: "/downloads", shortcut: { key: "4" } },
      { name: "Settings", icon: Settings, path: "/settings", shortcut: { key: "," } },
    ],
    []
  );

  const loadVideos = useCallback(async () => {
    try {
      const result = await invoke<LibraryVideo[] | null>("get_library_videos");
      setVideos(result ?? []);
    } catch (err) {
      logger.error("CommandMenu", "Failed to load library:", err);
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      // Library and Editor already reload on this event; reuse it instead of
      // reloading the whole window.
      await emit("library-updated");
      await loadVideos();
      toast.success("Library refreshed");
    } catch (err) {
      logger.error("CommandMenu", "Failed to refresh library:", err);
      toast.error("Failed to refresh library");
    }
  }, [loadVideos]);

  const actions = useMemo<QuickAction[]>(
    () => [
      { name: "New Download", icon: Plus, action: () => navigate("/"), shortcut: { key: "n" } },
      {
        name: "New Project",
        icon: Film,
        action: () => navigate("/editor"),
        shortcut: { key: "n", shift: true },
      },
      { name: "Refresh Library", icon: RefreshCw, action: () => void refreshLibrary() },
    ],
    [navigate, refreshLibrary]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.defaultPrevented || isEditableTarget(e.target)) return;

      const page = pages.find((p) => matches(e, p.shortcut));
      const action = actions.find((a) => a.shortcut && matches(e, a.shortcut));
      if (page) {
        e.preventDefault();
        setOpen(false);
        navigate(page.path);
      } else if (action) {
        e.preventDefault();
        setOpen(false);
        action.action();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pages, actions, navigate]);

  // PERF: the library is only needed while the palette is open; fetching it on
  // every mount would hit the database on every route change.
  useEffect(() => {
    if (open) void loadVideos();
  }, [open, loadVideos]);

  const recentVideos = useMemo(
    () =>
      [...videos]
        .sort((a, b) => Date.parse(b.downloadedAt) - Date.parse(a.downloadedAt))
        .slice(0, RECENT_LIMIT),
    [videos]
  );

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  const changeTheme = useCallback(
    (next: Theme) => {
      setTheme(next).catch((err: unknown) => {
        toast.error("Failed to save theme", { description: String(err) });
      });
    },
    [setTheme]
  );

  const themes = [
    { name: "Light", icon: Sun, value: "light" as const },
    { name: "Dark", icon: Moon, value: "dark" as const },
    { name: "System", icon: Monitor, value: "system" as const },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command menu"
        className={cn(
          "flex items-center gap-2 rounded-lg border border-input bg-background/50 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
          collapsed ? "h-9 w-9 justify-center" : "h-9 w-full px-3"
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">Search...</span>
            <KbdGroup>
              <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </>
        )}
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search for apps and commands..." />
        <CommandPanel>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {recentVideos.length > 0 && (
              <>
                <CommandGroup heading="Recent Videos">
                  {recentVideos.map((video) => (
                    <CommandItem
                      key={video.id}
                      value={`video-${video.id}-${video.title}`}
                      onSelect={() => runCommand(() => navigate(`/editor?import=${video.id}`))}
                    >
                      <Play />
                      <span className="flex-1 truncate">{video.title}</span>
                      <span className="text-xs text-muted-foreground">{video.channel}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup heading="Pages">
              {pages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={`page-${page.name}`}
                  onSelect={() => runCommand(() => navigate(page.path))}
                >
                  <page.icon />
                  <span className="flex-1">{page.name}</span>
                  <CommandShortcut>{formatShortcut(page.shortcut)}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Quick Actions">
              {actions.map((action) => (
                <CommandItem
                  key={action.name}
                  value={`action-${action.name}`}
                  onSelect={() => runCommand(action.action)}
                >
                  <action.icon />
                  <span className="flex-1">{action.name}</span>
                  {action.shortcut && (
                    <CommandShortcut>{formatShortcut(action.shortcut)}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Theme">
              {themes.map((t) => (
                <CommandItem
                  key={t.value}
                  value={`theme-${t.name}`}
                  onSelect={() => runCommand(() => changeTheme(t.value))}
                >
                  <t.icon />
                  <span className="flex-1">{t.name}</span>
                  {theme === t.value && <span className="text-xs text-primary">Active</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandPanel>

        <CommandFooter>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <KbdGroup>
                <Kbd>
                  <ArrowUp className="h-3 w-3" />
                </Kbd>
                <Kbd>
                  <ArrowDown className="h-3 w-3" />
                </Kbd>
              </KbdGroup>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Kbd>
                <CornerDownLeft className="h-3 w-3" />
              </Kbd>
              <span>Open</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            <span>Close</span>
          </div>
        </CommandFooter>
      </CommandDialog>
    </>
  );
}
