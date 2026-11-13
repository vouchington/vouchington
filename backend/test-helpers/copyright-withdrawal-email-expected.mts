import { expect } from 'vitest'
import { orderWithdrawalAudits, type readWithdrawalState } from './copyright-withdrawal-state.mts'
import type { readRetainedGuestComplaintState } from './copyright-retained-guest-complaint-state.mts'
import type { WithdrawalCapabilityScene } from './copyright-withdrawal-capability-fixture.mts'
import type { createWithdrawalEmailSource } from './copyright-withdrawal-email-source.mts'

type Email = Awaited<ReturnType<typeof createWithdrawalEmailSource>>
type Parsed = Awaited<ReturnType<typeof readRetainedGuestComplaintState>>
export type WithdrawalEmailState = {
  cases: Awaited<ReturnType<typeof readWithdrawalState>>
  email: Pick<Parsed, 'links' | 'reviews' | 'receipts' | 'parses'>
}
/** All source, finite review, durable link, token and misuse facts are one admission transaction. */
export function expectedEmailWithdrawal(
  scene: WithdrawalCapabilityScene,
  intake: Email,
  input: { rationale: string; manualFallbackReason: string | null },
  before: WithdrawalEmailState,
  after: WithdrawalEmailState,
) {
  const first = after.cases[0]!
  const prior = before.cases[0]!
  const submission = first.aggregate.submissions.find(row => row.kind === 'withdrawal')
  const correspondence = first.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === intake.id,
  )
  const submissionId = submission?.id
  const correspondenceId = correspondence?.id
  const reviewId = after.email.reviews[0]?.id
  const live = prior.capabilities.filter(row => row.revoked_at === null)
  const complete = {
    ...before,
    cases: before.cases.map((row, index) =>
      index
        ? row
        : {
            ...row,
            clock: { ...row.clock, at: expect.any(Date) },
            activity: { guest: expect.any(Date), lifecycle: expect.any(Date) },
            capabilities: row.capabilities.map(capability =>
              capability.revoked_at === null
                ? { ...capability, revoked_at: expect.any(Date), updated_at: expect.any(Date) }
                : capability,
            ),
            aggregate: {
              ...row.aggregate,
              submissions: [
                ...row.aggregate.submissions,
                expect.objectContaining({
                  id: submissionId,
                  copyright_notice_id: scene.noticeId,
                  kind: 'withdrawal',
                  received_at: intake.received_at,
                  source_kind: 'email',
                  submitted_by_id: null,
                  body_ciphertext: expect.any(String),
                  copyright_notice_guest_capability_id: null,
                }),
              ],
              correspondence: [
                ...row.aggregate.correspondence,
                expect.objectContaining({
                  id: correspondenceId,
                  copyright_notice_id: scene.noticeId,
                  copyright_notice_submission_id: submissionId,
                  copyright_notice_email_intake_id: intake.id,
                  direction: 'inbound',
                  composition_kind: 'inbound',
                  correspondence_kind: 'inbound_message',
                  body_ciphertext: expect.any(String),
                }),
              ],
              evidenceArtifacts: [
                ...row.aggregate.evidenceArtifacts,
                expect.objectContaining({
                  copyright_notice_submission_id: submissionId,
                  storage_object_id: intake.raw_storage_object_id,
                  sha256: intake.raw_sha256,
                  mime_type: 'message/rfc822',
                  byte_size: intake.raw_byte_size,
                }),
              ],
              emailCorrespondenceReviews: [
                ...row.aggregate.emailCorrespondenceReviews,
                {
                  id: reviewId,
                  copyright_notice_email_intake_id: intake.id,
                  copyright_notice_id: scene.noticeId,
                  action: 'admitted',
                  kind: 'withdrawal',
                  reviewed_at: expect.any(Date),
                  reviewed_by_id: scene.staff.id,
                },
              ],
            },
            audits: orderWithdrawalAudits([
              ...row.audits,
              {
                kind: 'email_correspondence_admitted',
                actor: scene.staff.id,
                capability: null,
                submission: null,
                correspondence: correspondenceId,
                action: null,
              },
              ...live.map(capability => ({
                kind: 'guest_capability_revoked_by_withdrawal',
                actor: null,
                capability: capability.id,
                submission: null,
                correspondence: null,
                action: null,
              })),
            ]),
            misuse: [
              ...row.misuse,
              expect.objectContaining({
                copyright_notice_id: scene.noticeId,
                outcome: 'notice_withdrawn',
                copyright_notice_submission_id: submissionId,
                copyright_notice_submission_assessment_identity_id: null,
                copyright_restriction_id: null,
                occurred_at: expect.any(Date),
              }),
            ],
          },
    ),
    email: {
      ...before.email,
      links: before.email.links.map(row => ({
        ...row,
        correspondence_action: 'admitted',
        correspondence_kind: 'withdrawal',
        correspondence_submission_id: submissionId,
        correspondence_message_id: correspondenceId,
        correspondence_reviewed_at: expect.any(Date),
        correspondence_reviewed_by_id: scene.staff.id,
        correspondence_rationale_ciphertext: input.rationale,
        correspondence_manual_fallback_reason_ciphertext: input.manualFallbackReason,
      })),
      reviews: [
        {
          id: reviewId,
          copyright_notice_email_intake_id: intake.id,
          copyright_notice_id: scene.noticeId,
          action: 'admitted',
          kind: 'withdrawal',
          copyright_notice_email_intake_recommendation_id: null,
          copyright_notice_submission_id: submissionId,
          copyright_notice_correspondence_message_id: correspondenceId,
          reviewed_at: expect.any(Date),
          reviewed_by_id: scene.staff.id,
          rationale_ciphertext: input.rationale,
          manual_fallback_reason_ciphertext: input.manualFallbackReason,
          created_at: expect.any(Date),
          matchesCurrent: true,
        },
      ],
    },
  }
  return { complete, submission, correspondence, submissionId, correspondenceId }
}
