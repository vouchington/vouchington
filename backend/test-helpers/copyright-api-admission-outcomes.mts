import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightApiApprovalStages } from './copyright-api-admission-fixtures.mts'
/** Exact public outcome and committed legal stages for a one-target email promotion. */
export async function assertCopyrightEmailApprovalAdmission(
  outcome: { status: number; code?: string; message?: string; noticeId?: string },
  intake: { id: string; raw_storage_object_id: string | null; raw_sha256: Buffer },
  claimantName: string,
  imageId: string,
) {
  const { rows: links } = await write<{ id: string; kind: string }>(sql`/* approvalAdmission:case */
    SELECT copyright_notice_id AS id, link_kind AS kind FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${intake.id}`)
  const noticeId = links[0]?.id
  const effects = await readCopyrightApiApprovalStages(intake, noticeId, imageId)
  const admission = {
    decision: 'approved',
    reviews: 1,
    evidence: 1,
    notices: 1,
    submissions: 1,
    targets: 1,
    accepted: false,
    deliveries: ['claimant_receipt:email'],
    correspondence: ['receipt'],
  }
  const unassessed = {
    assessments: 0,
    identities: 0,
    current_assessments: 0,
    events: ['notice_received'],
    restrictions: 0,
    actions: 0,
  }
  const assessed = {
    assessments: 1,
    identities: 1,
    current_assessments: 1,
    events: ['notice_received', 'submission_assessed'],
    restrictions: 0,
    actions: 0,
  }
  // Each entry is a complete committed stage. A failed next transaction leaves no half-stage.
  expect([
    {
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright email changed during admission',
      effects: {
        decision: null,
        reviews: 0,
        evidence: 0,
        notices: 0,
        submissions: 0,
        targets: 0,
        accepted: false,
        deliveries: [],
        correspondence: [],
        ...unassessed,
        events: [],
      },
    },
    {
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright email thread changed; retry staff approval',
      effects: {
        decision: null,
        reviews: 0,
        evidence: 0,
        notices: 0,
        submissions: 0,
        targets: 0,
        accepted: false,
        deliveries: [],
        correspondence: [],
        ...unassessed,
        events: [],
      },
    },
    {
      status: 409,
      code: 'CONFLICT',
      message: 'Conflicting copyright assessment',
      effects: { ...admission, ...unassessed },
    },
    {
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright email changed during promotion',
      effects: { ...admission, ...assessed },
    },
    {
      status: 201,
      code: undefined,
      message: undefined,
      effects: {
        ...admission,
        ...assessed,
        restrictions: 1,
        actions: 1,
        accepted: true,
        deliveries: [
          'claimant_decision_notice:email',
          'claimant_receipt:email',
          'poster_restriction_notice:email',
          'poster_restriction_notice:in_app',
        ],
        correspondence: ['decision_notice', 'receipt', 'restriction_notice'],
        events: ['notice_received', 'provisional_restriction_imposed', 'submission_assessed'],
      },
    },
  ]).toContainEqual({
    status: outcome.status,
    code: outcome.code,
    message: outcome.message,
    effects,
  })
  if (!noticeId) {
    expect(outcome.noticeId).toBeUndefined()
    expect(links).toEqual([])
    return null
  }
  expect(links).toEqual([{ id: noticeId, kind: 'initial' }])
  if (outcome.status === 409) expect(outcome.noticeId).toBeUndefined()
  if (outcome.status === 201) expect(outcome.noticeId).toBe(noticeId)
  const { rows: reviews } = await write(sql`/* approvalAdmission:review */
    SELECT decision, promoted_copyright_notice_id FROM copyright_notice_email_intake_reviews
    WHERE copyright_notice_email_intake_receipt_id = ${intake.id}`)
  expect(reviews).toEqual([{ decision: 'approved', promoted_copyright_notice_id: noticeId }])
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  expect(aggregate?.notice.claimant_display_name).toBe(claimantName)
  expect(aggregate?.evidenceArtifacts).toEqual([
    expect.objectContaining({
      storage_object_id: intake.raw_storage_object_id,
      sha256: intake.raw_sha256,
      mime_type: 'message/rfc822',
    }),
  ])
  if (aggregate?.restrictions.length) {
    const target = aggregate.targets[0]!
    const assessment = aggregate.assessments[0]!
    expect(aggregate.restrictions).toEqual([
      expect.objectContaining({
        copyright_notice_target_id: target.id,
        authorizing_assessment_id: assessment.id,
        lifted_at: null,
        human_review_action: 'confirm',
      }),
    ])
    expect(aggregate.actionIntents).toEqual([
      expect.objectContaining({
        copyright_restriction_id: aggregate.restrictions[0]!.id,
        expected_placement_revision: target.placement_revision,
        action: 'withhold',
      }),
    ])
  }
  return aggregate
}
