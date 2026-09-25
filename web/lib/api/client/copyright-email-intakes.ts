'use client'
import { clientApi } from './instance'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
export type CopyrightEmailIntake = {
  id: string
  received_at: string
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice: {
    id: string
    targets: Array<{ id: string; placement_key: string }>
  } | null
  raw_email: { mime_type: string; byte_size: number; sha256: string; download_url: string }
  parsed_email: { sender_email: string; subject: string; body_text: string } | null
  parser_error: string | null
  recommendation: { id: string; structured_output: Record<string, unknown> } | null
}

export type CopyrightEmailIntakeApprovalInput = Record<string, unknown> & {
  rationale: string
  recommendation_id: string | null
  manual_fallback_reason: string | null
}
export type CopyrightEmailCorrespondenceKind =
  | 'supplement'
  | 'appeal'
  | 'counter_notice'
  | 'withdrawal'
  | 'court_or_ccb_hold'

export type CopyrightEmailCorrespondenceInput = Record<string, unknown> & {
  kind: CopyrightEmailCorrespondenceKind
  rationale: string
  recommendation_id: string | null
  manual_fallback_reason: string | null
}
export function listCopyrightEmailIntakes(options?: { after?: string; limit?: number }) {
  return clientApi.get<CopyrightEmailIntakeQueuePage>(
    '/api/v1/copyright-email-intakes/review-queue',
    { searchParams: { after: options?.after, limit: options?.limit } },
  )
}
export function getCopyrightEmailIntake(id: string) {
  return clientApi.get<{ copyright_email_intake: CopyrightEmailIntake }>(
    `/api/v1/copyright-email-intakes/${id}`,
  )
}
export function rejectCopyrightEmailIntake(
  id: string,
  rationale: string,
  recommendationId: string | null,
  manualFallbackReason: string | null,
) {
  return clientApi.post(`/api/v1/copyright-email-intakes/${id}/rejections`, {
    rationale,
    recommendation_id: recommendationId,
    manual_fallback_reason: manualFallbackReason,
  })
}
export function approveCopyrightEmailIntake(id: string, input: CopyrightEmailIntakeApprovalInput) {
  return clientApi.post(`/api/v1/copyright-email-intakes/${id}/approvals`, input)
}

export function admitCopyrightEmailCorrespondence(
  id: string,
  input: CopyrightEmailCorrespondenceInput,
) {
  return clientApi.post(`/api/v1/copyright-email-intakes/${id}/correspondence`, input)
}

export function rejectCopyrightEmailCorrespondence(
  id: string,
  input: Pick<
    CopyrightEmailCorrespondenceInput,
    'kind' | 'rationale' | 'recommendation_id' | 'manual_fallback_reason'
  >,
) {
  return clientApi.post(`/api/v1/copyright-email-intakes/${id}/correspondence-rejections`, input)
}
