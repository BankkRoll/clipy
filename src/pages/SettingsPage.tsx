/**
 * Settings Page
 *
 * Clean, minimal settings page with organized sections:
 * - Language selection
 * - Download preferences
 * - Storage management
 * - About/version info
 */

import AboutSettings from '@/components/settings/about-settings'
import DownloadSettings from '@/components/settings/download-settings'
import LanguageSelector from '@/components/settings/language-selector'
import StorageSettings from '@/components/settings/storage-settings'
import { useTranslation } from 'react-i18next'

export default function SettingsPage() {
  const { t } = useTranslation()

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-foreground text-3xl font-bold tracking-tight">{t('settingsTitle')}</h1>
          <p className="text-muted-foreground mt-2">{t('settingsSubtitle')}</p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          <LanguageSelector />
          <DownloadSettings />
          <StorageSettings />
          <AboutSettings />
        </div>
      </div>
    </div>
  )
}
