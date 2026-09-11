'use client'

import { fmtAge } from './user-mod-notes-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { UserModerationContext } from '@/types/api-responses'

interface UserModContextSummaryProps {
  context: UserModerationContext
}

export function UserModContextSummary({ context }: UserModContextSummaryProps) {
  const t = useTranslations()
  return (
    <div className='space-y-1 rounded bg-muted px-3 py-2 text-xs'>
      <div className='flex gap-2'>
        <span className='text-muted-foreground'>
          {t('extracted.moderation.userModNotesPanel.accountAge_ab747574')}
        </span>
        <span>{fmtAge(context.account_age_ms)}</span>
      </div>
      {context.trust_tier !== null && (
        <div className='flex gap-2'>
          <span className='text-muted-foreground'>
            {t('extracted.moderation.userModNotesPanel.trustTier_d842f5cb')}
          </span>
          <span>{context.trust_tier}</span>
        </div>
      )}
      {context.content_removal_count !== null && (
        <div className='flex gap-2'>
          <span className='text-muted-foreground'>
            {t('extracted.moderation.userModNotesPanel.removals_3ea0e00f')}
          </span>
          <span>
            {t(
              'extracted.moderation.userModContextSummary.contentcountContentCommunitycountCommunity_93476367',
              {
                contentCount: context.content_removal_count,
                communityCount: context.community_removal_count,
              },
            )}
          </span>
        </div>
      )}
      {context.active_suspension && (
        <div className='mt-1 rounded bg-destructive/10 px-2 py-1 font-medium text-destructive'>
          {t('extracted.moderation.userModContextSummary.suspended_e392a389')}
          {context.active_suspension.suspended_reason && (
            <span className='ml-1 font-normal text-muted-foreground'>
              —{' '}
              {t('extracted.moderation.userModContextSummary.reason_c344c2f3', {
                reason: context.active_suspension.suspended_reason,
              })}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
