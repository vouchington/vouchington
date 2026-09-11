'use client'

import { Badge } from '@/components/ui/badge'
import type { SupportThread } from '@/types/support'
import { useTranslations } from '@/lib/i18n/use-translations'

export function SupportThreadStatusBadge({ status }: { status: SupportThread['status'] }) {
  const t = useTranslations()
  if (status === 'open') {
    return (
      <Badge
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`support-thread-status-${status}`}
        className='bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-200'
      >
        {t('extracted.support.supportThreadStatusBadge.open_2348f998')}
      </Badge>
    )
  }
  if (status === 'assigned') {
    return (
      <Badge
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`support-thread-status-${status}`}
        className='bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900 dark:text-blue-200'
      >
        {t('extracted.support.supportThreadStatusBadge.assigned_2ebb9294')}
      </Badge>
    )
  }
  return (
    <Badge
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`support-thread-status-${status}`}
      className='bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200'
    >
      {t('extracted.support.supportThreadStatusBadge.resolved_dc676b42')}
    </Badge>
  )
}
