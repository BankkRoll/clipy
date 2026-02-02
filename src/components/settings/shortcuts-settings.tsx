/**
 * ShortcutsSettings - Keyboard shortcuts configuration
 */

import type { AppConfig, KeyboardShortcut } from '@/types/system'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Keyboard, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isSuccessResponse } from '@/types/api'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

const defaultShortcuts: KeyboardShortcut[] = [
  { action: 'playPause', key: 'Space', modifiers: [] },
  { action: 'seekBack5', key: 'ArrowLeft', modifiers: [] },
  { action: 'seekForward5', key: 'ArrowRight', modifiers: [] },
  { action: 'seekBack10', key: 'j', modifiers: [] },
  { action: 'seekForward10', key: 'l', modifiers: [] },
  { action: 'volumeUp', key: 'ArrowUp', modifiers: [] },
  { action: 'volumeDown', key: 'ArrowDown', modifiers: [] },
  { action: 'mute', key: 'm', modifiers: [] },
  { action: 'fullscreen', key: 'f', modifiers: [] },
  { action: 'setTrimStart', key: 'i', modifiers: [] },
  { action: 'setTrimEnd', key: 'o', modifiers: [] },
  { action: 'export', key: 'e', modifiers: ['ctrl'] },
  { action: 'save', key: 's', modifiers: ['ctrl'] },
]

const actionLabels: Record<string, string> = {
  playPause: 'Play / Pause',
  seekBack5: 'Seek Back 5s',
  seekForward5: 'Seek Forward 5s',
  seekBack10: 'Seek Back 10s',
  seekForward10: 'Seek Forward 10s',
  volumeUp: 'Volume Up',
  volumeDown: 'Volume Down',
  mute: 'Mute / Unmute',
  fullscreen: 'Toggle Fullscreen',
  setTrimStart: 'Set Trim Start',
  setTrimEnd: 'Set Trim End',
  export: 'Export Video',
  save: 'Save Project',
}

const actionCategories = {
  playback: ['playPause', 'seekBack5', 'seekForward5', 'seekBack10', 'seekForward10'],
  audio: ['volumeUp', 'volumeDown', 'mute'],
  editing: ['setTrimStart', 'setTrimEnd', 'fullscreen'],
  general: ['export', 'save'],
}

export default function ShortcutsSettings() {
  const { t } = useTranslation()
  const [shortcuts, setShortcuts] = useState<KeyboardShortcut[]>(defaultShortcuts)
  const [isLoading, setIsLoading] = useState(true)
  const [editingAction, setEditingAction] = useState<string | null>(null)
  const [recordedKeys, setRecordedKeys] = useState<{ key: string; modifiers: string[] } | null>(null)

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await window.electronAPI.config.get()
        if (isSuccessResponse(response)) {
          const appConfig = response.data as AppConfig
          if (appConfig.shortcuts && appConfig.shortcuts.length > 0) {
            setShortcuts(appConfig.shortcuts)
          }
        }
      } catch (error) {
        console.error('Failed to fetch config:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchConfig()
  }, [])

  const handleSaveShortcuts = useCallback((newShortcuts: KeyboardShortcut[]) => {
    setShortcuts(newShortcuts)
    try {
      window.electronAPI.config.update({ shortcuts: newShortcuts } as any)
    } catch (error) {
      console.error('Failed to update shortcuts:', error)
    }
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, action: string) => {
      e.preventDefault()
      e.stopPropagation()

      // ESC cancels editing - never allow ESC to be bound
      if (e.key === 'Escape') {
        setEditingAction(null)
        setRecordedKeys(null)
        return
      }

      const modifiers: ('ctrl' | 'shift' | 'alt' | 'meta')[] = []
      if (e.ctrlKey) modifiers.push('ctrl')
      if (e.shiftKey) modifiers.push('shift')
      if (e.altKey) modifiers.push('alt')
      if (e.metaKey) modifiers.push('meta')

      // Ignore if only modifier keys pressed
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        return
      }

      const key = e.key === ' ' ? 'Space' : e.key

      // Check for conflicts
      const conflict = shortcuts.find(
        s =>
          s.action !== action &&
          s.key.toLowerCase() === key.toLowerCase() &&
          JSON.stringify(s.modifiers.sort()) === JSON.stringify(modifiers.sort()),
      )

      if (conflict) {
        toast.error(t('msgShortcutConflict', { action: actionLabels[conflict.action] }))
        return
      }

      // Update the shortcut
      const newShortcuts = shortcuts.map(s => (s.action === action ? { ...s, key, modifiers } : s))

      handleSaveShortcuts(newShortcuts)
      setEditingAction(null)
      setRecordedKeys(null)
      toast.success(t('msgShortcutUpdated'))
    },
    [shortcuts, handleSaveShortcuts, t],
  )

  const handleResetShortcuts = () => {
    handleSaveShortcuts(defaultShortcuts)
    toast.success(t('msgShortcutsReset'))
  }

  const formatShortcut = (shortcut: KeyboardShortcut) => {
    const parts: string[] = []
    if (shortcut.modifiers.includes('ctrl')) parts.push('Ctrl')
    if (shortcut.modifiers.includes('shift')) parts.push('Shift')
    if (shortcut.modifiers.includes('alt')) parts.push('Alt')
    if (shortcut.modifiers.includes('meta')) parts.push('Cmd')
    parts.push(shortcut.key === 'Space' ? '␣' : shortcut.key.toUpperCase())
    return parts.join(' + ')
  }

  const renderCategory = (title: string, actions: string[]) => (
    <div key={title} className="space-y-2">
      <h4 className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {t(`shortcutCategory${title.charAt(0).toUpperCase() + title.slice(1)}`)}
      </h4>
      <div className="space-y-1">
        {actions.map(action => {
          const shortcut = shortcuts.find(s => s.action === action)
          if (!shortcut) return null

          const isEditing = editingAction === action

          return (
            <div
              key={action}
              className={`flex items-center justify-between rounded-lg px-3 py-2 transition-colors ${
                isEditing ? 'bg-primary/10 ring-primary ring-2' : 'hover:bg-muted/50'
              }`}
            >
              <span className="text-foreground text-sm">{actionLabels[action]}</span>
              {isEditing ? (
                <Input
                  autoFocus
                  placeholder={t('settingsPressKeys')}
                  className="h-8 w-32 text-center font-mono text-xs"
                  onKeyDown={e => handleKeyDown(e, action)}
                  onBlur={() => {
                    setEditingAction(null)
                    setRecordedKeys(null)
                  }}
                  readOnly
                />
              ) : (
                <button
                  onClick={() => setEditingAction(action)}
                  className="hover:bg-muted rounded px-2 py-1 transition-colors"
                >
                  <Badge variant="secondary" className="font-mono text-xs">
                    {formatShortcut(shortcut)}
                  </Badge>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              {t('settingsShortcutsTitle')}
            </CardTitle>
            <CardDescription>{t('settingsShortcutsDescription')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetShortcuts}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('settingsResetDefaults')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-muted-foreground py-8 text-center">{t('loading')}</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            {renderCategory('playback', actionCategories.playback)}
            {renderCategory('audio', actionCategories.audio)}
            {renderCategory('editing', actionCategories.editing)}
            {renderCategory('general', actionCategories.general)}
          </div>
        )}

        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-muted-foreground text-xs">{t('settingsShortcutsHint')}</p>
        </div>
      </CardContent>
    </Card>
  )
}
