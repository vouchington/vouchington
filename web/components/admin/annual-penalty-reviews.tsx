'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { userHref } from '@/lib/links/entity-href'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { IntegrityPenaltyRecord } from './use-integrity-penalties'

type DuePenalty = IntegrityPenaltyRecord & { review_due_at: string; user_username: string | null }

export interface AnnualPenaltyReviewsProps<P extends DuePenalty> {
  getDue: () => Promise<{ results: P[]; has_more: boolean }>
  review: (id: string) => Promise<unknown>
  revoke: (id: string) => Promise<unknown>
}

/** A visible, bounded staff queue for active penalties whose annual review is due. */
export function AnnualPenaltyReviews<P extends DuePenalty>({
  getDue,
  review,
  revoke,
}: AnnualPenaltyReviewsProps<P>) {
  const t = useTranslations()
  const locale = useUiLocale()
  const [due, setDue] = useState<P[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [confirmingRevokeId, setConfirmingRevokeId] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [actionErrorId, setActionErrorId] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<P[] | null> => {
    setLoading(true)
    try {
      const result = await getDue()
      setDue(result.results)
      setHasMore(result.has_more)
      setError(false)
      return result.results
    } catch {
      setError(true)
      return null
    } finally {
      setLoading(false)
    }
  }, [getDue])

  useEffect(() => {
    let active = true
    getDue()
      .then(result => {
        if (!active) return
        setDue(result.results)
        setHasMore(result.has_more)
        setError(false)
      })
      .catch(() => {
        if (active) setError(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [getDue])

  async function applyAction(id: string, action: (id: string) => Promise<unknown>) {
    if (pendingId) return
    setConfirmingRevokeId(null)
    setPendingId(id)
    setActionErrorId(null)
    try {
      await action(id)
      await refresh()
    } catch {
      // The response can be lost after commit. The due queue is the authoritative outcome.
      const currentDue = await refresh()
      if (!currentDue || currentDue.some(penalty => penalty.id === id)) setActionErrorId(id)
    } finally {
      setPendingId(null)
    }
  }

  function revokePenalty(id: string) {
    if (pendingId) return
    if (confirmingRevokeId !== id) {
      setConfirmingRevokeId(id)
      return
    }
    void applyAction(id, revoke)
  }

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
      {hasMore ? (
        <p className='mt-3 text-sm text-muted-foreground'>{t('moderation.penaltyReviews.more')}</p>
      ) : null}
    </section>
  )
}
