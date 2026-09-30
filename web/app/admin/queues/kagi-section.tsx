'use client'

import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import { QueuePauseSection } from './queue-pause-section'

const KAGI_SMALLWEB_QUEUE = 'kagi-smallweb'

function kagiCopy(t: ReturnType<typeof useTranslations>) {
  return {
    disableLabel: t('extracted.queues.kagiSection.disableKagiSmallweb_4074794b'),
    disabledLabel: t('extracted.queues.kagiSection.disabled_75081b59'),
    disabledMessage: t('extracted.queues.kagiSection.kagiSmallwebDisabled_690e9de0'),
    enableLabel: t('extracted.queues.kagiSection.enableKagiSmallweb_9708f935'),
    enabledLabel: t('extracted.queues.kagiSection.enabled_92c1cdfd'),
    enabledMessage: t('extracted.queues.kagiSection.kagiSmallwebEnabled_96f7a415'),
    errorFallback: t('extracted.queues.kagiSection.failedToToggleKagiSmallweb_57905ab3'),
    heading: t('extracted.queues.kagiSection.kagiSmallweb_fb55419b'),
    loadingLabel: t('extracted.queues.kagiSection.loading_ba3bbbe1'),
    retryLabel: t('extracted.queues.kagiSection.retryLoadingStatus_50b07fb2'),
  }
}

function renderKagiFrame(children: ReactNode) {
  return (
    <div
      className='mt-8'
      data-pw='kagi-section'
    >
      {children}
    </div>
  )
}

function renderKagiRetry({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      data-pw='kagi-retry'
      onClick={onClick}
      variant='outline'
    >
      {label}
    </Button>
  )
}

function renderKagiToggle({
  disabled,
  label,
  onClick,
  variant,
}: {
  disabled: boolean
  label: string
  onClick: () => void
  variant: 'default' | 'destructive'
}) {
  return (
    <Button
      data-pw='kagi-toggle'
      disabled={disabled}
      onClick={onClick}
      variant={variant}
    >
      {label}
    </Button>
  )
}

export function KagiSection() {
  const t = useTranslations()
  return (
    <QueuePauseSection
      copy={kagiCopy(t)}
      errorForm='admin-kagi-smallweb-toggle'
      queueName={KAGI_SMALLWEB_QUEUE}
      renderFrame={renderKagiFrame}
      renderRetry={renderKagiRetry}
      renderToggle={renderKagiToggle}
    />
  )
}
