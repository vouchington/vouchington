import assert from 'http-assert'
import { REVIEW_DISPUTE_REASONS, type ReviewDisputeReason } from './config.mts'

export interface CreateReviewDisputeInput {
  postId: string
  topicId?: string
  reason: ReviewDisputeReason
  claimText: string
}

export function parseCreateReviewDisputeInput(raw: unknown): CreateReviewDisputeInput {
  const body = raw as Record<string, unknown>
  assert(
    typeof body.post_id === 'string' && body.post_id.trim().length > 0,
    422,
    'post_id is required',
  )
  assert(
    typeof body.reason === 'string' &&
      REVIEW_DISPUTE_REASONS.includes(body.reason as ReviewDisputeReason),
    422,
    `reason must be one of: ${REVIEW_DISPUTE_REASONS.join(', ')}`,
  )
  assert(
    typeof body.claim_text === 'string' && body.claim_text.trim().length > 0,
    422,
    'claim_text is required',
  )
  assert((body.claim_text as string).length <= 4000, 422, 'claim_text too long')
  const topicId =
    typeof body.topic_id === 'string' && body.topic_id.trim().length > 0
      ? body.topic_id.trim()
      : undefined
  return {
    postId: (body.post_id as string).trim(),
    topicId,
    reason: body.reason as ReviewDisputeReason,
    claimText: (body.claim_text as string).trim(),
  }
}
