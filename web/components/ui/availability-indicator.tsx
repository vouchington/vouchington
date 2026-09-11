'use client'

import type { ReactNode } from 'react'
import { CheckCircle } from 'lucide-react'
import type { AvailabilityStatus } from '@/hooks/use-availability-check'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  status: AvailabilityStatus
  /** Label to show (e.g. "slug", "name", "username") */
  label?: string
  /** Slot for the conflict link / text rendered after "… used:" */
  conflict?: ReactNode
}

export function AvailabilityIndicator({ status, label: labelProp, conflict }: Props) {
  const t = useTranslations()

  if (status === 'idle' || status === 'checking') return null

  const label = labelProp ?? t('extracted.ui.availabilityIndicator.slug_cd03861f')

  if (status === 'available') {
    return (
      <p
        className='flex items-center gap-1 text-xs text-green-600 dark:text-green-500'
        data-pw='availability-indicator-available'
      >
        <CheckCircle
          className='size-3 shrink-0'
          aria-hidden
        />
        {t('extracted.ui.availabilityIndicator.labelAvailable_705eadd4', { label })}
      </p>
    )
  }

  if (status === 'taken') {
    return (
      <p
        className={cn('text-xs text-destructive')}
        data-pw='availability-indicator-taken'
      >
        {conflict ? (
          <>
            {t('extracted.ui.availabilityIndicator.labelUsed_2719ee64', { label })} {conflict}
          </>
        ) : (
          t('extracted.ui.availabilityIndicator.labelIsAlreadyTaken_8502b7f5', { label })
        )}
      </p>
    )
  }

  // status === 'error'
  return (
    <p
      className='text-xs text-muted-foreground'
      data-pw='availability-indicator-error'
    >
      {t('extracted.ui.availabilityIndicator.couldNotVerifyLabelAvailability_a4e95362', { label })}
    </p>
  )
}
