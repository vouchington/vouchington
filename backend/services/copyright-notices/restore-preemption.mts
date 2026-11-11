import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

const PREEMPTED_MESSAGE = 'A court or CCB filing or legal hold preempted this restoration.'

/** A filing or hold wins against any restoration that has not finished. The conditional UPDATE
 * keys on the work item's own state, so an in-flight restore completes only if it commits first;
 * otherwise its lease-conditional completion matches no row and the worker repairs the edge to deny.
 * The row is left blocked, so resolving the hold replays it. Without target ids the whole case is preempted, as an unassessed filing has no target scope. */
export async function preemptCopyrightRestorations(
  noticeId: string,
  query: TransactionQuery,
  targetIds: readonly string[] | null = null,
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql`/* preemptCopyrightRestorations */
    UPDATE copyright_notice_action_work_items work
    SET completed_at = clock_timestamp(), completed_at_reason = 'blocked',
      failure_message = ${PREEMPTED_MESSAGE}, available_at = NULL
    FROM copyright_restrictions restriction
    WHERE restriction.id = work.copyright_restriction_id
      AND work.copyright_notice_id = ${noticeId}
      AND (${targetIds}::uuid[] IS NULL
        OR restriction.copyright_notice_target_id = ANY(${targetIds}::uuid[]))
      AND work.action = 'restore' AND work.state IN ('pending', 'claimed')
    RETURNING work.id
  `)
  return rows.map(row => row.id)
}
