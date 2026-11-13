import { expect } from 'vitest'
import type {
  readRetainedGuestComplaintState,
  RetainedComplaintEmail,
} from './copyright-retained-guest-complaint-state.mts'

export const retainedComplaintRationale = 'The email is a valid guest complaint reply.'
export const retainedComplaintFallback = 'No agent recommendation was available.'
type State = Awaited<ReturnType<typeof readRetainedGuestComplaintState>>
/** The one admitted complaint, guest ownership, evidence, encrypted bodies and current/historical review agree. */
export function expectedRetainedGuestComplaint(
  noticeId: string,
  intake: RetainedComplaintEmail,
  staffId: string,
  before: State,
  after: State,
) {
  const submission = after.state.aggregate.submissions.find(row => row.kind === 'complaint')
  const correspondence = after.state.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === intake.id,
  )
  const submissionId = submission?.id
  const correspondenceId = correspondence?.id
  const reviewId = after.reviews[0]?.id
  return {
    ...before,
    links: before.links.map(row => ({
      ...row,
      correspondence_action: 'admitted',
      correspondence_kind: 'complaint',
      correspondence_submission_id: submissionId,
      correspondence_message_id: correspondenceId,
      correspondence_reviewed_at: expect.any(Date),
      correspondence_reviewed_by_id: staffId,
      correspondence_rationale_ciphertext: retainedComplaintRationale,
      correspondence_manual_fallback_reason_ciphertext: retainedComplaintFallback,
    })),
    reviews: [
      {
        id: reviewId,
        copyright_notice_email_intake_id: intake.id,
        copyright_notice_id: noticeId,
        action: 'admitted',
        kind: 'complaint',
        copyright_notice_email_intake_recommendation_id: null,
        copyright_notice_submission_id: submissionId,
        copyright_notice_correspondence_message_id: correspondenceId,
        reviewed_at: expect.any(Date),
        reviewed_by_id: staffId,
        rationale_ciphertext: retainedComplaintRationale,
        manual_fallback_reason_ciphertext: retainedComplaintFallback,
        created_at: expect.any(Date),
        matchesCurrent: true,
      },
    ],
    state: {
      ...before.state,
      clock: { ...before.state.clock, at: expect.any(Date) },
      requests: [
        ...before.state.requests,
        expect.objectContaining({
          copyright_notice_id: noticeId,
          jurisdiction: 'eu_dsa',
          copyright_territorial_decision_id:
            before.state.parent[0]!.current_territorial_decision_identity_id,
          challenged_decision_outcome: 'no_action',
          authorizing_assessment_identity_id: null,
          submitted_by_id: null,
          filed_by: 'notifier',
          idempotency_key: submissionId,
          explanation_ciphertext: expect.any(String),
          received_at: intake.received_at,
          current_staff_decision_identity_id: null,
          staff_disposition: null,
          decided_at: null,
          decided_by_id: null,
          rationale_ciphertext: null,
        }),
      ],
      aggregate: {
        ...before.state.aggregate,
        submissions: [
          ...before.state.aggregate.submissions,
          expect.objectContaining({
            id: submissionId,
            copyright_notice_id: noticeId,
            kind: 'complaint',
            received_at: intake.received_at,
            source_kind: 'email',
            submitted_by_id: null,
            body_ciphertext: expect.any(String),
          }),
        ],
        evidenceArtifacts: [
          ...before.state.aggregate.evidenceArtifacts,
          expect.objectContaining({
            copyright_notice_submission_id: submissionId,
            storage_object_id: intake.raw_storage_object_id,
            sha256: intake.raw_sha256,
            mime_type: 'message/rfc822',
            byte_size: intake.raw_byte_size,
          }),
        ],
        correspondence: [
          ...before.state.aggregate.correspondence,
          expect.objectContaining({
            id: correspondenceId,
            copyright_notice_id: noticeId,
            copyright_notice_submission_id: submissionId,
            copyright_notice_email_intake_id: intake.id,
            direction: 'inbound',
            composition_kind: 'inbound',
            correspondence_kind: 'inbound_message',
            body_ciphertext: expect.any(String),
          }),
        ],
        lifecycleEvents: [
          ...before.state.aggregate.lifecycleEvents,
          expect.objectContaining({
            copyright_notice_id: noticeId,
            change_type: 'email_correspondence_admitted',
            changed_by_id: staffId,
            copyright_notice_correspondence_id: correspondenceId,
          }),
        ],
        emailCorrespondenceReviews: [
          ...before.state.aggregate.emailCorrespondenceReviews,
          {
            id: reviewId,
            copyright_notice_email_intake_id: intake.id,
            copyright_notice_id: noticeId,
            action: 'admitted',
            kind: 'complaint',
            reviewed_at: expect.any(Date),
            reviewed_by_id: staffId,
          },
        ],
      },
    },
  }
}
