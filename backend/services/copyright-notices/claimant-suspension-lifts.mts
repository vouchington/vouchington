import { beginTransaction, read } from '@data-stores/psql'
import { enqueueApplyCopyrightAction } from '@queues/notifications/enqueues'
import sql, { type SQLStatement } from 'sql-template-strings'
import { reverseAutomatedCopyrightRestrictionsInTransaction } from './form-reviews-reversal.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/**
 * The pending automatic restrictions of a claimant who is suspended. Pending means no moderator
 * has reviewed the restriction yet, so a confirmed one stays. A suspension whose administrator was
 * since erased is left out: the reversal needs an identified reviewer, so that case stays in the
 * staff queue for a moderator. Whether the automatic-withholding switch is on does not matter.
 */
function suspendedClaimantPendingRestrictionSql(): SQLStatement {
  return sql``.append(`FROM copyright_notices notice
    JOIN user_suspensions suspension
      ON suspension.user_id = notice.claimant_user_id
      AND suspension.lifted_at IS NULL AND suspension.suspended_by_id IS NOT NULL
    JOIN copyright_notice_targets target ON target.copyright_notice_id = notice.id
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.id = restriction.authorizing_assessment_id
    WHERE restriction.lifted_at IS NULL AND restriction.human_review_action IS NULL
      AND assessment.assessed_by_id IS NULL
      AND assessment.copyright_notice_form_screening_id IS NOT NULL`)
}

/** Candidate selection is not authority: each notice is rechecked under its suspension and locks. */
export function searchSuspendedClaimantAutomaticRestrictionNoticeIds(
  options: CopyrightSweepPageOptions = {},
): Promise<CopyrightSweepIdPage> {
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright suspended-claimant cursor',
    'searchSuspendedClaimantAutomaticRestrictionNoticeIds',
    'rowId',
    sql`/* searchSuspendedClaimantAutomaticRestrictionNoticeIds */
      WITH candidates AS (SELECT DISTINCT notice.id AS id `
      .append(suspendedClaimantPendingRestrictionSql())
      .append(') SELECT id FROM candidates WHERE TRUE'),
    statement => read(statement),
  )
}

/**
 * Suspending a notifier is a moderator decision; this only stops that decision leaving the
 * claimant's own unreviewed automatic withholding in place. It reverses those restrictions through
 * the ordinary reversal path, with the suspending administrator as the identified reviewer, and
 * marks each one so staff can tell it from a moderator's review of the notice. The restore delivery
 * that lifts them follows. A replay, or a claimant who is no longer suspended, changes nothing.
 */
export async function liftSuspendedClaimantAutomaticRestrictions(
  noticeId: string,
  reversedAt = new Date(),
): Promise<void> {
  await using transaction = await beginTransaction()
  // The shared lock keeps the suspension in force until this reversal commits.
  const { rows } = await transaction<{ submission_id: string; suspended_by_id: string }>(
    sql`/* liftSuspendedClaimantAutomaticRestrictions:find */
      SELECT assessment.copyright_notice_submission_id AS submission_id, suspension.suspended_by_id `
      .append(suspendedClaimantPendingRestrictionSql())
      .append(
        sql`
      AND notice.id = ${noticeId}
    ORDER BY suspension.id, assessment.id LIMIT 1
    FOR SHARE OF suspension`,
      ),
  )
  const found = rows[0]
  if (!found) return
  const { restrictionIds, intentIds } = await reverseAutomatedCopyrightRestrictionsInTransaction(
    transaction,
    {
      noticeId,
      submissionId: found.submission_id,
      moderatorId: found.suspended_by_id,
      reviewedAt: reversedAt,
    },
  )
  await transaction(sql`/* liftSuspendedClaimantAutomaticRestrictions:record */
    INSERT INTO copyright_claimant_suspension_reversals (copyright_restriction_id, reversed_at)
    SELECT restriction_id, ${reversedAt} FROM unnest(${restrictionIds}::uuid[]) AS restriction_id
    ON CONFLICT DO NOTHING
  `)
  await transaction.commit()
  for (const intentId of intentIds) void enqueueApplyCopyrightAction(intentId)
}
