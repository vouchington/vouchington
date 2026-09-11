'use client'

import { TimeAgo } from '@/components/shared/time-ago'
import type { ModerationAppeal } from '@/types/appeals'
import { useTranslations } from '@/lib/i18n/use-translations'

interface MemberAppealRowProps {
  appeal: ModerationAppeal
}

function targetLabel(appeal: ModerationAppeal): string {
  if (appeal.community_ban_id) return 'Community ban'
  if (appeal.user_warning_id) return 'Warning'
  if (appeal.user_suspension_id) return 'Platform suspension'
  if (appeal.post_id && appeal.post_removal_kind === 'community') return 'Community post removal'
  if (appeal.post_id && appeal.post_removal_kind === 'platform') return 'Platform post removal'
  if (appeal.post_id) return 'Post removal'
  return 'Unknown'
}

export function MemberAppealRow({ appeal }: MemberAppealRowProps) {
  const t = useTranslations()
  return (
    <tr data-pw='member-appeal-row'>
      <td className='whitespace-nowrap px-4 py-3 text-sm tabular-nums'>
        <TimeAgo date={appeal.created_at} />
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='text-xs'>{targetLabel(appeal)}</span>
      </td>
      <td className='px-4 py-3 text-sm'>
        <span className='inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border'>
          {appeal.status}
        </span>
      </td>
      {appeal.sent_at && appeal.public_response ? (
        <td className='max-w-xs px-4 py-3 text-sm'>
          <p className='text-sm'>{appeal.public_response}</p>
        </td>
      ) : (
        <td className='px-4 py-3 text-xs text-muted-foreground'>
          {t('extracted.appeals.memberAppealRow.pendingReview_f1c45f3f')}
        </td>
      )}
    </tr>
  )
}
