import { Link, useLocation } from "@tanstack/react-router";
import {
  Download,
  Film,
  FolderOpen,
  Home,
  Menu,
  Settings
} from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

import SettingsButton from "./settings-button";
import ToggleTheme from "./theme-toggle";

const navigationLinks = [
  { to: "/", label: "titleHomePage", icon: Home },
  { to: "/downloader", label: "titleDownloader", icon: Download },
  { to: "/editor", label: "titleEditor", icon: Film },
  { to: "/library", label: "titleLibrary", icon: FolderOpen },
];

export default function AppNavigationMenu() {
  const { t } = useTranslation();
  const location = useLocation();
  const currentPath = location.pathname;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">C</span>
            </div>
            <span className="font-semibold text-lg">{t("appName")}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navigationLinks.map((link) => {
              const Icon = link.icon;
              const isActive = currentPath === link.to;
              
              return (
                <Link key={link.to} to={link.to}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {t(link.label)}
                  </Button>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden md:flex items-center gap-2">
            <ToggleTheme />
            <SettingsButton />
          </div>

          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="px-2 w-80">
                <SheetHeader className="text-left">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
                        <span className="text-primary-foreground font-bold text-sm">C</span>
                      </div>
                      {t("appName")}
                    </SheetTitle>
                  </div>
                </SheetHeader>

                <div className="flex flex-col gap-6 mt-8">
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                      Navigation
                    </h3>
                    <nav className="flex flex-col gap-1">
                      {navigationLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = currentPath === link.to;
                        
                        return (
                          <Link key={link.to} to={link.to}>
                            <Button
                              variant={isActive ? "secondary" : "ghost"}
                              className="w-full justify-start gap-3 h-12"
                            >
                              <Icon className="h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span className="font-medium">{t(link.label)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {t(link.label.replace('title', 'subtitle'))}
                                </span>
                              </div>
                              {isActive && (
                                <Badge variant="secondary" className="ml-auto text-xs">
                                  {t("settingsActive")}
                                </Badge>
                              )}
                            </Button>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
                      {t("navQuickSettings")}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t("settingsTheme")}</span>
                        <ToggleTheme />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Link to="/settings">
                      <Button variant="outline" className="w-full gap-2 h-12">
                        <Settings className="h-5 w-5" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{t("titleSettings")}</span>
                          <span className="text-xs text-muted-foreground">
                            {t("navAdvancedConfiguration")}
                          </span>
                        </div>
                      </Button>
                    </Link>
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="text-center text-xs text-muted-foreground">
                      <p>{t("appName")} v1.0.0</p>
                      <p>{t("navProfessionalYouTubeTools")}</p>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
