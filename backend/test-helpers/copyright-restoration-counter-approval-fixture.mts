import { v7 as uuidv7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { copyrightSubmissionHasGuidance } from '../services/copyright-notices/ai-assistance-disclosure.mts'
import { currentUserCanReviewCopyrightNotices } from '../services/copyright-notices/authorization.mts'
import { calculateUsCounterNoticeRestorationWindow } from '../services/copyright-notices/deadlines.mts'
import { createCounterNoticeForwardingInTransaction } from '../services/copyright-notices/counter-notice-forwarding.mts'
import { createCopyrightCounterReviewOutcome } from '../services/copyright-notices/counter-review-outcome.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** Exact accepted review/deadline dependency, including guidance, forwarding, outcome and replay. */
export async function seedRestorationCounterApproval(input: {
  noticeId: string
  submissionId: string
  moderator: PrivateUser
}) {
  if (!currentUserCanReviewCopyrightNotices(input.moderator))
    throw new Error('Restoration reviewer is not authorized')
  const assessmentId = uuidv7()
  const reviewedAt = new Date()
  await using transaction = await beginTransaction()
  const { rows: records } = await transaction<{
    received_at: Date
    jurisdiction: string
    target_ids: string[]
  }>(sql`/* seedRestorationCounterApproval:submission */
    SELECT submission.received_at, notice.jurisdiction, ARRAY(SELECT copyright_notice_target_id
      FROM copyright_notice_submission_targets WHERE copyright_notice_submission_id = submission.id
      ORDER BY copyright_notice_target_id) AS target_ids
    FROM copyright_notice_submissions submission JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
    WHERE submission.id = ${input.submissionId} AND submission.kind = 'counter_notice'
      AND notice.id = ${input.noticeId}`)
  const submission = records[0]
  if (!submission || submission.jurisdiction !== 'us_dmca')
    throw new Error('Restoration counter-notice authority disappeared')
  const { rows: prior } = await transaction<{
    is_accepted: boolean
    assessment_id: string
  }>(sql`/* seedRestorationCounterApproval:existing */
    SELECT is_accepted, copyright_notice_submission_assessment_identity_id AS assessment_id
    FROM copyright_notice_counter_notice_reviews WHERE copyright_notice_submission_id = ${input.submissionId}`)
  if (prior[0]) {
    if (!prior[0].is_accepted) throw new Error('Restoration counter-notice was already rejected')
    await transaction.commit()
    return await readApprovedDeadline(input.noticeId, prior[0].assessment_id)
  }
  await readCopyrightThreadRetirement(transaction, [input.noticeId])
  const assisted = await copyrightSubmissionHasGuidance(input.submissionId, transaction)
  await transaction(sql`/* seedRestorationCounterApproval:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id, is_counter_notice_accepted)
    VALUES (${input.noticeId}, 'counter_notice_reviewed', ${input.moderator.id}, ${input.submissionId}, true)`)
  await transaction(sql`/* seedRestorationCounterApproval:identity */
    INSERT INTO copyright_notice_submission_assessment_identities (id, copyright_notice_id, copyright_notice_submission_id)
    VALUES (${assessmentId}, ${input.noticeId}, ${input.submissionId})`)
  await transaction(sql`/* seedRestorationCounterApproval:assessment */
    INSERT INTO copyright_notice_submission_assessments (id, copyright_notice_submission_id, assessed_at,
      assessed_by_id, is_substantially_compliant)
    VALUES (${assessmentId}, ${input.submissionId}, ${reviewedAt}, ${input.moderator.id}, true)`)
  await transaction(sql`/* seedRestorationCounterApproval:current */
    UPDATE copyright_notice_submissions SET current_assessment_identity_id = ${assessmentId},
      current_assessment_is_substantially_compliant = true, current_assessed_at = ${reviewedAt},
      current_assessed_by_id = ${input.moderator.id} WHERE id = ${input.submissionId}`)
  await transaction(sql`/* seedRestorationCounterApproval:targets */
    INSERT INTO copyright_notice_counter_notice_assessment_targets (copyright_notice_submission_assessment_identity_id,
      copyright_notice_target_id) SELECT ${assessmentId}, unnest(${submission.target_ids}::uuid[])`)
  const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
  const { rows: deadlines } = await transaction<{
    id: string
  }>(sql`/* seedRestorationCounterApproval:deadline */
    INSERT INTO copyright_notice_deadlines (copyright_notice_id, qualifying_counter_notice_assessment_identity_id,
      earliest_restoration_at, escalation_at, restoration_deadline_at)
    VALUES (${input.noticeId}, ${assessmentId}, ${window.earliest_restoration_at}, ${window.escalation_at},
      ${window.restoration_deadline_at}) RETURNING id`)
  const deadline = deadlines[0]
  if (!deadline) throw new Error('Restoration counter-notice deadline disappeared')
  await createCounterNoticeForwardingInTransaction(
    { assessmentId, earliestRestorationAt: window.earliest_restoration_at, aiAssisted: assisted },
    transaction,
  )
  await transaction(sql`/* seedRestorationCounterApproval:review */
    INSERT INTO copyright_notice_counter_notice_reviews (copyright_notice_submission_id,
      copyright_notice_submission_assessment_identity_id, copyright_notice_deadline_id, reviewed_at,
      reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${input.submissionId}, ${assessmentId}, ${deadline.id}, ${reviewedAt}, ${input.moderator.id}, true,
      ${encryptSecret('The structured counter-notice is formally complete.', `copyright-counter-review:${input.submissionId}`)})`)
  await createCopyrightCounterReviewOutcome(
    transaction,
    input.noticeId,
    input.submissionId,
    true,
    assisted,
  )
  await transaction.commit()
  return await readApprovedDeadline(input.noticeId, assessmentId)
}

async function readApprovedDeadline(noticeId: string, assessmentId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const deadline = aggregate?.deadlines.find(
    row => row.qualifying_counter_notice_assessment_identity_id === assessmentId,
  )
  if (!deadline) throw new Error('Committed restoration counter-notice deadline disappeared')
  return { assessmentId, deadline }
}
