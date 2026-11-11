import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

const PREEMPTED_MESSAGE = 'A court or CCB filing or legal hold preempted this restoration.'

/** A filing or hold wins against any restoration that has not finished. The conditional UPDATE
 * keys on the work item's own state, so an in-flight restore completes only if it commits first;
 * otherwise its lease-conditional completion matches no row and the worker repairs the edge to deny.
 * A restore a worker is applying right now holds its row; it is skipped rather than waited on, because the worker would be waiting on this transaction's notice lock, and its restored tuple is re-withheld by the late-hold activation. The row is left blocked, so resolving the hold replays it. Without target ids the whole case is preempted, as an unassessed filing has no target scope. */
export async function preemptCopyrightRestorations(
  noticeId: string,
  query: TransactionQuery,
  targetIds: readonly string[] | null = null,
): Promise<string[]> {
  const { rows } = await query<{ id: string }>(sql`/* preemptCopyrightRestorations */
    UPDATE copyright_notice_action_work_items work
    SET completed_at = clock_timestamp(), completed_at_reason = 'blocked',
      failure_message = ${PREEMPTED_MESSAGE}, available_at = NULL
    WHERE work.id IN (
      SELECT candidate.id
      FROM copyright_notice_action_work_items candidate
      JOIN copyright_restrictions restriction ON restriction.id = candidate.copyright_restriction_id
      WHERE candidate.copyright_notice_id = ${noticeId}
        AND (${targetIds}::uuid[] IS NULL
          OR restriction.copyright_notice_target_id = ANY(${targetIds}::uuid[]))
        AND candidate.action = 'restore' AND candidate.state IN ('pending', 'claimed')
      FOR UPDATE OF candidate SKIP LOCKED
    )
    RETURNING work.id
  `)
  return rows.map(row => row.id)
}
