import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { copyrightStaffQueueKeysSql } from './read-models-staff-queue-sql.mts'

/** Notice ids reported per bucket; the counts stay exact. */
export const COPYRIGHT_REVIEW_TARGET_NOTICE_ID_LIMIT = 20

export type CopyrightReviewTargetBreaches = {
  waitingPastTarget: { count: number; noticeIds: string[] }
  missedEscalation: { count: number; noticeIds: string[] }
  missedRestorationDeadline: { count: number; noticeIds: string[] }
}

/**
 * Counts the notices with a staff-queue item (other than a deadline) open past
 * `reviewTargetMinutes`, and the notices with an open counter-notice deadline past `escalation_at`
 * or `restoration_deadline_at`, oldest first. The waiting items are the staff queue's own, so the
 * page and the queue agree. A null target skips the waiting bucket; missed deadlines are always
 * counted against `now`. Only notice ids leave this read, never claimant or poster fields.
 * `noticeIds` bounds a test to its own fixtures.
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
  }>(
    sql`/* readCopyrightReviewTargetBreaches */`.append(copyrightStaffQueueKeysSql()).append(sql`
    , waiting AS (
      SELECT copyright_notice_id AS notice_id, min(since) AS waiting_since FROM open_item
      WHERE reason NOT IN ('deadline_due', 'deadline_missed') AND since <= ${cutoff}::timestamptz
        AND (${scope}::uuid[] IS NULL OR copyright_notice_id = ANY(${scope}::uuid[]))
      GROUP BY copyright_notice_id
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
  `),
  )
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
