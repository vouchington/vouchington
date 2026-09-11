'use client'

import type { ReportIntegrityFlag } from '@/types/report-integrity'
import { ReportIntegrityResolutionBadge } from './report-integrity-resolution-badge'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ReportIntegrityFlagStatus({ flag }: { flag: ReportIntegrityFlag }) {
  const t = useTranslations()
  if (!flag.resolved_at) {
    return (
      <span className='rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800'>
        {t('extracted.flags.reportIntegrityFlagsTable.pending_62a2fed3')}
      </span>
    )
  }
  if (flag.resolution) return <ReportIntegrityResolutionBadge resolution={flag.resolution} />
  return (
    <span className='text-xs text-muted-foreground'>
      {t('extracted.flags.reportIntegrityFlagsTable.resolved_dc676b42')}
    </span>
  )
}
