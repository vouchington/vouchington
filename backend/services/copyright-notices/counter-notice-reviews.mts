import { createCopyrightCounterReviewOutcome } from './counter-review-outcome.mts'
import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { CONFLICT } from '@modules/on-error/error-codes'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { copyrightSubmissionHasGuidance } from './ai-assistance-disclosure.mts'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { createCounterNoticeForwardingInTransaction } from './counter-notice-forwarding.mts'
import { calculateUsCounterNoticeRestorationWindow } from './deadlines.mts'
import { assertBoundedRationale } from './submission-review-email-outcome.mts'

export async function reviewCopyrightCounterNotice(input: {
  submissionId: string
  currentUser: PrivateUser
  is_accepted: boolean
  rationale: string
}): Promise<{ noticeId: string; assessmentId: string; deadlineId: string | null }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertBoundedRationale(input.rationale)
  return conflictOnSerializationFailure(
    async () => {
      await using transaction = await beginTransaction({ serializable: true })
      await transaction(sql`/* reviewCopyrightCounterNotice:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-counter-review:${input.submissionId}`}, 0))
    `)
      const { rows: counterNotices } = await transaction<{ copyright_notice_id: string }>(sql`
      /* reviewCopyrightCounterNotice:notice */
      SELECT copyright_notice_id FROM copyright_notice_submissions
      WHERE id = ${input.submissionId} AND kind = 'counter_notice'
    `)
      assert(counterNotices[0], 404, 'Copyright counter-notice not found')
      const { rows: existingRows } = await transaction<{
        copyright_notice_id: string
        is_accepted: boolean
        assessment_id: string
        deadline_id: string | null
      }>(sql`/* reviewCopyrightCounterNotice:existing */
      SELECT submission.copyright_notice_id, review.is_accepted,
        review.copyright_notice_submission_assessment_identity_id AS assessment_id,
        review.copyright_notice_deadline_id AS deadline_id
      FROM copyright_notice_counter_notice_reviews review
      JOIN copyright_notice_submissions submission
        ON submission.id = review.copyright_notice_submission_id
      WHERE review.copyright_notice_submission_id = ${input.submissionId}
    `)
      const existing = existingRows[0]
      if (existing) {
        assert(
          existing.is_accepted === input.is_accepted,
          409,
          'Counter-notice was already reviewed',
        )
        await transaction.commit()
        return {
          noticeId: existing.copyright_notice_id,
          assessmentId: existing.assessment_id,
          deadlineId: existing.deadline_id,
        }
      }
      const { rows: submissionRows } = await transaction<{
        copyright_notice_id: string
        received_at: Date
        jurisdiction: string
        target_ids: string[]
      }>(sql`/* reviewCopyrightCounterNotice:submission */
      SELECT submission.copyright_notice_id, submission.received_at, notice.jurisdiction,
        ARRAY(
          SELECT submission_target.copyright_notice_target_id
          FROM copyright_notice_submission_targets submission_target
          WHERE submission_target.copyright_notice_submission_id = submission.id
          ORDER BY submission_target.copyright_notice_target_id
        ) AS target_ids
      FROM copyright_notice_submissions submission
      JOIN copyright_notices notice ON notice.id = submission.copyright_notice_id
      WHERE submission.id = ${input.submissionId} AND submission.kind = 'counter_notice'
      FOR UPDATE OF submission
    `)
      const submission = submissionRows[0]
      assert(submission, 404, 'Copyright counter-notice not found')
      assert(
        submission.jurisdiction === 'us_dmca',
        422,
        'Only US DMCA counter-notices are supported',
      )
      const reviewedAt = new Date()
      const [aiAssisted] = await Promise.all([
        copyrightSubmissionHasGuidance(input.submissionId, transaction),
        readCopyrightThreadRetirement(transaction, [submission.copyright_notice_id]),
      ])
      const { rows: identityRows } = await transaction(sql`/* reviewCopyrightCounterNotice:event */
      INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
        copyright_notice_submission_id, is_counter_notice_accepted)
      VALUES (${submission.copyright_notice_id}, 'counter_notice_reviewed', ${input.currentUser.id},
        ${input.submissionId}, ${input.is_accepted})
    `).then(() =>
        transaction<{ id: string }>(sql`
      /* reviewCopyrightCounterNotice:assessmentIdentity */
      INSERT INTO copyright_notice_submission_assessment_identities (
        copyright_notice_id, copyright_notice_submission_id
      ) VALUES (${submission.copyright_notice_id}, ${input.submissionId}) RETURNING id
    `),
      )
      const { rows: assessmentRows } = await transaction<{
        id: string
      }>(sql`/* reviewCopyrightCounterNotice:assessment */
      INSERT INTO copyright_notice_submission_assessments (
        id, copyright_notice_submission_id, assessed_at, assessed_by_id, is_substantially_compliant
      ) VALUES (${identityRows[0]!.id}, ${input.submissionId}, ${reviewedAt}, ${input.currentUser.id}, ${input.is_accepted})
      RETURNING id
    `)
      const assessment = assessmentRows[0]
      assert(assessment, 500, 'Counter-notice assessment was not recorded')
      await transaction(sql`/* reviewCopyrightCounterNotice:currentAssessment */
      UPDATE copyright_notice_submissions
      SET current_assessment_identity_id = ${assessment.id},
        current_assessment_is_substantially_compliant = ${input.is_accepted},
        current_assessed_at = ${reviewedAt}, current_assessed_by_id = ${input.currentUser.id}
      WHERE id = ${input.submissionId}
    `)
      let deadlineId: string | null = null
      if (input.is_accepted) {
        await transaction(sql`/* reviewCopyrightCounterNotice:targets */
        INSERT INTO copyright_notice_counter_notice_assessment_targets (
          copyright_notice_submission_assessment_identity_id, copyright_notice_target_id
        ) SELECT ${assessment.id}, unnest(${submission.target_ids}::uuid[])
      `)
        const window = calculateUsCounterNoticeRestorationWindow(submission.received_at)
        const { rows } = await transaction<{
          id: string
        }>(sql`/* reviewCopyrightCounterNotice:deadline */
        INSERT INTO copyright_notice_deadlines (
          copyright_notice_id, qualifying_counter_notice_assessment_identity_id, earliest_restoration_at,
          escalation_at, restoration_deadline_at
        ) VALUES (${submission.copyright_notice_id}, ${assessment.id}, ${window.earliest_restoration_at},
          ${window.escalation_at}, ${window.restoration_deadline_at})
        RETURNING id
      `)
        deadlineId = rows[0]?.id ?? null
        assert(deadlineId, 500, 'Counter-notice deadline was not created')
        await createCounterNoticeForwardingInTransaction(
          {
            assessmentId: assessment.id,
            earliestRestorationAt: window.earliest_restoration_at,
            aiAssisted,
          },
          transaction,
        )
      }
      await transaction(sql`/* reviewCopyrightCounterNotice:record */
      INSERT INTO copyright_notice_counter_notice_reviews (
        copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id,
        copyright_notice_deadline_id, reviewed_at, reviewed_by_id, is_accepted, rationale_ciphertext
      ) VALUES (${input.submissionId}, ${assessment.id}, ${deadlineId}, ${reviewedAt},
        ${input.currentUser.id}, ${input.is_accepted},
        ${encryptSecret(input.rationale, `copyright-counter-review:${input.submissionId}`)})
    `)

      await createCopyrightCounterReviewOutcome(
        transaction,
        submission.copyright_notice_id,
        input.submissionId,
        input.is_accepted,
        aiAssisted,
      )
      await transaction.commit()
      return { noticeId: submission.copyright_notice_id, assessmentId: assessment.id, deadlineId }
    },
    'Conflicting copyright case change',
    CONFLICT,
  )
}
