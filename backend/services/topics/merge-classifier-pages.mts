import type { TransactionQuery } from '@data-stores/psql'

const children = [
  'classifier_decision_batch_candidates',
  'classifier_candidate_community_overrides',
  'classifier_candidate_thresholds',
] as const

/** Drain each child's fan-out before removing the candidate that formerly cascaded them all. */
export async function processTopicMergeClassifierPage(
  query: TransactionQuery,
  sourceId: string,
  phase: number,
  limit: number,
): Promise<{ phase: number; hasMore: boolean }> {
  const { rows } = await query<{ id: string }>(
    `/* processTopicMergeClassifierPage candidate */
    SELECT id FROM classifier_candidates WHERE topic_id = $1::uuid ORDER BY id LIMIT 1 FOR UPDATE`,
    [sourceId],
  )
  if (!rows.length) return { phase: 0, hasMore: false }
  const candidateId = rows[0]!.id
  const table = children[phase]
  if (table) {
    const { rowCount } = await query(
      `/* processTopicMergeClassifierPage children */ WITH page AS MATERIALIZED (
      SELECT tableoid,ctid FROM ${table} WHERE candidate_id = $1::uuid LIMIT $2 FOR UPDATE
    ) DELETE FROM ${table} target USING page WHERE target.tableoid=page.tableoid AND target.ctid=page.ctid`,
      [candidateId, limit],
    )
    return { phase: rowCount ? phase : phase + 1, hasMore: true }
  }
  await query(
    `/* processTopicMergeClassifierPage delete */ DELETE FROM classifier_candidates WHERE id = $1::uuid`,
    [candidateId],
  )
  return { phase: 0, hasMore: true }
}
