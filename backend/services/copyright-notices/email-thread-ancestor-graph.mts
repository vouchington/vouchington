import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/**
 * Walk ancestor edge identities incrementally, stopping when the intake-plus-edge budget is
 * exceeded. UNION deduplicates cycles; the outer LIMIT must stay directly on the recursive CTE.
 */
export async function readBoundedCopyrightEmailAncestorIds(
  transaction: TransactionQuery,
  replyId: string,
  maxRows: number,
): Promise<string[] | null> {
  const { rows } = await transaction<{ reply_id: string; ancestor_id: string }>(sql`
    /* readBoundedCopyrightEmailAncestorIds */
    WITH RECURSIVE reached(reply_id, ancestor_id) AS (
      SELECT ${replyId}::uuid, ${replyId}::uuid
      UNION
      SELECT edge.reply_message_intake_id, edge.ancestor_message_intake_id
      FROM reached child
      JOIN LATERAL (
        SELECT reply_message_intake_id, ancestor_message_intake_id
        FROM copyright_notice_email_message_ancestors
        WHERE reply_message_intake_id = child.ancestor_id
        ORDER BY ancestor_message_intake_id
        LIMIT ${maxRows + 1}
      ) edge ON true
    )
    SELECT reply_id, ancestor_id FROM reached LIMIT ${maxRows + 2}
  `)
  const ancestors = new Set<string>([replyId])
  const edges = new Set<string>()
  let rootIsAncestor = false
  for (const row of rows) {
    if (row.reply_id === replyId && row.ancestor_id === replyId) continue
    ancestors.add(row.ancestor_id)
    if (row.ancestor_id === replyId) rootIsAncestor = true
    edges.add(`${row.reply_id}:${row.ancestor_id}`)
    if (ancestors.size + edges.size > maxRows) return null
  }
  if (!rootIsAncestor) ancestors.delete(replyId)
  return [...ancestors].toSorted()
}
