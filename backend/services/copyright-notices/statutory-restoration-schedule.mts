import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { createEligibleCopyrightRestoreIntent } from './restoration.mts'
import {
  queryCopyrightSweepIdPage,
  type CopyrightSweepIdPage,
  type CopyrightSweepPageOptions,
} from './sweep-id-pages.mts'

/** Pages the deadlines whose day-ten US-DMCA restoration is due at `now` and not yet materialized. */
export function searchDueStatutoryCopyrightRestorationDeadlineIds(
  options: CopyrightSweepPageOptions & { now: Date },
): Promise<CopyrightSweepIdPage> {
  const query = sql`/* searchDueStatutoryCopyrightRestorationDeadlineIds */
    SELECT DISTINCT deadline.id`
  appendDueStatutoryRestorationSource(query, options.now)
  return queryCopyrightSweepIdPage(
    options,
    'Invalid copyright restoration deadline cursor',
    'restorationDeadline',
    query,
    statement => read(statement),
  )
}

/** Materializes one deadline's day-ten US-DMCA restoration intents from durable deadline state.
 * This is the primary statutory dispatcher; queue reconciliation only recovers an already-created
 * intent. */
export async function createDueStatutoryCopyrightRestoreIntentsForDeadline(
  deadlineId: string,
  now: Date,
): Promise<number> {
  const query = sql`/* createDueStatutoryCopyrightRestoreIntentsForDeadline */
    SELECT notice.id AS notice_id, target.id AS target_id, restriction.id AS restriction_id,
      deadline.id AS deadline_id, target.placement_revision`
  appendDueStatutoryRestorationSource(query, now)
  query.append(sql`\n      AND deadline.id = ${deadlineId}`)
  const { rows } = await read<{
    notice_id: string
    target_id: string
    restriction_id: string
    deadline_id: string
    placement_revision: number
  }>(query)
  const outcomes = await Promise.allSettled(
    rows.map(row =>
      createEligibleCopyrightRestoreIntent({
        noticeId: row.notice_id,
        targetId: row.target_id,
        restrictionId: row.restriction_id,
        deadlineId: row.deadline_id,
        expectedPlacementRevision: row.placement_revision,
        now,
      }),
    ),
  )
  const failures = outcomes.filter(
    (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(failure => failure.reason),
      'Failed to materialize one or more due copyright restoration intents',
    )
  }
  return outcomes.filter(outcome => outcome.status === 'fulfilled').length
}

function appendDueStatutoryRestorationSource(query: SQLStatement, now: Date): void {
  query.append(sql`
    FROM copyright_notice_deadlines deadline
    JOIN copyright_notices notice ON notice.id = deadline.copyright_notice_id
    JOIN copyright_notice_submission_assessments assessment
      ON assessment.id = deadline.qualifying_counter_notice_assessment_id
    JOIN copyright_notice_counter_notice_assessment_targets assessment_target
      ON assessment_target.copyright_notice_submission_assessment_id = assessment.id
    JOIN copyright_notice_targets target ON target.id = assessment_target.copyright_notice_target_id
    JOIN copyright_restrictions restriction ON restriction.copyright_notice_target_id = target.id
    WHERE deadline.earliest_restoration_at <= ${now}
      AND deadline.resolved_at IS NULL AND deadline.cancelled_at IS NULL
      AND restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_action_intents intent
        WHERE intent.copyright_restriction_id = restriction.id
          AND intent.copyright_notice_deadline_id = deadline.id
          AND intent.action = 'restore'
          AND intent.state IN ('pending', 'claimed', 'completed')
      )`)
}
