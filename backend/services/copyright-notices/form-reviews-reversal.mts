import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { enqueueBulkApplyCopyrightActions } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import { buildCopyrightReviewOutcomeDeliveries } from './review-outcome-notices.mts'
import { createCopyrightStatementDeliveriesInTransaction } from './statement-delivery.mts'
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
  void enqueueBulkApplyCopyrightActions(intentIds)
}

/**
 * Reverses a submission's pending automated restrictions and creates their restore intents inside
 * the caller's transaction, so the caller can record why in the same commit. The caller commits and
 * enqueues the returned intents.
 */
export async function reverseAutomatedCopyrightRestrictionsInTransaction(
  transaction: TransactionQuery,
  input: {
    noticeId: string
    submissionId: string
    moderatorId: string | null
    reviewedAt: Date
    claimantSuspensionId?: string
  },
): Promise<{ restrictionIds: string[]; intentIds: string[] }> {
  const { noticeId, submissionId, moderatorId, reviewedAt, claimantSuspensionId } = input
  const { rows } = await transaction<{ id: string }>(sql`
    /* reviewCopyrightFormIntake:reverseAutomatedRestrictions */
    UPDATE copyright_restrictions restriction
    SET human_reviewed_at = COALESCE(restriction.human_reviewed_at, ${reviewedAt}),
      human_review_action = COALESCE(restriction.human_review_action, 'reverse'),
      human_reviewed_by_id = CASE WHEN restriction.human_reviewed_at IS NULL THEN ${moderatorId}
        ELSE restriction.human_reviewed_by_id END
    FROM copyright_notice_submission_assessment_identities authority
    CROSS JOIN copyright_notice_targets target
    WHERE restriction.authorizing_assessment_id = authority.id
      AND target.id = restriction.copyright_notice_target_id
      AND authority.copyright_notice_submission_id = ${submissionId}
      AND target.copyright_notice_id = ${noticeId}
      AND restriction.is_authorizing_assessment_automated
      AND restriction.lifted_at IS NULL
      AND restriction.human_review_action IS NULL
      AND (
        ${claimantSuspensionId ?? null}::uuid IS NULL OR EXISTS (
          SELECT 1
          FROM user_suspensions suspension
          JOIN copyright_notices notice ON notice.claimant_user_id = suspension.user_id
          WHERE suspension.id = ${claimantSuspensionId ?? null}
            AND suspension.suspended_by_id = ${moderatorId}
            AND suspension.lifted_at IS NULL
            AND notice.id = ${noticeId}
        )
      )
    RETURNING restriction.id
  `)
  const intentIds: string[] = []
  for (const restriction of rows) {
    // oxlint-disable-next-line no-await-in-loop -- each placement owns an independent durable saga.
    const intent = await createCopyrightRestoreIntentForReversalInTransaction(
      restriction.id,
      transaction,
    )
    intentIds.push(intent.id)
  }
  // Each newly reviewed restriction requires durable notices, created together.
  await createCopyrightStatementDeliveriesInTransaction(
    await buildCopyrightReviewOutcomeDeliveries(
      rows.map(restriction => ({
        noticeId,
        restrictionId: restriction.id,
        action: 'reverse' as const,
      })),
      transaction,
    ),
    transaction,
  )
  return { restrictionIds: rows.map(restriction => restriction.id), intentIds }
}
