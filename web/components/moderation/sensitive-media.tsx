'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SensitiveMediaProps {
  children: React.ReactNode
  disabled?: boolean
  onReveal?: () => void
}

/**
 * Wraps media behind a blur/reveal gate for moderators reviewing potentially disturbing content.
 * Renders a blurred placeholder until the moderator explicitly clicks to reveal.
 */
export function SensitiveMedia({ children, disabled = false, onReveal }: SensitiveMediaProps) {
  const t = useTranslations()
  const [revealed, setRevealed] = useState(false)

  function handleReveal() {
    if (disabled) return
    setRevealed(true)
    onReveal?.()
  }

  return revealed ? (
    children
  ) : (
    <div
      className='relative overflow-hidden rounded'
      data-pw='sensitive-media'
    >
      <div
        inert
        aria-hidden='true'
        className='pointer-events-none select-none blur-xl brightness-50 saturate-0'
      >
        {children}
      </div>
      <Button
        type='button'
        variant='ghost'
        disabled={disabled}
        onClick={handleReveal}
        className='absolute inset-0 h-auto w-auto flex-col gap-1 rounded-none text-white hover:bg-transparent hover:text-white'
        data-pw='sensitive-media-reveal'
      >
        <span className='text-sm font-medium'>
          {t('extracted.moderation.sensitiveMedia.sensitiveContent_5c5836f6')}
        </span>
        <span className='text-xs opacity-75'>
          {t('extracted.moderation.sensitiveMedia.clickToReveal_dca25e98')}
        </span>
      </Button>
    </div>
  )
}
