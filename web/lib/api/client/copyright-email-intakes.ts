'use client'
import { clientApi } from './instance'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'
// What Amazon SES recorded for the message. `unknown` means SES never reported the check.
export type CopyrightEmailSesVerdict = 'pass' | 'fail' | 'gray' | 'processing_failed' | 'unknown'
export type CopyrightEmailSesVerdicts = {
  spf: CopyrightEmailSesVerdict
  dkim: CopyrightEmailSesVerdict
  dmarc: CopyrightEmailSesVerdict
  spam: CopyrightEmailSesVerdict
  virus: CopyrightEmailSesVerdict
}
export type CopyrightEmailIntake = {
  id: string
  received_at: string
  review_path: 'initial' | 'unresolved_thread' | 'matched_thread'
  linked_notice: {
    id: string
    targets: Array<{ id: string; placement_key: string }>
  } | null
  // `download_url` is null when SES reported malware: the original is quarantined.
  raw_email: { mime_type: string; byte_size: number; sha256: string; download_url: string | null }
  ses_verdicts: CopyrightEmailSesVerdicts
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
export type CopyrightEmailIntakeInformationRequestInput = {
  rationale: string
  recommendation_id: string | null
  manual_fallback_reason: string | null
  reply_email: string | null
  response_message: string
}
export function listCopyrightEmailIntakes(options?: {
  after?: string
  limit?: number
}): Promise<CopyrightEmailIntakeQueuePage> {
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
// `replyEmail` is the moderator-typed address for an intake with no parsed sender; the server
// refuses it beside a parsed sender and queues no reply when it is null and nothing was parsed.
export function rejectCopyrightEmailIntake(
  id: string,
  rationale: string,
  recommendationId: string | null,
  manualFallbackReason: string | null,
  replyEmail: string | null,
) {
  return clientApi.post<{ reply_queued: boolean }>(
    `/api/v1/copyright-email-intakes/${id}/rejections`,
    {
      rationale,
      recommendation_id: recommendationId,
      manual_fallback_reason: manualFallbackReason,
      reply_email: replyEmail,
    },
  )
}
// Asks the sender of an initial email intake for missing elements. The route is the rejection's:
// the intake is decided without opening a case, and `response_message` is queued as the reply.
// `reply_email` follows the rejection's rule: only for an intake with no parsed sender.
export function requestCopyrightEmailIntakeInformation(
  id: string,
  input: CopyrightEmailIntakeInformationRequestInput,
) {
  return clientApi.post<{ reply_queued: boolean }>(
    `/api/v1/copyright-email-intakes/${id}/rejections`,
    { ...input, response_kind: 'needs_information' },
  )
}
// Records an initial email intake as legal process, such as a subpoena. The server decides it
// without a case, assessment, restriction, claimant-visible event, or reply of any kind.
export function recordCopyrightEmailIntakeLegalProcess(id: string, reason: string) {
  return clientApi.post<{ decision: 'legal_process' }>(
    `/api/v1/copyright-email-intakes/${id}/legal-process`,
    { reason },
  )
}
// Puts the failed reply to a declined intake back in the delivery queue. `replayed` is false when
// the reply was no longer failed, for example because another reviewer already retried it.
export function replayCopyrightEmailIntakeReply(id: string) {
  return clientApi.post<{ replayed: boolean }>(
    `/api/v1/copyright-email-intakes/${id}/reply/replays`,
    {},
  )
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
