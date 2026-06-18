import { Sidebar } from "./sidebar";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useNavigationEvent } from "@/hooks";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed);
  const navigate = useNavigate();

  // Respond to navigation requests emitted by the system tray menu.
  useNavigationEvent((path) => navigate(path));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main
        className={cn(
          "flex-1 overflow-hidden transition-all duration-200",
          sidebarCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {children}
      </main>
    </div>
  );
}
