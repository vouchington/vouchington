import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { heldCopyrightDeadlineSql } from './held-deadline-sql.mts'
import { copyrightStaffQueueKeysSql } from './read-models-staff-queue-sql.mts'
import { copyrightEmailIntakeAwaitingReviewSql } from './read-models-staff-email-intakes-sql.mts'

/** Notice or email intake ids reported per bucket; the counts stay exact. */
const COPYRIGHT_REVIEW_TARGET_ID_LIMIT = 20

export type CopyrightReviewTargetBreaches = {
  waitingPastTarget: { count: number; noticeIds: string[] }
  missedEscalation: { count: number; noticeIds: string[] }
  missedRestorationDeadline: { count: number; noticeIds: string[] }
  emailIntakesWaitingPastTarget: { count: number; emailIntakeIds: string[] }
}

/**
 * Counts the notices with a staff-queue item (other than a deadline) open past
 * `reviewTargetMinutes`, the email intakes on the email-review queue received before that cutoff,
 * and the notices with an open counter-notice deadline past `escalation_at` or
 * `restoration_deadline_at`, oldest first. Both waiting buckets reuse their queue's own rule, so
 * paging excludes assessed qualifying holds awaiting resolution and times automated enforcement
 * from receipt; the staff display retains its original waiting age. A null target skips the waiting buckets; missed deadlines are
 * counted against `now` unless every restricted deadline target is covered by an unresolved
 * qualifying hold and no filing on the case is unassessed. Only notice and intake ids leave this read, never claimant,
 * poster, or email fields. `noticeIds` and `emailIntakeIds` bound a test to its own fixtures; an
 * omitted list is empty once the other is given.
 */
export async function readCopyrightReviewTargetBreaches(options: {
  now: Date
  reviewTargetMinutes: number | null
  noticeIds?: readonly string[]
  emailIntakeIds?: readonly string[]
}): Promise<CopyrightReviewTargetBreaches> {
  const scoped = options.noticeIds !== undefined || options.emailIntakeIds !== undefined
  const scope = scoped ? [...(options.noticeIds ?? [])] : null
  const emailScope = scoped ? [...(options.emailIntakeIds ?? [])] : null
  observeSharedDbScope(
    'readCopyrightReviewTargetBreaches',
    sharedDbIdsScope(scope && emailScope ? [...scope, ...emailScope] : undefined),
  )
  const cutoff =
    options.reviewTargetMinutes === null
      ? null
      : new Date(options.now.getTime() - options.reviewTargetMinutes * 60_000)
  const limit = COPYRIGHT_REVIEW_TARGET_ID_LIMIT
  const query = sql`/* readCopyrightReviewTargetBreaches */`
  query.append(copyrightStaffQueueKeysSql({ paging: true }))
  query
    .append(sql`
    , waiting AS (
      SELECT copyright_notice_id AS notice_id, min(since) AS waiting_since FROM open_item
      WHERE reason NOT IN ('deadline_due', 'deadline_missed') AND since <= ${cutoff}::timestamptz
        AND (${scope}::uuid[] IS NULL OR copyright_notice_id = ANY(${scope}::uuid[]))
      GROUP BY copyright_notice_id
    ), missed AS (
      SELECT copyright_notice_id AS notice_id, min(escalation_at) AS escalation_at,
        min(restoration_deadline_at) AS restoration_deadline_at
      FROM copyright_notice_deadlines deadline
      WHERE resolved_at IS NULL AND cancelled_at IS NULL AND escalation_at <= ${options.now}
        AND (${scope}::uuid[] IS NULL OR copyright_notice_id = ANY(${scope}::uuid[]))
        AND NOT `)
    .append(heldCopyrightDeadlineSql()).append(sql`
      GROUP BY copyright_notice_id
    ), email_waiting AS (
      SELECT intake.id, intake.received_at FROM copyright_notice_email_intakes intake
      WHERE intake.received_at <= ${cutoff}::timestamptz
        AND (${emailScope}::uuid[] IS NULL OR intake.id = ANY(${emailScope}::uuid[]))
        AND`)
  query.append(copyrightEmailIntakeAwaitingReviewSql())
  query.append(sql`
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
        FROM missed WHERE restoration_deadline_at <= ${options.now}) AS restoration_notice_ids,
      (SELECT count(*)::int FROM email_waiting) AS email_count,
      (SELECT coalesce((array_agg(id::text ORDER BY received_at, id))[1:${limit}::int], '{}')
        FROM email_waiting) AS email_intake_ids
  `)
  const { rows } = await read<{
    waiting_count: number
    waiting_notice_ids: string[]
    escalation_count: number
    escalation_notice_ids: string[]
    restoration_count: number
    restoration_notice_ids: string[]
    email_count: number
    email_intake_ids: string[]
  }>(query)
  const row = rows[0]!
  return {
    waitingPastTarget: { count: row.waiting_count, noticeIds: row.waiting_notice_ids },
    missedEscalation: { count: row.escalation_count, noticeIds: row.escalation_notice_ids },
    missedRestorationDeadline: {
      count: row.restoration_count,
      noticeIds: row.restoration_notice_ids,
    },
    emailIntakesWaitingPastTarget: { count: row.email_count, emailIntakeIds: row.email_intake_ids },
  }
}
