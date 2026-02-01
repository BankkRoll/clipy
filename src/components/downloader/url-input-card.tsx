import { Card, CardContent } from '@/components/ui/card'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Link as LinkIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface UrlInputCardProps {
  onSubmit: (url: string) => void
  isLoading: boolean
}

export function UrlInputCard({ onSubmit, isLoading }: UrlInputCardProps) {
  const { t } = useTranslation()
  const [youtubeUrl, setYoutubeUrl] = useState('')

  const handleProcessUrl = () => {
    if (youtubeUrl.trim()) {
      onSubmit(youtubeUrl)
    }
  }

  return (
    <div className="relative m-auto flex h-full w-full flex-col items-center justify-center overflow-hidden py-6 pt-24">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
        <div className="text-muted/20 text-[18rem] leading-none font-black tracking-tighter md:text-[22rem] lg:text-[25rem]">
          {t('appName')}
        </div>
      </div>
      <div className="relative z-10 mx-auto flex max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <div className="w-full py-12">
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
                      className="bg-background/80 h-12 min-w-[500px] border-2 pr-32 text-base"
                      onKeyPress={e => e.key === 'Enter' && handleProcessUrl()}
                    />
                    <Button
                      onClick={handleProcessUrl}
                      disabled={!youtubeUrl.trim() || isLoading}
                      className="absolute top-1 right-1 h-10"
                      variant={youtubeUrl.trim() && !isLoading ? 'default' : 'outline'}
                    >
                      {isLoading ? t('btnLoading') : t('heroGet1Click')}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
