import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { copyrightRaceResult } from './copyright-assessment-race-outcomes.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** One real post-withdrawal email complaint; all its case, evidence, review and redress facts are atomic. */
export async function assertEuWithdrawalEmailComplaint(input: {
  staff: PrivateUser
  noticeId: string
  intakeId: string
}) {
  const before = await complaintState(input.noticeId, input.intakeId)
  const [result] = await Promise.allSettled([
    admitCopyrightEmailCorrespondence({
      currentUser: input.staff,
      intakeId: input.intakeId,
      kind: 'complaint',
      targetIds: [],
      structuredSubmission: { summary: 'Please reconsider the existing decision.' },
      rationale: 'The guest asks for reconsideration after intake approval was withdrawn.',
      recommendationId: null,
      manualFallbackReason: 'No agent recommendation is available.',
    }),
  ])
  const after = await complaintState(input.noticeId, input.intakeId)
  const submissionId = after.submissions.find(row => row.kind === 'complaint')?.id
  const correspondenceId = after.correspondence.find(row => row.intake === input.intakeId)?.id
  expect([
    {
      outcome: {
        status: 'fulfilled',
        value: { noticeId: input.noticeId, submissionId, correspondenceId, isDuplicate: false },
      },
      state: {
        ...before,
        submissions: [
          ...before.submissions,
          { id: submissionId, kind: 'complaint', source: 'email', actor: null },
        ],
        correspondence: [
          ...before.correspondence,
          {
            id: correspondenceId,
            intake: input.intakeId,
            submission: submissionId,
            direction: 'inbound',
            kind: 'inbound_message',
          },
        ],
        evidence: before.evidence + 1,
        events: [...before.events, 'email_correspondence_admitted'].toSorted(),
        reviews: [
          {
            actor: input.staff.id,
            action: 'admitted',
            kind: 'complaint',
            submission: submissionId,
            correspondence: correspondenceId,
          },
        ],
        links: [
          {
            action: 'admitted',
            kind: 'complaint',
            actor: input.staff.id,
            submission: submissionId,
            correspondence: correspondenceId,
          },
        ],
        redress: [...before.redress, { actor: null, filed_by: 'notifier', key: submissionId }],
      },
    },
    {
      outcome: {
        status: 'rejected',
        statusCode: 409,
        code: 'CONFLICT',
        message: 'Conflicting copyright case change',
        causeCode: '40001',
      },
      state: before,
    },
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: after,
  })
}

async function complaintState(noticeId: string, intakeId: string) {
  const [aggregate, { rows: links }, { rows: reviews }, { rows: redress }] = await Promise.all([
    getCopyrightNoticePrivateAggregate(noticeId),
    write(sql`/* complaintState:link */ SELECT correspondence_action AS action, correspondence_kind AS kind,
      correspondence_reviewed_by_id AS actor, correspondence_submission_id AS submission,
      correspondence_message_id AS correspondence FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${intakeId}`),
    write(sql`/* complaintState:review */ SELECT reviewed_by_id AS actor, action, kind,
      copyright_notice_submission_id AS submission, copyright_notice_correspondence_message_id AS correspondence
      FROM copyright_notice_email_correspondence_reviews WHERE copyright_notice_email_intake_id = ${intakeId}`),
    write(sql`/* complaintState:redress */ SELECT submitted_by_id AS actor, filed_by, idempotency_key AS key
      FROM copyright_territorial_redress_requests WHERE copyright_notice_id = ${noticeId} ORDER BY id`),
  ])
  if (!aggregate) throw new Error('Owned EU complaint case disappeared')
  return {
    submissions: aggregate.submissions.map(row => ({
      id: row.id,
      kind: row.kind,
      source: row.source_kind,
      actor: row.submitted_by_id,
    })),
    correspondence: aggregate.correspondence.map(row => ({
      id: row.id,
      intake: row.copyright_notice_email_intake_id,
      submission: row.copyright_notice_submission_id,
      direction: row.direction,
      kind: row.correspondence_kind,
    })),
    evidence: aggregate.evidenceArtifacts.length,
    events: aggregate.lifecycleEvents.map(row => row.change_type).toSorted(),
    links,
    reviews,
    redress,
    targets: aggregate.targets,
    restrictions: aggregate.restrictions,
    actions: aggregate.actionIntents,
    deliveries: aggregate.deliveryIntents,
    assessments: aggregate.assessments,
    deadlines: aggregate.deadlines,
  }
}
