import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'

/** Notice ids reported per bucket; the counts stay exact. */
export const COPYRIGHT_REVIEW_TARGET_NOTICE_ID_LIMIT = 20

export type CopyrightReviewTargetBreaches = {
  waitingPastTarget: { count: number; noticeIds: string[] }
  missedEscalation: { count: number; noticeIds: string[] }
  missedRestorationDeadline: { count: number; noticeIds: string[] }
}

/**
 * Counts the notices a moderator has left waiting past `reviewTargetMinutes` and the notices with
 * an open counter-notice deadline past `escalation_at` or `restoration_deadline_at`, oldest first.
 * A null target skips the waiting bucket; missed deadlines are always counted. Only notice ids leave
 * this read, never claimant or poster fields. `noticeIds` bounds a test to its own fixtures.
 */
export async function readCopyrightReviewTargetBreaches(options: {
  now: Date
  reviewTargetMinutes: number | null
  noticeIds?: readonly string[]
}): Promise<CopyrightReviewTargetBreaches> {
  observeSharedDbScope('readCopyrightReviewTargetBreaches', sharedDbIdsScope(options.noticeIds))
  const cutoff =
    options.reviewTargetMinutes === null
      ? null
      : new Date(options.now.getTime() - options.reviewTargetMinutes * 60_000)
  const scope = options.noticeIds ? [...options.noticeIds] : null
  const limit = COPYRIGHT_REVIEW_TARGET_NOTICE_ID_LIMIT
  const { rows } = await read<{
    waiting_count: number
    waiting_notice_ids: string[]
    escalation_count: number
    escalation_notice_ids: string[]
    restoration_count: number
    restoration_notice_ids: string[]
  }>(sql`/* readCopyrightReviewTargetBreaches */
    WITH waiting_item AS (
      SELECT intake.copyright_notice_id AS notice_id, submission.received_at AS waiting_since
      FROM copyright_notice_form_intakes intake
      JOIN copyright_notice_submissions submission ON submission.id = intake.copyright_notice_submission_id
      LEFT JOIN copyright_notice_form_intake_reviews review ON review.copyright_notice_form_intake_id = intake.id
      WHERE review.id IS NULL
        AND (submission.source_kind = 'guest_form' OR NOT EXISTS (
          SELECT 1 FROM copyright_notice_form_screening_executions execution
          JOIN copyright_notice_submission_assessments assessment
            ON assessment.copyright_notice_submission_id = submission.id
              AND assessment.copyright_notice_form_screening_id = execution.copyright_notice_form_screening_id
          WHERE execution.copyright_notice_form_intake_id = intake.id
            AND fn_current_copyright_form_screening(submission.id, execution.copyright_notice_form_screening_id)
            AND assessment.substantially_compliant AND NOT EXISTS (
              SELECT 1 FROM copyright_notice_submission_assessments newer
              WHERE newer.supersedes_assessment_id = assessment.id
            )
        ))
      UNION ALL
      SELECT target.copyright_notice_id, restriction.imposed_at
      FROM copyright_restrictions restriction
      JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
      WHERE restriction.lifted_at IS NULL AND restriction.human_reviewed_at IS NULL
      UNION ALL
      SELECT submission.copyright_notice_id, submission.received_at
      FROM copyright_notice_submissions submission
      WHERE (submission.kind = 'appeal' AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_appeal_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )) OR (submission.kind = 'counter_notice' AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_counter_notice_reviews review
          WHERE review.copyright_notice_submission_id = submission.id
        )) OR (submission.kind = 'court_or_ccb_hold' AND NOT EXISTS (
          SELECT 1 FROM copyright_notice_legal_hold_assessments assessment
          WHERE assessment.copyright_notice_submission_id = submission.id
        ))
    ), waiting AS (
      SELECT notice_id, min(waiting_since) AS waiting_since FROM waiting_item
      WHERE waiting_since <= ${cutoff}::timestamptz
        AND (${scope}::uuid[] IS NULL OR notice_id = ANY(${scope}::uuid[]))
      GROUP BY notice_id
    ), missed AS (
      SELECT copyright_notice_id AS notice_id, min(escalation_at) AS escalation_at,
        min(restoration_deadline_at) AS restoration_deadline_at
      FROM copyright_notice_deadlines
      WHERE resolved_at IS NULL AND cancelled_at IS NULL AND escalation_at <= ${options.now}
        AND (${scope}::uuid[] IS NULL OR copyright_notice_id = ANY(${scope}::uuid[]))
      GROUP BY copyright_notice_id
    )
    SELECT
      (SELECT count(*)::int FROM waiting) AS waiting_count,
      (SELECT coalesce((array_agg(notice_id::text ORDER BY waiting_since, notice_id))[1:${limit}::int], '{}')
        FROM waiting) AS waiting_notice_ids,
      (SELECT count(*)::int FROM missed) AS escalation_count,
      (SELECT coalesce((array_agg(notice_id::text ORDER BY escalation_at, notice_id))[1:${limit}::int], '{}')
        FROM missed) AS escalation_notice_ids,
      (SELECT count(*)::int FROM missed WHERE restoration_deadline_at <= ${options.now})
        AS restoration_count,
      (SELECT coalesce((array_agg(notice_id::text ORDER BY restoration_deadline_at, notice_id))[1:${limit}::int], '{}')
        FROM missed WHERE restoration_deadline_at <= ${options.now}) AS restoration_notice_ids
  `)
  const row = rows[0]!
  return {
    waitingPastTarget: { count: row.waiting_count, noticeIds: row.waiting_notice_ids },
    missedEscalation: { count: row.escalation_count, noticeIds: row.escalation_notice_ids },
    missedRestorationDeadline: {
      count: row.restoration_count,
      noticeIds: row.restoration_notice_ids,
    },
  }
}
