import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  FolderOpen,
  Home,
  Settings,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { Button } from "@/components/ui/button";
import { CommandMenu } from "./command-menu";
import { cn } from "@/lib/utils";
import { useDownloadStore } from "@/stores/downloadStore";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";

const navItems = [
  { path: "/", icon: Home, label: "Home" },
  { path: "/editor", icon: Film, label: "Editor" },
  { path: "/library", icon: FolderOpen, label: "Library" },
  { path: "/downloads", icon: Download, label: "Downloads" },
  { path: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar() {
  const location = useLocation();
  const collapsed = useUIStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const activeDownloads = useDownloadStore((state) => state.activeDownloads);
  const theme = useThemeStore((state) => state.theme);

  // Track system theme changes when theme is set to "system"
  const [systemIsDark, setSystemIsDark] = useState(
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Determine actual theme for logo
  const isDark = theme === "dark" || (theme === "system" && systemIsDark);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-card transition-all duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-border px-4">
          <div className="flex items-center gap-3">
            <img
              src={isDark ? "/logo-dark.png" : "/logo-light.png"}
              alt="Clipy"
              className="h-8 w-8 object-contain"
            />
            {!collapsed && <span className="text-lg font-semibold tracking-tight">Clipy</span>}
          </div>
        </div>

        {/* Command Menu / Search */}
        <div className="p-3 pb-0">
          <CommandMenu collapsed={collapsed} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/" && location.pathname.startsWith(item.path));
            const Icon = item.icon;
            const showBadge = item.path === "/downloads" && activeDownloads > 0;

            const linkContent = (
              <NavLink
                to={item.path}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  collapsed && "justify-center px-2"
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {showBadge && (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {activeDownloads}
                    </span>
                  )}
                </div>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={10}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return <div key={item.path}>{linkContent}</div>;
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn("w-full", collapsed && "px-2")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="mr-2 h-4 w-4" />
                Collapse
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
