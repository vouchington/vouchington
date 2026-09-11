'use client'

import type { VoteIntegrityFlag } from '@/types/vote-integrity'
import { ResolutionBadge } from './vote-integrity-resolution-badge'
import { useTranslations } from '@/lib/i18n/use-translations'

export function VoteIntegrityFlagStatus({ flag }: { flag: VoteIntegrityFlag }) {
  const t = useTranslations()
  if (!flag.resolved_at) {
    return (
      <span className='rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800'>
        {t('extracted.flags.voteIntegrityFlagsTable.pending_62a2fed3')}
      </span>
    )
  }
  if (flag.resolution) return <ResolutionBadge resolution={flag.resolution} />
  return (
    <span className='text-xs text-muted-foreground'>
      {t('extracted.flags.voteIntegrityFlagsTable.resolved_dc676b42')}
    </span>
  )
}
