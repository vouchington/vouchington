import { expect } from 'vitest'
import type { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import type { readCopyrightAdmissionAssociationState } from './copyright-admission-association-state.mts'

type State = Awaited<ReturnType<typeof readCopyrightAdmissionAssociationState>>
type Input = Parameters<typeof admitCopyrightEmailCorrespondence>[0]

export const copyrightAdmissionConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'CONFLICT',
  message: 'Conflicting copyright case change',
  causeCode: '40001',
}
export const copyrightAssociationConflict = {
  status: 'rejected',
  statusCode: 409,
  code: 'copyright_email_thread_changed',
  message: 'Copyright email thread changed; retry staff approval',
  causeCode: '40001',
}

/** Expected complete public admission transaction, including its evidence and durable review identity. */
export function expectedCopyrightAdmissionState(before: State, after: State, input: Input) {
  const submissionId = after.aggregate.submissions.find(
    row => !before.aggregate.submissions.some(prior => prior.id === row.id),
  )?.id
  const correspondenceId = after.aggregate.correspondence.find(
    row => row.copyright_notice_email_intake_id === input.intakeId,
  )?.id
  const noticeId = before.aggregate.notice.id
  const preempt = input.kind === 'court_or_ccb_hold'
  const work = before.aggregate.actionIntents.map(row =>
    preempt && row.action === 'restore' && (row.state === 'pending' || row.state === 'claimed')
      ? {
          ...row,
          state: 'blocked',
          updated_at: expect.any(Date),
          completed_at: expect.any(Date),
          completed_at_reason: 'blocked',
          failure_message: 'A court or CCB filing or legal hold preempted this restoration.',
          available_at: expect.any(Date),
          lease_token: null,
          leased_at: null,
          lease_expires_at: null,
        }
      : row,
  )
  const event = 'email_correspondence_admitted'
  return {
    ...before,
    aggregate: {
      ...before.aggregate,
      submissions: [
        ...before.aggregate.submissions,
        expect.objectContaining({
          id: submissionId,
          copyright_notice_id: noticeId,
          submitted_by_id: null,
          kind: input.kind,
          source_kind: 'email',
          received_at: before.source.received_at,
          body_ciphertext: JSON.stringify(input.structuredSubmission),
          current_assessment_identity_id: null,
          current_assessment_is_substantially_compliant: null,
        }),
      ],
      evidenceArtifacts: [
        ...before.aggregate.evidenceArtifacts,
        expect.objectContaining({
          copyright_notice_submission_id: submissionId,
          storage_object_id: before.source.storage,
          sha256: before.source.digest,
          mime_type: before.source.mime,
          byte_size: before.source.size,
        }),
      ],
      correspondence: [
        ...before.aggregate.correspondence,
        expect.objectContaining({
          id: correspondenceId,
          copyright_notice_id: noticeId,
          copyright_notice_submission_id: submissionId,
          copyright_notice_email_intake_id: input.intakeId,
          direction: 'inbound',
          composition_kind: 'inbound',
          correspondence_kind: 'inbound_message',
          body_ciphertext: before.source.body,
        }),
      ],
      emailCorrespondenceReviews: [
        ...before.aggregate.emailCorrespondenceReviews,
        expect.objectContaining({
          copyright_notice_email_intake_id: input.intakeId,
          copyright_notice_id: noticeId,
          action: 'admitted',
          kind: input.kind,
          reviewed_by_id: input.currentUser.id,
          copyright_notice_submission_id: submissionId,
          copyright_notice_correspondence_message_id: correspondenceId,
          copyright_notice_email_intake_recommendation_id: input.recommendationId,
          rationale_ciphertext: input.rationale,
          manual_fallback_reason_ciphertext: input.manualFallbackReason,
        }),
      ],
      lifecycleEvents: [
        ...before.aggregate.lifecycleEvents,
        expect.objectContaining({
          copyright_notice_id: noticeId,
          change_type: event,
          changed_by_id: input.currentUser.id,
          copyright_notice_correspondence_id: correspondenceId,
        }),
      ],
      actionIntents: work,
    },
    legal: {
      ...before.legal,
      pointers: [...before.legal.pointers, { id: submissionId, assessment: null, compliant: null }],
      events: [...before.legal.events, event].toSorted(),
      correspondence: [...before.legal.correspondence, 'inbound_message'].toSorted(),
      actions: before.legal.actions.map(row =>
        preempt && row.action === 'restore' && (row.state === 'pending' || row.state === 'claimed')
          ? { ...row, state: 'blocked' }
          : row,
      ),
    },
    attempts: before.attempts.map(row =>
      preempt &&
      before.aggregate.actionIntents.some(
        candidate =>
          candidate.id === row.work &&
          candidate.action === 'restore' &&
          (candidate.state === 'pending' || candidate.state === 'claimed'),
      )
        ? { ...row, blocked: true }
        : row,
    ),
    clock: expect.any(Date),
    admittedDecision: [{ copyright_notice_id: noticeId, action: 'admitted' }],
  }
}

export function expectedCopyrightAssociationState(
  before: State,
  actorId: string,
  associatedId: string,
) {
  const noticeId = before.aggregate.notice.id
  const event = 'email_intake_manually_associated'
  return {
    ...before,
    aggregate: {
      ...before.aggregate,
      lifecycleEvents: [
        ...before.aggregate.lifecycleEvents,
        expect.objectContaining({
          copyright_notice_id: noticeId,
          change_type: event,
          changed_by_id: actorId,
          copyright_notice_email_intake_id: associatedId,
        }),
      ],
    },
    legal: { ...before.legal, events: [...before.legal.events, event].toSorted() },
    associatedLinks: [{ copyright_notice_id: noticeId, link_kind: 'thread' }],
    associatedDecision: [{ copyright_notice_id: noticeId, action: 'pending' }],
    associatedAudit: [
      {
        copyright_notice_id: noticeId,
        changed_by_id: actorId,
        copyright_notice_email_intake_id: associatedId,
      },
    ],
    clock: expect.any(Date),
  }
}
