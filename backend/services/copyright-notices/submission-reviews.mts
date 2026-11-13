import { conflictOnSerializationFailure } from '@modules/utils/serialization-conflict'
import { CONFLICT } from '@modules/on-error/error-codes'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { beginTransaction } from '@data-stores/psql'
import { lockCopyrightNoticeForLegalWrite } from './last-legal-activity.mts'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { enqueueBulkApplyCopyrightActions } from '@queues/notifications/enqueues'
import { recordCopyrightAppealReviewEffects } from './submission-review-appeal-effects.mts'
import { assertBoundedRationale } from './submission-review-email-outcome.mts'
import { enqueueCopyrightStaydownHashes } from './staydown-registration.mts'
import type { CopyrightHumanReviewAction } from './types.mts'

type AppealDecision = { restrictionId: string; action: CopyrightHumanReviewAction }

export async function reviewCopyrightAppeal(
  input: {
    submissionId: string
    currentUser: PrivateUser
    recommendationId: string | null
    manualFallbackReason: string | null
    rationale: string
    decisions: AppealDecision[]
  },
  transactionOptions: Parameters<typeof beginTransaction>[0] = {},
): Promise<{ noticeId: string; reviewIds: string[] }> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  assertBoundedRationale(input.rationale)
  assert(
    (input.recommendationId === null) !== (input.manualFallbackReason === null),
    422,
    'Provide either recommendation_id or manual_fallback_reason',
  )
  if (input.manualFallbackReason !== null) assertBoundedRationale(input.manualFallbackReason)
  assert(input.decisions.length > 0 && input.decisions.length <= 20, 422, 'decisions are required')
  assert(
    new Set(input.decisions.map(decision => decision.restrictionId)).size ===
      input.decisions.length,
    422,
    'Restriction decisions must be unique',
  )

  return conflictOnSerializationFailure(
    async () => {
      await using transaction = await beginTransaction({
        ...transactionOptions,
        serializable: true,
      })
      await transaction(sql`/* reviewCopyrightAppeal:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-appeal-review:${input.submissionId}`}, 0))
    `)
      const { rows: appealNotices } = await transaction<{ copyright_notice_id: string }>(sql`
      /* reviewCopyrightAppeal:notice */
      SELECT copyright_notice_id FROM copyright_notice_submissions
      WHERE id = ${input.submissionId} AND kind = 'appeal'
    `)
      assert(appealNotices[0], 404, 'Copyright appeal not found')
      const lockedNotice = await lockCopyrightNoticeForLegalWrite(
        transaction,
        appealNotices[0].copyright_notice_id,
      )
      assert(lockedNotice, 404, 'Copyright appeal not found')
      const { rows: appealRows } = await transaction<{
        copyright_notice_id: string
        submitted_by_id: string | null
        target_ids: string[]
      }>(sql`/* reviewCopyrightAppeal:appeal */
      SELECT submission.copyright_notice_id, submission.submitted_by_id,
        ARRAY(
          SELECT submission_target.copyright_notice_target_id
          FROM copyright_notice_submission_targets submission_target
          WHERE submission_target.copyright_notice_submission_id = submission.id
          ORDER BY submission_target.copyright_notice_target_id
        ) AS target_ids
      FROM copyright_notice_submissions submission
      WHERE submission.id = ${input.submissionId} AND submission.kind = 'appeal'
      FOR UPDATE OF submission
    `)
      const appeal = appealRows[0]
      assert(appeal, 404, 'Copyright appeal not found')
      if (input.recommendationId) {
        const { rows } = await transaction(sql`/* reviewCopyrightAppeal:recommendation */
        SELECT id FROM copyright_notice_appeal_recommendations
        WHERE id = ${input.recommendationId}
          AND copyright_notice_submission_id = ${input.submissionId}
      `)
        assert(rows[0], 422, 'Appeal recommendation does not belong to this appeal')
      }
      const { rows: existingRows } = await transaction<{
        id: string
        copyright_restriction_id: string
        action: CopyrightHumanReviewAction
        copyright_notice_appeal_recommendation_id: string | null
      }>(sql`/* reviewCopyrightAppeal:existing */
      SELECT id, copyright_restriction_id, action, copyright_notice_appeal_recommendation_id
      FROM copyright_notice_appeal_reviews
      WHERE copyright_notice_submission_id = ${input.submissionId}
      FOR UPDATE
    `)
      if (existingRows.length > 0) {
        const expected = new Map(
          input.decisions.map(decision => [decision.restrictionId, decision.action]),
        )
        assert(
          existingRows.length === input.decisions.length &&
            existingRows.every(
              row =>
                expected.get(row.copyright_restriction_id) === row.action &&
                row.copyright_notice_appeal_recommendation_id === input.recommendationId,
            ),
          409,
          'Copyright appeal was already reviewed differently',
        )
        await transaction.commit()
        return { noticeId: appeal.copyright_notice_id, reviewIds: existingRows.map(row => row.id) }
      }
      const { rows: restrictionRows } = await transaction<{
        id: string
        human_reviewed_at: Date | null
        lifted_at: Date | null
      }>(sql`/* reviewCopyrightAppeal:restrictions */
      SELECT restriction.id, restriction.human_reviewed_at, restriction.lifted_at
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE target.copyright_notice_id = ${appeal.copyright_notice_id}
        AND target.id = ANY(${appeal.target_ids})
        AND restriction.lifted_at IS NULL
      ORDER BY restriction.id
      FOR UPDATE OF restriction
    `)
      assert(
        restrictionRows.length === input.decisions.length &&
          restrictionRows.every(row =>
            input.decisions.some(decision => decision.restrictionId === row.id),
          ),
        422,
        'Appeal decisions must exactly cover every active restriction in the appeal',
      )
      const { reviewIds, reversalIntentIds, staydownImageIds } =
        await recordCopyrightAppealReviewEffects(
          input,
          appeal,
          restrictionRows,
          lockedNotice,
          transaction,
        )
      await readCopyrightThreadRetirement(transaction, [appeal.copyright_notice_id])
      await transaction.commit()
      void enqueueBulkApplyCopyrightActions(reversalIntentIds)
      enqueueCopyrightStaydownHashes(staydownImageIds)
      return { noticeId: appeal.copyright_notice_id, reviewIds }
    },
    'Conflicting copyright case change',
    CONFLICT,
  )
}
