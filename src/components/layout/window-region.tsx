import { Minus, Square, X } from 'lucide-react'

import React from 'react'
import { useTranslation } from 'react-i18next'

// Window control functions
const minimizeWindow = async () => {
  try {
    await window.electronAPI.window.minimize()
  } catch (error) {
    console.error('Failed to minimize window:', error)
  }
}

const maximizeWindow = async () => {
  try {
    await window.electronAPI.window.maximize()
  } catch (error) {
    console.error('Failed to maximize window:', error)
  }
}

const closeWindow = async () => {
  try {
    await window.electronAPI.window.close()
  } catch (error) {
    console.error('Failed to close window:', error)
  }
}

interface DragWindowRegionProps {
  title?: React.ReactNode
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  return (
    <div className="bg-background/80 flex h-8 w-full items-center justify-between border-b backdrop-blur-sm">
      <div className="draglayer h-full flex-1" />
      <WindowButtons />
    </div>
  )
}

function WindowButtons() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full">
      <button
        title={t('windowMinimize')}
        type="button"
        className="hover:bg-accent/50 group flex h-full w-12 items-center justify-center transition-colors"
        onClick={minimizeWindow}
      >
        <Minus className="text-muted-foreground group-hover:text-foreground h-3 w-3" />
      </button>

      <button
        title={t('windowMaximize')}
        type="button"
        className="hover:bg-accent/50 group flex h-full w-12 items-center justify-center transition-colors"
        onClick={maximizeWindow}
      >
        <Square className="text-muted-foreground group-hover:text-foreground h-3 w-3" />
      </button>

      <button
        type="button"
        title={t('windowClose')}
        className="hover:bg-destructive/90 hover:text-destructive-foreground group flex h-full w-12 items-center justify-center transition-colors"
        onClick={closeWindow}
      >
        <X className="text-muted-foreground group-hover:text-destructive-foreground h-3 w-3" />
      </button>
    </div>
  )
}
