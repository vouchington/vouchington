'use client'

import { clientApi } from './instance'
import { admissionIdempotency } from './admission-idempotency'
import { withoutCopyrightCaptcha } from './copyright-notice-idempotency'
import type {
  CopyrightNoticeDetail,
  CopyrightNoticesPage,
  CopyrightParticipantNoticeDetail,
  CopyrightStaffQueueItem,
} from '@/types/copyright-notices'

export type CopyrightNoticeTargetInput = {
  post_id: string
  image_id: string
  target_url: string
}

export function createCopyrightNotice(input: {
  claimant_display_name: string
  claimant_contact: string
  claimant_email: string
  work_description: string
  electronic_signature: string
  good_faith_belief: boolean
  accuracy_authority_under_penalty_of_perjury: boolean
  targets: CopyrightNoticeTargetInput[]
  cf_turnstile_response?: string
}): Promise<{ copyright_notice: { id: string }; is_duplicate: boolean }> {
  const body = { jurisdiction: 'us_dmca' as const, ...input }
  return admissionIdempotency.run(
    { route: 'copyright-notices.create', body: withoutCopyrightCaptcha(body) },
    idempotencyKey =>
      clientApi.post('/api/v1/copyright-notices', body, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  )
}

export function createCopyrightAppeal(
  noticeId: string,
  input: { reason: string; target_ids: string[]; cf_turnstile_response?: string },
): Promise<{ copyright_submission: { id: string }; is_duplicate: boolean }> {
  return admissionIdempotency.run(
    { route: 'copyright-notices.appeal', noticeId, body: withoutCopyrightCaptcha(input) },
    idempotencyKey =>
      clientApi.post(`/api/v1/copyright-notices/${noticeId}/appeals`, input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  )
}

export function createCopyrightCounterNotice(
  noticeId: string,
  input: {
    name: string
    address: string
    telephone: string
    electronic_signature: string
    consent_to_federal_jurisdiction: boolean
    consent_to_service_of_process: boolean
    good_faith_misidentification_under_penalty_of_perjury: boolean
    target_ids: string[]
    cf_turnstile_response?: string
  },
): Promise<{ copyright_submission: { id: string }; is_duplicate: boolean }> {
  return admissionIdempotency.run(
    { route: 'copyright-notices.counter-notice', noticeId, body: withoutCopyrightCaptcha(input) },
    idempotencyKey =>
      clientApi.post(`/api/v1/copyright-notices/${noticeId}/counter-notices`, input, {
        headers: { 'Idempotency-Key': idempotencyKey },
      }),
  )
}

export function listCopyrightNotices(options?: {
  after?: string
  limit?: number
}): Promise<CopyrightNoticesPage> {
  return clientApi.get('/api/v1/copyright-notices', {
    searchParams: { after: options?.after, limit: options?.limit },
  })
}

export function getCopyrightNotice(
  id: string,
): Promise<{ copyright_notice: CopyrightNoticeDetail }> {
  return clientApi.get(`/api/v1/copyright-notices/${id}`)
}

export function getCopyrightParticipantNotice(
  id: string,
): Promise<{ copyright_notice: CopyrightParticipantNoticeDetail }> {
  return clientApi.get(`/api/v1/copyright-notices/${id}/participant`)
}

export function listCopyrightReviewQueue(): Promise<{
  copyright_notices: CopyrightStaffQueueItem[]
}> {
  return clientApi.get('/api/v1/copyright-notices/review-queue')
}

export function reviewCopyrightFormIntake(
  intakeId: string,
  accepted: boolean,
  rationale: string,
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-form-intakes/${intakeId}/reviews`, {
    accepted,
    rationale,
  })
}

export function reviewCopyrightRestriction(
  noticeId: string,
  restrictionId: string,
  action: 'confirm' | 'reverse',
  rationale: string,
): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/restrictions/${restrictionId}/reviews`,
    { action, rationale },
  )
}

export function reviewCopyrightAppeal(
  submissionId: string,
  input: {
    rationale: string
    recommendation_id?: string
    manual_fallback_reason?: string
    decisions: Array<{ restriction_id: string; action: 'confirm' | 'reverse' }>
  },
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-submissions/${submissionId}/appeal-reviews`, input)
}

export function reviewCopyrightCounterNotice(
  submissionId: string,
  accepted: boolean,
  rationale: string,
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-submissions/${submissionId}/counter-notice-reviews`, {
    accepted,
    rationale,
  })
}

export function replayCopyrightMediaDelivery(): Promise<{ replayed: number }> {
  return clientApi.post('/api/v1/copyright-media-delivery/replays', {})
}

export function assessCopyrightLegalHold(
  submissionId: string,
  input: {
    rationale: string
    from_original_claimant: boolean
    proceeding_kind: 'federal_court' | 'ccb' | null
    ccb_claim_kind: 'claim' | 'counterclaim' | null
    commenced_at: string | null
    received_by_designated_agent_at: string | null
    same_material: boolean
    target_ids: string[]
  },
): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-submissions/${submissionId}/legal-hold-assessments`,
    input,
  )
}

export function resolveCopyrightLegalHold(
  assessmentId: string,
  resolutionKind: 'dismissed' | 'proceeding_ended' | 'superseded',
  rationale: string,
): Promise<void> {
  return clientApi.post(`/api/v1/copyright-legal-hold-assessments/${assessmentId}/resolutions`, {
    resolution_kind: resolutionKind,
    rationale,
  })
}

export function replayCopyrightActionIntent(noticeId: string, intentId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/action-intents/${intentId}/replays`,
    {},
  )
}

export function replayCopyrightDeliveryIntent(noticeId: string, intentId: string): Promise<void> {
  return clientApi.post(
    `/api/v1/copyright-notices/${noticeId}/delivery-intents/${intentId}/replays`,
    {},
  )
}
