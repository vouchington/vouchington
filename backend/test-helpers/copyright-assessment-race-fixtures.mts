import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { insertCopyrightActionIntent } from '../services/copyright-notices/action-intent-insertion.mts'
import { createCopyrightRestrictionDecisionNoticesInTransaction } from '../services/copyright-notices/restriction-outcome-notices.mts'
import { appendCopyrightSubmissionAssessmentInTransaction } from '../services/copyright-notices/compliance.mts'
import { calculateUsCounterNoticeRestorationWindow } from '../services/copyright-notices/deadlines.mts'
import { createCounterNoticeForwardingInTransaction } from '../services/copyright-notices/counter-notice-forwarding.mts'
import { createCopyrightCounterReviewOutcome } from '../services/copyright-notices/counter-review-outcome.mts'
import { seedCopyrightCounterNotice } from './copyright-notice-submissions.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Commit the unreviewed restriction dependency, including its notices, action and audit. */
export async function seedCopyrightUnreviewedRestriction(input: {
  noticeId: string
  targetId: string
  assessmentId: string
  revision: number
}) {
  const imposedAt = new Date('2026-07-01T12:00:00.000Z')
  await using transaction = await beginTransaction()
  await transaction(sql`/* seedCopyrightUnreviewedRestriction:notice */
    UPDATE copyright_notices SET accepted_at = ${imposedAt},
      provisional_withholding_at = ${imposedAt} WHERE id = ${input.noticeId}`)
  const { rows } = await transaction<{ id: string }>(sql`/* seedCopyrightUnreviewedRestriction */
    INSERT INTO copyright_restrictions (copyright_notice_target_id, authorizing_assessment_id,
      is_authorizing_assessment_automated, imposed_at)
    VALUES (${input.targetId}, ${input.assessmentId}, false, ${imposedAt}) RETURNING id`)
  const restriction = rows[0]!
  await insertCopyrightActionIntent(transaction, restriction.id, input.revision, 'withhold')
  await createCopyrightRestrictionDecisionNoticesInTransaction(
    {
      noticeId: input.noticeId,
      targetId: input.targetId,
      restrictionId: restriction.id,
      event: 'restricted',
    },
    transaction,
  )
  await transaction(sql`/* seedCopyrightUnreviewedRestriction:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, copyright_restriction_id)
    VALUES (${input.noticeId}, 'provisional_restriction_imposed', ${restriction.id})`)
  await transaction.commit()
  return restriction
}

/** A committed compliant counter-notice, scope, review and deadline with canonical forwarding. */
export async function seedCopyrightRaceCounterDeadline(input: {
  noticeId: string
  targetId: string
  claimantId: string
  moderator: PrivateUser
}) {
  const { submission } = await seedCopyrightCounterNotice(input.noticeId, input.claimantId, [
    input.targetId,
  ])
  await using transaction = await beginTransaction()
  const assessment = await appendCopyrightSubmissionAssessmentInTransaction(
    {
      submissionId: submission.id,
      currentUser: input.moderator,
      assessedAt: new Date(),
      substantiallyCompliant: true,
      targetIds: [input.targetId],
    },
    transaction,
  )
  const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
  const { rows } = await transaction<{
    id: string
    earliest_restoration_at: Date
  }>(sql`/* seedCopyrightRaceCounterDeadline */
    INSERT INTO copyright_notice_deadlines (copyright_notice_id, qualifying_counter_notice_assessment_identity_id,
      earliest_restoration_at, escalation_at, restoration_deadline_at)
    VALUES (${input.noticeId}, ${assessment.id}, ${window.earliest_restoration_at},
      ${window.escalation_at}, ${window.restoration_deadline_at}) RETURNING id, earliest_restoration_at`)
  const deadline = rows[0]!
  await createCounterNoticeForwardingInTransaction(
    {
      assessmentId: assessment.id,
      earliestRestorationAt: deadline.earliest_restoration_at,
      aiAssisted: false,
    },
    transaction,
  )
  await transaction(sql`/* seedCopyrightRaceCounterDeadline:review */
    INSERT INTO copyright_notice_counter_notice_reviews (
      copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id,
      copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${submission.id}, ${assessment.id}, ${deadline.id}, CURRENT_TIMESTAMP, ${input.moderator.id}, true,
      ${encryptSecret('The structured counter-notice is formally complete.', `copyright-counter-review:${submission.id}`)})`)
  await transaction(sql`/* seedCopyrightRaceCounterDeadline:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id, is_counter_notice_accepted)
    VALUES (${input.noticeId}, 'counter_notice_reviewed', ${input.moderator.id}, ${submission.id}, true)`)
  await createCopyrightCounterReviewOutcome(transaction, input.noticeId, submission.id, true, false)
  await transaction.commit()
  return deadline
}
