/**
 * AppNavigationMenu - Main navigation header
 * Desktop nav links + mobile hamburger menu with theme toggle and settings.
 */

import { FolderOpen, Home, Menu, Settings } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import SettingsButton from './settings-button'
import ToggleTheme from './theme-toggle'
import { useTranslation } from 'react-i18next'

const navigationLinks = [
  { to: '/', label: 'titleHomePage', icon: Home },
  { to: '/library', label: 'titleLibrary', icon: FolderOpen },
]

export default function AppNavigationMenu() {
  const { t } = useTranslation()
  const location = useLocation()
  const currentPath = location.pathname

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="flex h-14 items-center px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="bg-primary flex h-6 w-6 items-center justify-center rounded">
              <span className="text-primary-foreground text-sm font-bold">C</span>
            </div>
            <span className="text-lg font-semibold">{t('appName')}</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navigationLinks.map(link => {
              const Icon = link.icon
              const isActive = currentPath === link.to

              return (
                <Link key={link.to} to={link.to}>
                  <Button variant={isActive ? 'secondary' : 'ghost'} size="sm" className="gap-2">
                    <Icon className="h-4 w-4" />
                    {t(link.label)}
                  </Button>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
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
              <SheetContent side="right" className="w-80 px-2">
                <SheetHeader className="text-left">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="flex items-center gap-2">
                      <div className="bg-primary flex h-6 w-6 items-center justify-center rounded">
                        <span className="text-primary-foreground text-sm font-bold">C</span>
                      </div>
                      {t('appName')}
                    </SheetTitle>
                  </div>
                </SheetHeader>

                <div className="mt-8 flex flex-col gap-6">
                  <div>
                    <h3 className="text-muted-foreground mb-3 text-sm font-medium tracking-wider uppercase">
                      {t('navNavigation')}
                    </h3>
                    <nav className="flex flex-col gap-1">
                      {navigationLinks.map(link => {
                        const Icon = link.icon
                        const isActive = currentPath === link.to

                        return (
                          <Link key={link.to} to={link.to}>
                            <Button
                              variant={isActive ? 'secondary' : 'ghost'}
                              className="h-12 w-full justify-start gap-3"
                            >
                              <Icon className="h-5 w-5" />
                              <div className="flex flex-col items-start">
                                <span className="font-medium">{t(link.label)}</span>
                                <span className="text-muted-foreground text-xs">
                                  {t(link.label.replace('title', 'subtitle'))}
                                </span>
                              </div>
                              {isActive && (
                                <Badge variant="secondary" className="ml-auto text-xs">
                                  {t('settingsActive')}
                                </Badge>
                              )}
                            </Button>
                          </Link>
                        )
                      })}
                    </nav>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-muted-foreground mb-3 text-sm font-medium tracking-wider uppercase">
                      {t('navQuickSettings')}
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('settingsTheme')}</span>
                        <ToggleTheme />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <Link to="/settings">
                      <Button variant="outline" className="h-12 w-full gap-2">
                        <Settings className="h-5 w-5" />
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{t('titleSettings')}</span>
                          <span className="text-muted-foreground text-xs">{t('navAdvancedConfiguration')}</span>
                        </div>
                      </Button>
                    </Link>
                  </div>

                  <div className="mt-auto pt-6">
                    <div className="text-muted-foreground text-center text-xs">
                      <p>{t('appName')} v1.0.0</p>
                      <p>{t('navProfessionalYouTubeTools')}</p>
                    </div>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  )
}
