import {
  closeWindow,
  maximizeWindow,
  minimizeWindow,
} from "@/helpers/window_helpers";
import { Minus, Square, X } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

interface DragWindowRegionProps {
  title?: React.ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  return (
    <div className="flex w-full items-center justify-between h-8 bg-background/80 backdrop-blur-sm border-b">
      <div className="draglayer flex-1 h-full" />
        <WindowButtons />
    </div>
  );
}

function WindowButtons() {
  const { t } = useTranslation();

  return (
    <div className="flex h-full">
      <button
        title={t("windowMinimize")}
        type="button"
        className="flex items-center justify-center w-12 h-full hover:bg-accent/50 transition-colors group"
        onClick={minimizeWindow}
      >
        <Minus className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
      </button>
      
      <button
        title={t("windowMaximize")}
        type="button"
        className="flex items-center justify-center w-12 h-full hover:bg-accent/50 transition-colors group"
        onClick={maximizeWindow}
      >
        <Square className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
      </button>
      
      <button
        type="button"
        title={t("windowClose")}
        className="flex items-center justify-center w-12 h-full hover:bg-destructive/90 hover:text-destructive-foreground transition-colors group"
        onClick={closeWindow}
      >
        <X className="h-3 w-3 text-muted-foreground group-hover:text-destructive-foreground" />
      </button>
    </div>
  );
}
