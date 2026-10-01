'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { UserPreservationHold } from '@/types/api-responses'

// Released holds stay visible as history; the reference is administrator-only like the open hold.
export function UserPreservationHoldHistory({ holds }: { holds: UserPreservationHold[] }) {
  const t = useTranslations()
  if (holds.length === 0) return null

  return (
    <div className='flex flex-col gap-2'>
      <h3 className='text-sm font-medium'>
        {t('extracted.admin.userPreservationHoldCard.holdHistory_4748f237')}
      </h3>
      <ul className='space-y-2'>
        {holds.map(hold => (
          <li
            key={hold.id}
            className='rounded-md border p-3 text-sm'
          >
            <p className='break-words'>{hold.reference}</p>
            <p className='text-muted-foreground'>
              {t('extracted.admin.userPreservationHoldCard.placed_f13a4870')}{' '}
              <TimeAgo date={hold.placed_at} />
            </p>
            <p className='text-muted-foreground'>
              {t('extracted.admin.userPreservationHoldCard.released_35d9bc51')}{' '}
              <TimeAgo date={hold.released_at} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
