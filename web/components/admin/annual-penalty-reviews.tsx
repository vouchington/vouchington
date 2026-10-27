'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { userHref } from '@/lib/links/entity-href'
import { formatUtcDate } from '@ts-shared/utils/format'
import {
  useAnnualPenaltyReviews,
  type DuePenalty,
  type AnnualPenaltyReviewsProps,
} from './use-annual-penalty-reviews'
export type { AnnualPenaltyReviewsProps } from './use-annual-penalty-reviews'

/** A visible, bounded staff queue for active penalties whose annual review is due. */
export function AnnualPenaltyReviews<P extends DuePenalty>(props: AnnualPenaltyReviewsProps<P>) {
  return (
    <AnnualPenaltyReviewsInner
      key={JSON.stringify(props.initialDuePage)}
      {...props}
    />
  )
}

function AnnualPenaltyReviewsInner<P extends DuePenalty>({
  getDue,
  excludedIds,
  initialDuePage,
  review,
  revoke,
  reconcile,
}: AnnualPenaltyReviewsProps<P>) {
  const t = useTranslations()
  const locale = useUiLocale()
  const {
    due,
    nextCursor,
    loading,
    pendingId,
    confirmingRevokeId,
    error,
    actionErrorId,
    refresh,
    applyAction,
    loadMore,
    revokePenalty,
  } = useAnnualPenaltyReviews({ initialDuePage, excludedIds, getDue, review, revoke, reconcile })

  return (
    <section
      className='rounded-lg border p-4'
      aria-label={t('moderation.penaltyReviews.title')}
    >
      <div className='flex items-center justify-between gap-4'>
        <div>
          <h2 className='text-lg font-semibold'>{t('moderation.penaltyReviews.title')}</h2>
          <p className='text-sm text-muted-foreground'>
            {t('moderation.penaltyReviews.description')}
          </p>
        </div>
        <Button
          variant='outline'
          size='touchSm'
          disabled={loading}
          onClick={() => refresh()}
        >
          {t('moderation.penaltyReviews.refresh')}
        </Button>
      </div>
      {error ? (
        <p
          role='alert'
          className='mt-3 text-sm text-destructive'
        >
          {t('moderation.penaltyReviews.loadFailed')}
        </p>
      ) : null}
      {actionErrorId && !due.some(penalty => penalty.id === actionErrorId) ? (
        <p
          role='alert'
          className='mt-3 text-sm text-destructive'
        >
          {t('extracted.flags.integrityPenalties.resultUncertain_e24ec07b')}
        </p>
      ) : null}
      {!loading && !error && due.length === 0 ? (
        <p className='mt-3 text-sm text-muted-foreground'>{t('moderation.penaltyReviews.empty')}</p>
      ) : null}
      {due.length > 0 ? (
        <ul className='mt-4 divide-y'>
          {due.map(penalty => (
            <li
              key={penalty.id}
              className='flex flex-wrap items-center justify-between gap-3 py-3'
            >
              <div className='text-sm'>
                {penalty.user_username ? (
                  <Link
                    href={userHref({ id: penalty.user_id, username: penalty.user_username })}
                    className='text-link hover:underline'
                  >
                    {penalty.user_username}
                  </Link>
                ) : (
                  <span>{t('extracted.communities.communityMemberRow.unknownUser_0bca6947')}</span>
                )}
                <span className='ml-3'>{penalty.reason}</span>
                <div className='text-muted-foreground'>
                  {t('moderation.penaltyReviews.due')}:{' '}
                  <time dateTime={penalty.review_due_at}>
                    {formatUtcDate(penalty.review_due_at, locale)}
                  </time>
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  size='touchSm'
                  disabled={pendingId !== null || loading}
                  onClick={() => applyAction(penalty.id, review)}
                >
                  {t('moderation.penaltyReviews.confirm')}
                </Button>
                <Button
                  variant={confirmingRevokeId === penalty.id ? 'destructive' : 'outline'}
                  size='touchSm'
                  disabled={pendingId !== null || loading}
                  onClick={() => revokePenalty(penalty.id)}
                >
                  {t(
                    confirmingRevokeId === penalty.id
                      ? 'extracted.flags.integrityPenalties.confirmRevoke_3ec93b2c'
                      : 'extracted.flags.integrityPenalties.revoke_ec2f3e37',
                  )}
                </Button>
              </div>
              {actionErrorId === penalty.id ? (
                <p
                  role='alert'
                  className='text-sm text-destructive'
                >
                  {t('extracted.flags.integrityPenalties.resultUncertain_e24ec07b')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {nextCursor ? (
        <Button
          variant='outline'
          disabled={loading || pendingId !== null}
          onClick={loadMore}
        >
          {t('extracted.communities.communityAgentPromptHistory.loadMore_ac8991ef')}
        </Button>
      ) : null}
    </section>
  )
}
