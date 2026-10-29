import type { TransactionQuery } from '@data-stores/psql'

/** A lifted descendant still belongs to an unfinished cleanup operation. */
export async function hasIncompleteHostnameCleanupRoot(
  query: TransactionQuery,
  blockId: string,
): Promise<boolean> {
  const { rows } = await query<{ protected: boolean }>(
    `/* hasIncompleteHostnameCleanupRoot */
     SELECT EXISTS (
       SELECT 1 FROM url_hostname_blocks block
       JOIN url_hostname_blocks root ON root.id = block.relation_cleanup_root_block_id
       WHERE block.id = $1::uuid
         AND root.relation_cleanup_root_block_id = root.id
         AND root.relation_cleanup_completed_at IS NULL
     ) AS protected`,
    [blockId],
  )
  return rows[0]!.protected
}

/** Mirrors the two SET NULL foreign keys before deleting a lifted hostname block. */
export async function detachHostnameBlockReferences(
  query: TransactionQuery,
  blockId: string,
  batchSize: number,
): Promise<{ remain: boolean; progressed: boolean }> {
  const descendants = await query(
    `/* detachHostnameBlockDescendantPage */
     WITH page AS (
       SELECT id FROM url_hostname_blocks
       WHERE relation_cleanup_root_block_id = $1::uuid
       ORDER BY url_hostname_id LIMIT $2 FOR UPDATE SKIP LOCKED
     )
     UPDATE url_hostname_blocks child
     SET relation_cleanup_root_block_id = NULL
     FROM page WHERE child.id = page.id`,
    [blockId, batchSize],
  )
  const remainingBudget = batchSize - (descendants.rowCount ?? 0)
  const penalties =
    remainingBudget > 0
      ? await query(
          `/* detachHostnameBlockPenaltyPage */
       WITH page AS (
         SELECT id FROM vote_weight_penalties
         WHERE source_hostname_block_id = $1::uuid
         ORDER BY user_id LIMIT $2 FOR UPDATE SKIP LOCKED
       )
       UPDATE vote_weight_penalties penalty
       SET source_hostname_block_id = NULL
       FROM page WHERE penalty.id = page.id`,
          [blockId, remainingBudget],
        )
      : { rowCount: 0 }
  const { rows } = await query<{ remains: boolean }>(
    `/* hasHostnameBlockReferences */
     SELECT EXISTS (
       SELECT 1 FROM url_hostname_blocks WHERE relation_cleanup_root_block_id = $1::uuid
     ) OR EXISTS (
       SELECT 1 FROM vote_weight_penalties WHERE source_hostname_block_id = $1::uuid
     ) AS remains`,
    [blockId],
  )
  return {
    remain: rows[0]!.remains,
    progressed: (descendants.rowCount ?? 0) + (penalties.rowCount ?? 0) > 0,
  }
}
