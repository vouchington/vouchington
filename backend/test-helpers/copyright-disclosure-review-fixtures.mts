import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { seedRestorationCounterApproval } from './copyright-restoration-counter-approval-fixture.mts'
import { v7 as uuidv7 } from 'uuid'
import { copyrightSubmissionHasGuidance } from '../services/copyright-notices/ai-assistance-disclosure.mts'
import { createCopyrightCounterReviewOutcome } from '../services/copyright-notices/counter-review-outcome.mts'
import type { reviewCopyrightCounterNotice } from '../services/copyright-notices/counter-notice-reviews.mts'

/** A complete decided counter-notice is an independent prerequisite of immutable disclosure rendering. */
export async function seedDisclosureCounterReview(
  input: Parameters<typeof reviewCopyrightCounterNotice>[0],
) {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    copyright_notice_id: string
  }>(sql`/* seedDisclosureCounterReview:notice */
    SELECT copyright_notice_id FROM copyright_notice_submissions
    WHERE id = ${input.submissionId} AND kind = 'counter_notice'`)
  const noticeId = rows[0]?.copyright_notice_id
  if (!noticeId) throw new Error('Owned disclosure counter-notice disappeared')
  if (input.is_accepted) {
    await transaction.commit()
    await seedRestorationCounterApproval({
      noticeId,
      submissionId: input.submissionId,
      moderator: input.currentUser,
    })
    return
  }
  const reviewedAt = new Date()
  const assisted = await copyrightSubmissionHasGuidance(input.submissionId, transaction)
  await transaction(sql`/* seedDisclosureCounterReview:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id, is_counter_notice_accepted)
    VALUES (${noticeId}, 'counter_notice_reviewed', ${input.currentUser.id}, ${input.submissionId}, false)`)
  const assessment = { id: uuidv7() }
  await transaction(sql`/* seedDisclosureCounterReview:identity */
    INSERT INTO copyright_notice_submission_assessment_identities (id, copyright_notice_id, copyright_notice_submission_id)
    VALUES (${assessment.id}, ${noticeId}, ${input.submissionId})`)
  await transaction(sql`/* seedDisclosureCounterReview:assessment */
    INSERT INTO copyright_notice_submission_assessments (id, copyright_notice_submission_id, assessed_at,
      assessed_by_id, is_substantially_compliant)
    VALUES (${assessment.id}, ${input.submissionId}, ${reviewedAt}, ${input.currentUser.id}, false)`)
  await transaction(sql`/* seedDisclosureCounterReview:current */
    UPDATE copyright_notice_submissions SET current_assessment_identity_id = ${assessment.id},
      current_assessment_is_substantially_compliant = false, current_assessed_at = ${reviewedAt},
      current_assessed_by_id = ${input.currentUser.id} WHERE id = ${input.submissionId}`)
  await transaction(sql`/* seedDisclosureCounterReview:review */
    INSERT INTO copyright_notice_counter_notice_reviews (copyright_notice_submission_id,
      copyright_notice_submission_assessment_identity_id, copyright_notice_deadline_id, reviewed_at,
      reviewed_by_id, is_accepted, rationale_ciphertext)
    VALUES (${input.submissionId}, ${assessment.id}, NULL, ${reviewedAt}, ${input.currentUser.id}, false,
      ${encryptSecret(input.rationale, `copyright-counter-review:${input.submissionId}`)})`)
  await createCopyrightCounterReviewOutcome(
    transaction,
    noticeId,
    input.submissionId,
    false,
    assisted,
  )
  await transaction.commit()
}
