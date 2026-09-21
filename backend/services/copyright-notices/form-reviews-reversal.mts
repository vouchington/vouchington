import { beginTransaction } from '@data-stores/psql'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import sql from 'sql-template-strings'
import { createCopyrightRestoreIntentForReversalInTransaction } from './restoration-reversal.mts'

export async function reverseAutomatedCopyrightRestrictions(
  noticeId: string,
  submissionId: string,
  moderatorId: string,
): Promise<void> {
  const reviewedAt = new Date()
  await using transaction = await beginTransaction()
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
      AND restriction.lifted_at IS NULL
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
  await transaction.commit()
  for (const intentId of intentIds) void enqueueApplyCopyrightAction(intentId)
}
