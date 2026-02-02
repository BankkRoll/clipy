/**
 * Settings Page
 *
 * Comprehensive settings page with organized sections:
 * - Appearance (theme)
 * - Language selection
 * - Download preferences
 * - Editor/Export settings
 * - Notifications
 * - Privacy & History
 * - Keyboard shortcuts
 * - Storage management
 * - Advanced settings
 * - About/version info
 */

import AboutSettings from '@/components/settings/about-settings'
import AdvancedSettings from '@/components/settings/advanced-settings'
import AppearanceSettings from '@/components/settings/appearance-settings'
import DownloadSettings from '@/components/settings/download-settings'
import EditorSettings from '@/components/settings/editor-settings'
import LanguageSelector from '@/components/settings/language-selector'
import NotificationsSettings from '@/components/settings/notifications-settings'
import PrivacySettings from '@/components/settings/privacy-settings'
import ShortcutsSettings from '@/components/settings/shortcuts-settings'
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
          <AppearanceSettings />
          <LanguageSelector />
          <DownloadSettings />
          <EditorSettings />
          <NotificationsSettings />
          <PrivacySettings />
          <ShortcutsSettings />
          <StorageSettings />
          <AdvancedSettings />
          <AboutSettings />
        </div>
      </div>
    </div>
  )
}
