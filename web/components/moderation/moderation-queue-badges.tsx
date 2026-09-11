'use client'

import { Badge } from '@/components/ui/badge'
import { TimeAgo } from '@/components/shared/time-ago'
import { useNow } from '@/hooks/use-now'
import { cn } from '@/lib/utils'
import { useTranslations } from '@/lib/i18n/use-translations'

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

export function ModerationSlaBadge({ createdAt }: { createdAt: string }) {
  const t = useTranslations()
  const now = useNow()
  const createdAtMs = new Date(createdAt).getTime()
  const ageMs = Number.isFinite(createdAtMs) && now !== null ? now - createdAtMs : null
  const tier =
    ageMs === null ? 'unknown' : ageMs < ONE_HOUR_MS ? 'fresh' : ageMs < ONE_DAY_MS ? 'due' : 'late'

  return (
    <Badge
      variant='outline'
      className={cn(
        'gap-1 whitespace-nowrap',
        tier === 'fresh' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        tier === 'due' && 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        tier === 'late' && 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
      )}
      data-pw='moderation-sla-badge'
    >
      <span>{t('extracted.moderation.moderationQueueBadges.age_39b7370f')}</span>
      <TimeAgo date={createdAt} />
    </Badge>
  )
}

export function ReportCountBadge({ count }: { count: number | null | undefined }) {
  const reportCount = typeof count === 'number' && Number.isFinite(count) ? count : 1
  return (
    <Badge
      variant='secondary'
      className='whitespace-nowrap'
      data-pw='moderation-report-count-badge'
    >
      {reportCount} report{reportCount === 1 ? '' : 's'}
    </Badge>
  )
}
