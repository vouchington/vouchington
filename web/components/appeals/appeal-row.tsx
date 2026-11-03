'use client'

import { Button } from '@/components/ui/button'
import { TimeAgo } from '@/components/shared/time-ago'
import type { ModerationAppealSummary } from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AppealContext } from './appeal-context'

interface AppealRowProps {
  appeal: ModerationAppealSummary
  disabled: boolean
  onOpen: (id: string) => void
}

/** A summary row; the reason, drafts and notes load from the detail read when staff open it. */
export function AppealRow({ appeal, disabled, onOpen }: AppealRowProps) {
  const t = useTranslations()
  return (
    <tr
      data-pw='appeal-row'
      data-appeal-id={appeal.id}
    >
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={appeal.created_at} />
        {appeal.is_overdue ? (
          <span className='ml-1 text-xs font-medium text-destructive'>
            {t('extracted.appeals.appealRow.overdue_7038dedb')}
          </span>
        ) : null}
      </td>
      <td className='px-4 py-3 text-sm'>
        <AppealContext appeal={appeal} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {appeal.status}
        </span>
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        {appeal.has_ai_draft ? (
          <p className='text-xs font-medium text-muted-foreground'>
            {t('extracted.appeals.appealRow.aiRecommendedaction_a89b7966', {
              recommendedAction: appeal.recommended_action,
            })}
          </p>
        ) : (
          <span className='text-xs text-muted-foreground'>
            {t('extracted.appeals.appealRow.noDraftYet_711e568f')}
          </span>
        )}
      </td>
      <td className='max-w-xs px-4 py-3 text-sm'>
        <span className='text-xs'>{appeal.public_response ?? '—'}</span>
      </td>
      <td className='px-4 py-3'>
        <Button
          size='touchSm'
          variant='outline'
          disabled={disabled}
          onClick={() => onOpen(appeal.id)}
          data-pw='appeal-open'
        >
          {t('extracted.appeals.appealRow.review_aff0766a')}
        </Button>
      </td>
    </tr>
  )
}
