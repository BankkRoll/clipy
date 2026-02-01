import AboutSettings from '@/components/settings/about-settings'
import DownloadSettings from '@/components/settings/download-settings'
import LanguageSelector from '@/components/settings/language-selector'
import { Separator } from '@/components/ui/separator'
import StorageSettings from '@/components/settings/storage-settings'
import { useTranslation } from 'react-i18next'

export default function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-6 py-8">
        <div className="mb-12">
          <div className="mb-4 flex items-center gap-4">
            <div>
              <h1 className="text-foreground text-4xl font-bold tracking-tight">{t('settingsTitle')}</h1>
              <p className="text-muted-foreground mt-1 text-lg">{t('settingsSubtitle')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-12">
          <section>
            <LanguageSelector />
          </section>

          <Separator className="bg-border/50 my-12" />

          <section>
            <DownloadSettings />
          </section>

          <Separator className="bg-border/50 my-12" />

          <section>
            <StorageSettings />
          </section>

          <Separator className="bg-border/50 my-12" />

          <section>
            <AboutSettings />
          </section>
        </div>
      </div>
    </div>
  )
}
