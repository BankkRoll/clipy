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
import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useLibrary } from "@/hooks/useLibrary";
import { useNavigate } from "react-router-dom";
import { useThemeStore } from "@/stores/settingsStore";

interface CommandMenuProps {
  collapsed?: boolean;
}

export function CommandMenu({ collapsed = false }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { videos } = useLibrary();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  // Keyboard shortcut to open
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    command();
  }, []);

  // Navigation items
  const pages = [
    { name: "Home", icon: Home, path: "/", shortcut: "⌘1" },
    { name: "Editor", icon: Film, path: "/editor", shortcut: "⌘2" },
    { name: "Library", icon: FolderOpen, path: "/library", shortcut: "⌘3" },
    { name: "Downloads", icon: Download, path: "/downloads", shortcut: "⌘4" },
    { name: "Settings", icon: Settings, path: "/settings", shortcut: "⌘," },
  ];

  // Quick actions
  const actions = [
    {
      name: "New Download",
      icon: Plus,
      action: () => navigate("/"),
      shortcut: "⌘N",
    },
    {
      name: "New Project",
      icon: Film,
      action: () => navigate("/editor"),
      shortcut: "⌘⇧N",
    },
    {
      name: "Refresh Library",
      icon: RefreshCw,
      action: () => window.location.reload(),
    },
  ];

  // Theme options
  const themes = [
    { name: "Light", icon: Sun, value: "light" as const },
    { name: "Dark", icon: Moon, value: "dark" as const },
    { name: "System", icon: Monitor, value: "system" as const },
  ];

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
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
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </>
        )}
      </button>

      {/* Command Dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search for apps and commands..." />
        <CommandPanel>
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Recent Videos */}
            {videos.length > 0 && (
              <>
                <CommandGroup heading="Recent Videos">
                  {videos.slice(0, 5).map((video) => (
                    <CommandItem
                      key={video.id}
                      value={`video-${video.title}`}
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

            {/* Pages */}
            <CommandGroup heading="Pages">
              {pages.map((page) => (
                <CommandItem
                  key={page.path}
                  value={`page-${page.name}`}
                  onSelect={() => runCommand(() => navigate(page.path))}
                >
                  <page.icon />
                  <span className="flex-1">{page.name}</span>
                  {page.shortcut && <CommandShortcut>{page.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            {/* Quick Actions */}
            <CommandGroup heading="Quick Actions">
              {actions.map((action) => (
                <CommandItem
                  key={action.name}
                  value={`action-${action.name}`}
                  onSelect={() => runCommand(action.action)}
                >
                  <action.icon />
                  <span className="flex-1">{action.name}</span>
                  {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            {/* Theme */}
            <CommandGroup heading="Theme">
              {themes.map((t) => (
                <CommandItem
                  key={t.value}
                  value={`theme-${t.name}`}
                  onSelect={() => runCommand(() => setTheme(t.value))}
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
