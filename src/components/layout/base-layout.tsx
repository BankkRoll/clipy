import DragWindowRegion from "@/components/layout/window-region";
import AppNavigationMenu from "@/components/navigation/navigation-menu";
import React from "react";

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <DragWindowRegion />
      <AppNavigationMenu />

      <div className="flex-1 overflow-y-auto">
        <main className="min-h-full">
          <div className="mx-auto max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
