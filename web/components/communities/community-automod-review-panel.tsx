'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { recordCommunityAutomodFeedback } from '@/lib/api/client/community-automod'
import onError, { onSuccess } from '@/lib/on-error'
import type { CommunityAutomodAction, CommunityAutomodTrainingLabel } from '@/types/api-responses'
import { CommunityAutomodReviewAction } from './community-automod-review-action'
import type { PendingAutomodReviewAction } from './community-automod-review-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunityAutomodReviewPanelProps {
  actions: CommunityAutomodAction[]
  communitySlug: string
  stats: { total_count: number; false_positive_count: number; false_positive_rate: number }
}

export function CommunityAutomodReviewPanel({
  actions,
  communitySlug,
  stats,
}: CommunityAutomodReviewPanelProps) {
  const t = useTranslations()
  const router = useRouter()
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [reasonByKey, setReasonByKey] = useState<Record<string, string>>({})
  const [noteByKey, setNoteByKey] = useState<Record<string, string>>({})
  const [completedLabels, setCompletedLabels] = useState<
    Record<string, CommunityAutomodTrainingLabel>
  >({})
  const [isRefreshing, startRefreshing] = useTransition()
  const visibleActions = useMemo(
    () => actions.filter(action => !completedLabels[action.source_key] && !action.feedback_label),
    [actions, completedLabels],
  )

  if (visibleActions.length === 0) {
    return null
  }

  async function submit(action: CommunityAutomodAction, pendingAction: PendingAutomodReviewAction) {
    if (pendingKey || isRefreshing) return
    const outcome = pendingAction === 'reinstate' ? 'false_positive' : 'true_positive'
    setPendingKey(action.source_key)
    try {
      const result = await recordCommunityAutomodFeedback(communitySlug, action.source_key, {
        outcome,
        action: pendingAction,
        reason_code: reasonByKey[action.source_key] ?? null,
        note: noteByKey[action.source_key]?.trim() || null,
      })
      setCompletedLabels(current => ({ ...current, [action.source_key]: outcome }))
      onSuccess(
        pendingAction === 'reinstate' && result.applied_action
          ? t('extracted.communities.communityAutomodReviewPanel.postReinstated_7ba8307f')
          : t('extracted.communities.communityAutomodReviewPanel.automodLabelSaved_d7bab9fe'),
      )
      startRefreshing(() => router.refresh())
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.communities.communityAutomodReviewPanel.failedToSaveAutomodReview_c1bee2b5',
        ),
      })
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <section
      className='space-y-3'
      aria-label={t('extracted.communities.communityAutomodReviewPanel.automodReview_207675c0')}
      data-pw='community-automod-review-panel'
    >
      <div>
        <h3 className='text-lg font-semibold'>
          {t('extracted.communities.communityAutomodReviewPanel.automodReview_e9145e12')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.communities.communityAutomodReviewPanel.labelRecentLowConfidenceRemovalsSo_3693da5e',
          )}
        </p>
        <p className='text-xs text-muted-foreground'>
          {t(
            'extracted.communities.communityAutomodReviewPanel.falsepositivecountOfTotalcountRecentAutomodRemovals_79fb9858',
            {
              falsePositiveCount: stats.false_positive_count,
              totalCount: stats.total_count,
              percent: Math.round(stats.false_positive_rate * 100),
            },
          )}
        </p>
      </div>
      <div className='overflow-hidden rounded-md border'>
        {visibleActions.map(action => (
          <CommunityAutomodReviewAction
            key={action.source_key}
            action={action}
            reason={reasonByKey[action.source_key]}
            note={noteByKey[action.source_key] ?? ''}
            disabled={pendingKey !== null || isRefreshing}
            onReasonSelect={reason =>
              setReasonByKey(current => ({ ...current, [action.source_key]: reason }))
            }
            onNoteChange={note =>
              setNoteByKey(current => ({ ...current, [action.source_key]: note }))
            }
            onSubmit={pendingAction => submit(action, pendingAction)}
          />
        ))}
      </div>
    </section>
  )
}
