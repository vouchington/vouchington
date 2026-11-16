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
  return readBoundedCopyrightEmailAncestors(transaction, [replyId], maxRows, false)
}

/** Bound the union of source intakes and ancestor paths for an actual inserted reply batch. */
export async function readBoundedCopyrightEmailAncestorSourceIds(
  transaction: TransactionQuery,
  replyIds: readonly string[],
  maxRows: number,
): Promise<string[] | null> {
  return readBoundedCopyrightEmailAncestors(transaction, replyIds, maxRows, true)
}

async function readBoundedCopyrightEmailAncestors(
  transaction: TransactionQuery,
  replyIds: readonly string[],
  maxRows: number,
  includeRoots: boolean,
): Promise<string[] | null> {
  const roots = [...new Set(replyIds)].toSorted()
  if (roots.length > maxRows) return null
  if (roots.length === 0) return []
  const { rows } = await transaction<{
    reply_id: string
    ancestor_id: string
    retired: boolean
  }>(sql`
    /* readBoundedCopyrightEmailAncestorIds */
    WITH RECURSIVE reached(reply_id, ancestor_id) AS (
      SELECT root.intake_id, root.intake_id
      FROM unnest(${roots}::uuid[]) root(intake_id)
      UNION
      SELECT edge.reply_message_intake_receipt_id, edge.ancestor_message_intake_receipt_id
      FROM reached child
      JOIN LATERAL (
        SELECT reply_message_intake_receipt_id, ancestor_message_intake_receipt_id
        FROM copyright_notice_email_message_ancestors
        WHERE reply_message_intake_receipt_id = child.ancestor_id
        ORDER BY ancestor_message_intake_receipt_id
        LIMIT ${maxRows + 1}
      ) edge ON true
    )
    SELECT reply_id, ancestor_id, EXISTS (
      SELECT 1 FROM copyright_notice_email_intake_notice_links link
      JOIN copyright_notice_thread_retention_activities retirement
        ON retirement.copyright_notice_id = link.copyright_notice_id
      WHERE link.copyright_notice_email_intake_id = reached.ancestor_id
        AND retirement.retired_before_intake_bound > reached.ancestor_id
    ) AS retired
    FROM reached LIMIT ${maxRows + 2}
  `)
  const ancestors = new Set<string>(roots)
  const edges = new Set<string>()
  const reachedRoots = new Set<string>()
  for (const row of rows) {
    if (row.retired) return null
    if (row.reply_id === row.ancestor_id && ancestors.has(row.reply_id)) continue
    ancestors.add(row.ancestor_id)
    reachedRoots.add(row.ancestor_id)
    edges.add(`${row.reply_id}:${row.ancestor_id}`)
    if (ancestors.size + edges.size > maxRows) return null
  }
  if (!includeRoots)
    for (const root of roots) {
      if (!reachedRoots.has(root)) ancestors.delete(root)
    }
  return [...ancestors].toSorted()
}
