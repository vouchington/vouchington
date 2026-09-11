'use client'

import { clientApi } from './instance'
import type { ReviewDispute } from '@/types/review-disputes'

export interface DisputesPage {
  disputes: ReviewDispute[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

export function listReviewDisputesClient(options: {
  after: string
  status?: string
  mine?: boolean
}): Promise<DisputesPage> {
  return clientApi.get('/api/v1/disputes', {
    searchParams: { limit: 50, after: options.after, status: options.status, mine: options.mine },
  })
}

export function createReviewDispute(data: {
  post_id: string
  topic_id?: string
  reason: string
  claim_text: string
  cf_turnstile_response?: string
}): Promise<{ dispute: ReviewDispute; is_duplicate: boolean }> {
  return clientApi.post('/api/v1/disputes', data)
}

export function updateDisputeDraft(
  disputeId: string,
  data: {
    public_response?: string
    internal_notes?: string
  },
): Promise<{ dispute: ReviewDispute }> {
  return clientApi.patch(`/api/v1/disputes/${disputeId}`, data)
}

export function approveDispute(disputeId: string): Promise<{ dispute: ReviewDispute }> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/approval`, {})
}

export function sendDisputeResolution(disputeId: string): Promise<{ dispute: ReviewDispute }> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/delivery`, {})
}

export function resolveDisputeRemove(
  disputeId: string,
  mode: 'remove',
): Promise<{ dispute: ReviewDispute }> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/resolution`, { action: mode })
}

export function resolveDisputeAnnotate(
  disputeId: string,
  bodyText: string,
): Promise<{ dispute: ReviewDispute }> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/resolution`, {
    action: 'annotate',
    body_text: bodyText,
  })
}

export function dismissDispute(disputeId: string): Promise<{ dispute: ReviewDispute }> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/resolution`, { action: 'dismiss' })
}

export function rerunDisputeAI(disputeId: string): Promise<void> {
  return clientApi.post(`/api/v1/disputes/${disputeId}/resolution-drafts`, {})
}
