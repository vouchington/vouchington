'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPreference, setPreference } from '@/lib/preferences/storage'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DismissibleAsideProps {
  dismissKey: string
  children: ReactNode
}

function subscribeToStaticSnapshot() {
  return () => {}
}

export function DismissibleAside({ dismissKey, children }: DismissibleAsideProps) {
  const t = useTranslations()
  const storedDismissed = useSyncExternalStore(
    subscribeToStaticSnapshot,
    () => getPreference(dismissKey) === 'dismissed',
    () => true,
  )
  const [localDismissed, setLocalDismissed] = useState<{ key: string; dismissed: boolean } | null>(
    null,
  )
  const dismissed = localDismissed?.key === dismissKey ? localDismissed.dismissed : false

  function handleDismiss() {
    setPreference(dismissKey, 'dismissed')
    setLocalDismissed({ key: dismissKey, dismissed: true })
  }

  if (dismissed || storedDismissed) return null

  const sectionLabel = dismissKey.replace(/^aside-/, '').replace(/-/g, ' ')
  const label = t('extracted.asides.dismissibleAside.dismissSectionlabel_15330092', {
    sectionLabel,
  })

  return (
    <div className='relative'>
      <Button
        variant='ghost'
        size='icon'
        className='absolute right-1 top-1 z-10 h-11 w-11'
        onClick={handleDismiss}
        aria-label={label}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`dismissible-aside-button-${dismissKey}`}
      >
        <X className='h-3 w-3' />
      </Button>
      {children}
    </div>
  )
}
