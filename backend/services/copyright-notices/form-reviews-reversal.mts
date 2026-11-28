import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { enqueueBulkApplyCopyrightActions } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import { drainBatchedWrite } from './bounded-reads.mts'
import { buildCopyrightReviewOutcomeDeliveries } from './review-outcome-notices.mts'
import { createCopyrightStatementDeliveriesInTransaction } from './statement-delivery.mts'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'
import { getCopyrightSweepLimits } from './work-limits.mts'

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
  const rows: Array<{ id: string }> = []
  await drainBatchedWrite(getCopyrightSweepLimits().batchSize, async limit => {
    const { rows: updated } = await transaction<{ id: string }>(sql`
      /* reviewCopyrightFormIntake:reverseAutomatedRestrictions */
      UPDATE copyright_restrictions restriction
      SET human_reviewed_at = COALESCE(restriction.human_reviewed_at, ${reviewedAt}),
        human_review_action = COALESCE(restriction.human_review_action, 'reverse'),
        human_reviewed_by_id = CASE WHEN restriction.human_reviewed_at IS NULL THEN ${moderatorId}
          ELSE restriction.human_reviewed_by_id END
      WHERE restriction.id IN (
        SELECT candidate.id
        FROM copyright_restrictions candidate
        JOIN copyright_notice_submission_assessment_identities authority
          ON authority.id = candidate.authorizing_assessment_id
        JOIN copyright_notice_targets target ON target.id = candidate.copyright_notice_target_id
        WHERE authority.copyright_notice_submission_id = ${submissionId}
          AND target.copyright_notice_id = ${noticeId}
          AND candidate.is_authorizing_assessment_automated
          AND candidate.lifted_at IS NULL
          AND candidate.human_review_action IS NULL
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
        ORDER BY candidate.id ASC
        LIMIT ${limit}
      )
      RETURNING restriction.id
    `)
    rows.push(...updated)
    return updated.length
  })
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
