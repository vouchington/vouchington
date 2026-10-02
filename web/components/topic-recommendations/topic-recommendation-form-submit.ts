'use client'

import {
  createTopicRecommendation,
  updateTopicRecommendation,
  type TopicRecommendationMutationInput,
} from '@/lib/api/client/topic-recommendations'
import { ApiError } from '@/lib/api/error'
import onError, { onSuccess } from '@/lib/on-error'

interface SubmitCallbacks {
  isEdit: boolean
  recommendationId?: string
  turnstileToken: string | null
  onTurnstileReset: () => void
  onIdentityRequired: () => void
  onNavigate: () => void
  onSetSubmitting: (v: boolean) => void
}

export async function submitTopicRecommendation(
  payload: TopicRecommendationMutationInput,
  {
    isEdit,
    recommendationId,
    turnstileToken,
    onTurnstileReset,
    onIdentityRequired,
    onNavigate,
    onSetSubmitting,
  }: SubmitCallbacks,
): Promise<void> {
  let apiSuccess = false
  try {
    if (isEdit) {
      if (!recommendationId) throw new Error('Cannot update a recommendation without an id')
      await updateTopicRecommendation(recommendationId, payload)
      onSuccess('Recommendation updated')
    } else {
      await createTopicRecommendation({
        ...payload,
        cf_turnstile_response: turnstileToken ?? undefined,
      })
      onSuccess('Recommendation submitted')
    }
    apiSuccess = true
    onNavigate()
  } catch (err) {
    if (!apiSuccess) {
      if (!isEdit && err instanceof ApiError && err.code === 'IDENTITY_REQUIRED') {
        onIdentityRequired()
        return
      }
      if (!isEdit && err instanceof ApiError && err.code === 'DUPLICATE_TOPIC') {
        const data = err.data as { topic_name?: string } | null
        onTurnstileReset()
        onError(err, {
          fallback: data?.topic_name
            ? `A topic already exists for "${data.topic_name}". Check the topic list.`
            : 'This topic already exists.',
        })
        onSetSubmitting(false)
        return
      }
      if (!isEdit && err instanceof ApiError && err.code === 'DUPLICATE_RECOMMENDATION') {
        onTurnstileReset()
        onError(err, {
          fallback:
            'A pending recommendation already exists for this topic. Find it and Support it instead.',
        })
        onSetSubmitting(false)
        return
      }
      if (!isEdit) onTurnstileReset()
      onError(err, { fallback: 'Failed to save recommendation' })
      onSetSubmitting(false)
      return
    }
    onError(new Error('Navigation failed'), {
      fallback: 'Recommendation saved, but navigation failed. Please refresh.',
      skipSentry: true,
    })
    onSetSubmitting(false)
  }
}
