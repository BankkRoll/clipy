/**
 * SettingsButton - Navigation button to settings page
 */

import { Settings } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

export default function SettingsButton() {
  const { t } = useTranslation()

  return (
    <Link to="/settings">
      <Button
        variant="outline"
        size="icon"
        className="hover:bg-accent h-8 w-8 transition-colors"
        aria-label={t('titleSettings')}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </Link>
  )
}
