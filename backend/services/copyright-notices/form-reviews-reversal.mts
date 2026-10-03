import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import { getImagePlacementKey } from '@services/images/placements'
import { createCopyrightReviewOutcomeNoticesInTransaction } from './review-outcome-notices.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'

export async function reverseAutomatedCopyrightRestrictions(
  noticeId: string,
  submissionId: string,
  moderatorId: string | null,
  reviewedAt = new Date(),
): Promise<void> {
  await using transaction = await beginTransaction()
  const { intentIds } = await reverseAutomatedCopyrightRestrictionsInTransaction(transaction, {
    noticeId,
    submissionId,
    moderatorId,
    reviewedAt,
  })
  await transaction.commit()
  for (const intentId of intentIds) void enqueueApplyCopyrightAction(intentId)
}

/**
 * Reverses a submission's pending automated restrictions and creates their restore intents inside
 * the caller's transaction, so the caller can record why in the same commit. The caller commits and
 * enqueues the returned intents.
 */
export async function reverseAutomatedCopyrightRestrictionsInTransaction(
  transaction: TransactionQuery,
  input: { noticeId: string; submissionId: string; moderatorId: string | null; reviewedAt: Date },
): Promise<{ restrictionIds: string[]; intentIds: string[] }> {
  const { noticeId, submissionId, moderatorId, reviewedAt } = input
  const { rows: placements } = await transaction<{ placement_id: string }>(sql`
    /* reviewCopyrightFormIntake:reverseAutomatedRestrictions:placements */
    SELECT DISTINCT target.placement_id
    FROM copyright_restrictions restriction
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.id = restriction.authorizing_assessment_id
    JOIN copyright_notice_targets target
      ON target.id = restriction.copyright_notice_target_id
    WHERE assessment.copyright_notice_submission_id = ${submissionId}
      AND assessment.assessed_by_id IS NULL AND target.copyright_notice_id = ${noticeId}
      AND assessment.copyright_notice_form_screening_id IS NOT NULL
      AND restriction.lifted_at IS NULL AND restriction.human_review_action IS NULL
    ORDER BY target.placement_id
  `)
  for (const placement of placements) {
    // oxlint-disable-next-line no-await-in-loop -- placement locks must use canonical order.
    await transaction(sql`/* reviewCopyrightFormIntake:reverseAutomatedRestrictions:lock */
      SELECT pg_advisory_xact_lock(hashtextextended(${getImagePlacementKey(placement.placement_id)}, 0))
    `)
  }
  const { rows } = await transaction<{ id: string }>(sql`
    /* reviewCopyrightFormIntake:reverseAutomatedRestrictions */
    UPDATE copyright_restrictions restriction
    SET human_reviewed_at = COALESCE(restriction.human_reviewed_at, ${reviewedAt}),
      human_review_action = COALESCE(restriction.human_review_action, 'reverse'),
      human_reviewed_by_id = CASE WHEN restriction.human_reviewed_at IS NULL THEN ${moderatorId}
        ELSE restriction.human_reviewed_by_id END
    FROM copyright_notice_submission_assessments assessment
    CROSS JOIN copyright_notice_targets target
    WHERE restriction.authorizing_assessment_id = assessment.id
      AND target.id = restriction.copyright_notice_target_id
      AND assessment.copyright_notice_submission_id = ${submissionId}
      AND assessment.assessed_by_id IS NULL AND target.copyright_notice_id = ${noticeId}
      AND assessment.copyright_notice_form_screening_id IS NOT NULL
      AND restriction.lifted_at IS NULL
      AND restriction.human_review_action IS NULL
    RETURNING restriction.id
  `)
  const intentIds: string[] = []
  for (const restriction of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each placement owns an independent durable saga.
    const intent = await createCopyrightRestoreIntentForReversalInTransaction(
      restriction.id,
      transaction,
    )
    // oxlint-disable-next-line no-await-in-loop -- each newly reviewed restriction requires durable notices.
    await createCopyrightReviewOutcomeNoticesInTransaction(
      { noticeId, restrictionId: restriction.id, action: 'reverse' },
      transaction,
    )
    intentIds.push(intent.id)
  }
  return { restrictionIds: rows.map(restriction => restriction.id), intentIds }
}
