import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

const PREEMPTED_MESSAGE = 'A court or CCB filing or legal hold preempted this restoration.'

/** A filing or hold wins against any restoration that has not finished. `FOR UPDATE OF candidate`
 * waits on the work item row, which both this write and the delivery worker's lease-conditional
 * completion write. Admission preempting first makes that completion match no row; the worker
 * completing first makes this UPDATE re-evaluate after the wait, see `completed_at` set, and
 * preempt nothing, so the filing commits strictly after the restore and an unassessed filing
 * then reaches the placement through its assessment (late-hold activation).
 * Without target ids the whole case is preempted, as an unassessed filing has no target scope. */
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
      FOR UPDATE OF candidate
    )
    RETURNING work.id
  `)
  return rows.map(row => row.id)
}
