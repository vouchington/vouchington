'use client'

import { useEffect, useRef, useState, type SetStateAction } from 'react'
import {
  getCopyrightEmailIntake,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import { usePendingAiRefresh } from '@/hooks/use-pending-ai-refresh'
import type {
  CopyrightEmailIntakeQueueItem,
  CopyrightEmailIntakeQueuePage,
} from '@/types/copyright-notices'
import {
  createCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import {
  createCopyrightEmailCorrespondenceDraft,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'
import { useCopyrightEmailReviewActions } from './copyright-email-review-actions'
import type { CopyrightEmailReviewQueue } from './copyright-email-review-queue-state'

type ReviewQueue = CopyrightEmailReviewQueue

export function useCopyrightEmailReviewDetailState(
  items: CopyrightEmailIntakeQueueItem[],
  resetToFirstPage: ReviewQueue['resetToFirstPage'],
) {
  const [detail, setDetail] = useState<CopyrightEmailIntake | null>(null)
  const [draft, setDraft] = useState<CopyrightEmailApprovalDraft | null>(null)
  const draftEdited = useRef(false)
  const seededRecommendation = useRef<string | null>(null)
  function seedRecommendation(next: CopyrightEmailIntake) {
    const recommendation = next.recommendation
    if (!recommendation || seededRecommendation.current === recommendation.id) return
    seededRecommendation.current = recommendation.id
    if (!draftEdited.current)
      setDraft(createCopyrightEmailApprovalDraft(recommendation.structured_output))
  }
  const detailId = detail?.id
  const selectedRecommendationId = items.find(item => item.id === detailId)?.recommendation_id
  const detailKey = `${detailId ?? ''}:${selectedRecommendationId ?? ''}`
  const latestDetailKey = useRef(detailKey)
  useEffect(() => {
    latestDetailKey.current = detailKey
  }, [detailKey])
  const detailNeedsRecommendation = Boolean(
    detail && selectedRecommendationId && detail.recommendation?.id !== selectedRecommendationId,
  )
  const detailRefreshTimedOut = usePendingAiRefresh(
    detailNeedsRecommendation,
    async () => {
      if (!detail) return
      const response = await getCopyrightEmailIntake(detail.id)
      if (latestDetailKey.current === detailKey) {
        seedRecommendation(response.copyright_email_intake)
        setDetail(current =>
          current?.id === detail.id ? response.copyright_email_intake : current,
        )
      }
    },
    `detail:${detailKey}`,
  )
  const [rationale, setRationale] = useState('')
  const [correspondenceDraft, setCorrespondenceDraft] = useState<CopyrightEmailCorrespondenceDraft>(
    createCopyrightEmailCorrespondenceDraft,
  )
  const [manualFallbackReason, setManualFallbackReason] = useState('')
  const [replyEmail, setReplyEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!detailId || !detailNeedsRecommendation) return undefined
    let current = true
    void getCopyrightEmailIntake(detailId)
      .then(response => {
        if (current) {
          seedRecommendation(response.copyright_email_intake)
          setDetail(previous =>
            previous?.id === detailId ? response.copyright_email_intake : previous,
          )
        }
      })
      .catch(() => {
        if (current) setError('Could not refresh the email recommendation.')
      })
    return () => {
      current = false
    }
  }, [detailId, detailNeedsRecommendation, selectedRecommendationId])
  const {
    admitCorrespondence,
    associateWithNotice,
    approve,
    reject,
    rejectCorrespondence,
    requestInformation,
    selectIntake,
  } = useCopyrightEmailReviewActions({
    correspondenceDraft,
    detail,
    draft,
    manualFallbackReason,
    rationale,
    replyEmail,
    setCorrespondenceDraft,
    setDetail,
    setDraft,
    setError,
    resetQueue: page => resetToFirstPage?.(page),
    setLoading,
    setManualFallbackReason,
    setRationale,
    setReplyEmail,
    setSuccess,
  })
  function onChangeDraft(value: SetStateAction<CopyrightEmailApprovalDraft>) {
    draftEdited.current = true
    setDraft(current =>
      current === null ? null : typeof value === 'function' ? value(current) : value,
    )
  }
  function selectQueueItem(id: string) {
    draftEdited.current = false
    seededRecommendation.current = null
    return selectIntake(id)
  }
  function recordLegalProcess(queue: CopyrightEmailIntakeQueuePage | null) {
    if (!detail) return
    const recordedId = detail.id
    setDetail(current => (current?.id === recordedId ? null : current))
    setSuccess('The email intake was recorded as legal process. No reply was sent.')
    if (queue) resetToFirstPage?.(queue)
    else setError('The decision was recorded, but the queue could not be reloaded.')
  }
  return {
    admitCorrespondence,
    approve,
    associateWithNotice,
    correspondenceDraft,
    detail,
    detailRefreshTimedOut,
    draft,
    error,
    loading,
    manualFallbackReason,
    onChangeDraft,
    rationale,
    recordLegalProcess,
    reject,
    rejectCorrespondence,
    replyEmail,
    requestInformation,
    selectQueueItem,
    setCorrespondenceDraft,
    setError,
    setManualFallbackReason,
    setRationale,
    setReplyEmail,
    setSuccess,
    success,
  }
}
