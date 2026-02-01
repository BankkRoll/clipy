import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, Clock, FolderOpen, Link as LinkIcon, Settings, Shield, Sparkles } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function HeroSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [youtubeUrl, setYoutubeUrl] = useState('')

  const handleProcessUrl = () => {
    if (youtubeUrl.trim()) {
      navigate({ to: '/downloader', search: { url: youtubeUrl } })
    }
  }

  const stats = [
    { icon: CheckCircle, text: t('heroStats4KSupport') },
    { icon: Clock, text: t('heroStatsRealTime') },
    { icon: Sparkles, text: t('heroStatsLossless') },
    { icon: Shield, text: t('heroStatsPrivacy') },
  ]

  return (
    <div className="relative m-auto flex h-full w-full flex-col items-center justify-center overflow-hidden py-6">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        <div className="text-muted/20 text-[18rem] leading-none font-black tracking-tighter md:text-[22rem] lg:text-[25rem]">
          {t('appName')}
        </div>
      </div>
      <div className="relative z-10 mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-10">
        <div className="mb-6 flex justify-center">
          <Badge variant="secondary" className="gap-2 px-4 py-1.5 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            {t('heroProfessionalTools')}
            <Badge variant="outline" className="ml-2 text-xs">
              {t('heroFree')}
            </Badge>
          </Badge>
        </div>

        <div className="mb-6 w-full">
          <Card className="border-muted-foreground/30 bg-muted/20 border-2 border-dashed backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-muted-foreground mb-2 flex items-center gap-2">
                    <LinkIcon className="h-4 w-4" />
                    <span className="text-sm font-medium">{t('heroDropLinkDownload')}</span>
                  </div>
                  <div className="relative">
                    <Input
                      value={youtubeUrl}
                      onChange={e => setYoutubeUrl(e.target.value)}
                      placeholder={t('heroUrlPlaceholder')}
                      className="bg-background/80 h-12 border-2 pr-32 text-base"
                      onKeyPress={e => e.key === 'Enter' && handleProcessUrl()}
                    />
                    <Button
                      onClick={handleProcessUrl}
                      disabled={!youtubeUrl.trim()}
                      className="absolute top-1 right-1 h-10 px-6 text-sm font-semibold"
                      variant={youtubeUrl.trim() ? 'default' : 'outline'}
                    >
                      {t('heroGet1Click')}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-16">
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3">
            <Link to="/library">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="bg-primary/10 rounded-md p-2">
                  <FolderOpen className="text-primary h-5 w-5" />
                </div>
                <span className="text-xs font-medium">{t('titleLibrary')}</span>
              </Button>
            </Link>

            <Link to="/settings">
              <Button variant="ghost" size="sm" className="h-20 w-20 flex-col gap-2 p-4">
                <div className="bg-primary/10 rounded-md p-2">
                  <Settings className="text-primary h-5 w-5" />
                </div>
                <span className="text-xs font-medium">{t('titleSettings')}</span>
              </Button>
            </Link>
          </div>
        </div>

        <div className="border-border/50 border-t pt-8">
          <div className="mx-auto flex flex-wrap items-center justify-center gap-6">
            {stats.map((stat, index) => {
              const Icon = stat.icon
              return (
                <div
                  key={index}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs transition-colors"
                >
                  <Icon className="h-3 w-3" />
                  <span className="font-medium">{stat.text}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
