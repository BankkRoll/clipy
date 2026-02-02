/**
 * HeroSection - Home page hero component
 * Centered landing area with scaling CLIPY background and URL input.
 */

import { CheckCircle, Clock, FolderOpen, Link as LinkIcon, Loader2, Settings, Shield, Sparkles } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isSuccessResponse } from '@/types/api'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

export function HeroSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  const validateUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError(null)
      return false
    }
    const youtubePattern =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]+/
    if (!youtubePattern.test(url.trim())) {
      setUrlError(t('errorInvalidYoutubeUrl'))
      return false
    }
    setUrlError(null)
    return true
  }

  const handleUrlChange = (value: string) => {
    setYoutubeUrl(value)
    validateUrl(value)
  }

  const isValidUrl = youtubeUrl.trim() && !urlError

  const handleProcessUrl = async () => {
    if (!isValidUrl || isLoading) return

    setIsLoading(true)

    try {
      const url = youtubeUrl.trim()

      // Fetch video info BEFORE navigating - keep loading state on button
      const response = await window.electronAPI.downloadManager.getStreamingInfo(url)

      if (!isSuccessResponse(response)) {
        throw new Error(response.error || 'Failed to get video info')
      }

      const { videoInfo, streamingUrl } = response.data

      if (!streamingUrl) {
        throw new Error('No streaming URL available for this video. It may require authentication.')
      }

      // Success! Now navigate to editor
      toast.success(`Loading: ${videoInfo.title}`)
      navigate({ to: '/editor', search: { url } })
    } catch (error) {
      const message = error instanceof Error ? error.message : t('errorGeneric')
      toast.error(message)
      setIsLoading(false)
    }
  }

  const stats = [
    { icon: CheckCircle, text: t('heroStats4KSupport') },
    { icon: Clock, text: t('heroStatsRealTime') },
    { icon: Sparkles, text: t('heroStatsLossless') },
    { icon: Shield, text: t('heroStatsPrivacy') },
  ]

  return (
    <div className="relative flex min-h-[calc(100vh-4rem)] w-full items-center justify-center overflow-hidden">
      {/* Scaling background text - positioned behind URL input */}
      <div className="pointer-events-none absolute inset-x-0 top-[15%] flex justify-center select-none">
        <span
          className="text-muted/10 font-black tracking-tighter"
          style={{ fontSize: 'clamp(8rem, 30vw, 32rem)', lineHeight: 1 }}
        >
          {t('appName')}
        </span>
      </div>

      {/* Main content - truly centered */}
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center px-6">
        {/* URL Input */}
        <div className="w-full">
          <div className="bg-background/60 rounded-xl border-2 border-dashed border-white/10 p-6 backdrop-blur-md">
            <div className="text-muted-foreground mb-3 flex items-center justify-center gap-2">
              <LinkIcon className="h-4 w-4" />
              <span className="text-sm font-medium">{t('heroDropLinkDownload')}</span>
            </div>
            <div className="relative">
              <Input
                value={youtubeUrl}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder={t('heroUrlPlaceholder')}
                className="bg-background/80 h-12 border-2 pr-28 text-base"
                onKeyDown={e => e.key === 'Enter' && handleProcessUrl()}
                disabled={isLoading}
              />
              <Button
                onClick={handleProcessUrl}
                disabled={!isValidUrl || isLoading}
                className="absolute top-1 right-1 h-10 min-w-[100px] px-5 text-sm font-semibold"
                variant={isValidUrl ? 'default' : 'outline'}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('btnLoading')}
                  </>
                ) : (
                  t('heroGet1Click')
                )}
              </Button>
            </div>
            {/* Error message - fixed height to prevent layout shift */}
            <div className="mt-2 h-5">
              {urlError && <p className="text-destructive text-center text-xs">{urlError}</p>}
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 flex justify-center gap-2">
          <Link to="/library">
            <Button variant="ghost" size="sm" className="h-16 w-16 flex-col gap-1.5 p-3">
              <div className="bg-primary/10 rounded-md p-1.5">
                <FolderOpen className="text-primary h-4 w-4" />
              </div>
              <span className="text-[10px] font-medium">{t('titleLibrary')}</span>
            </Button>
          </Link>

          <Link to="/settings">
            <Button variant="ghost" size="sm" className="h-16 w-16 flex-col gap-1.5 p-3">
              <div className="bg-primary/10 rounded-md p-1.5">
                <Settings className="text-primary h-4 w-4" />
              </div>
              <span className="text-[10px] font-medium">{t('titleSettings')}</span>
            </Button>
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <div
                key={index}
                className="text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1.5 text-[11px] transition-colors"
              >
                <Icon className="h-3 w-3" />
                <span className="font-medium">{stat.text}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
