import type { TransactionQuery } from '@data-stores/psql'

export async function attachOperationalHostnameDescendantForTest(
  query: TransactionQuery,
  rootBlockId: string,
  descendantBlockId: string,
): Promise<void> {
  await query(
    `/* attachOperationalHostnameDescendantForTest */
     UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = $1::uuid
     WHERE id = $2::uuid`,
    [rootBlockId, descendantBlockId],
  )
}

export async function insertOperationalPenaltyUserForTest(
  query: TransactionQuery,
): Promise<string> {
  const { rows } = await query<{ id: string }>(
    `/* insertOperationalPenaltyUserForTest */ INSERT INTO users DEFAULT VALUES RETURNING id`,
  )
  return rows[0]!.id
}

export async function countOperationalHostnameDescendantsForTest(
  query: TransactionQuery,
  rootBlockId: string,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `/* countOperationalHostnameDescendantsForTest */
     SELECT count(*)::text AS count FROM url_hostname_blocks
     WHERE relation_cleanup_root_block_id = $1::uuid`,
    [rootBlockId],
  )
  return Number(rows[0]!.count)
}

export async function readOperationalHostnamePenaltySourceForTest(
  query: TransactionQuery,
  penaltyId: string,
): Promise<string | null> {
  const { rows } = await query<{ source_hostname_block_id: string | null }>(
    `/* readOperationalHostnamePenaltyForTest */
     SELECT source_hostname_block_id FROM vote_weight_penalties WHERE id = $1::uuid`,
    [penaltyId],
  )
  return rows[0]!.source_hostname_block_id
}

export async function attachCompletedHostnameRootForTest(
  query: TransactionQuery,
  rootBlockId: string,
  childBlockId: string,
): Promise<void> {
  await query(
    `/* attachCompletedHostnameRootForTest */
     UPDATE url_hostname_blocks
     SET relation_cleanup_root_block_id = $1::uuid,
         relation_cleanup_completed_at = CASE WHEN id = $1::uuid THEN now() END
     WHERE id = ANY($2::uuid[])`,
    [rootBlockId, [rootBlockId, childBlockId]],
  )
}

export async function readHostnameRootReferencesForTest(
  query: TransactionQuery,
  blockIds: readonly string[],
): Promise<Array<{ id: string; root: string | null }>> {
  const { rows } = await query<{ id: string; root: string | null }>(
    `/* readHostnameRootReferencesForTest */
     SELECT id, relation_cleanup_root_block_id AS root FROM url_hostname_blocks
     WHERE id = ANY($1::uuid[])`,
    [blockIds],
  )
  return rows
}

export async function markIncompleteHostnameRootForTest(
  query: TransactionQuery,
  blockId: string,
): Promise<void> {
  await query(
    `/* markIncompleteHostnameRootForTest */
     UPDATE url_hostname_blocks SET relation_cleanup_root_block_id = id
     WHERE id = $1::uuid`,
    [blockId],
  )
}

export async function lockOperationalHostnameDescendantForTest(
  query: TransactionQuery,
  descendantBlockId: string,
): Promise<void> {
  await query(
    `/* lockOperationalHostnameDescendantForTest */
     SELECT id FROM url_hostname_blocks WHERE id = $1::uuid FOR UPDATE`,
    [descendantBlockId],
  )
}

export async function deleteOwnedHostnameBlocksAndHostnamesForTest(
  query: TransactionQuery,
  blockIds: readonly string[],
  hostnameIds: readonly string[],
): Promise<void> {
  await query(
    '/* deleteOwnedHostnameBlocksForLockTest */ DELETE FROM url_hostname_blocks WHERE id = ANY($1::uuid[])',
    [blockIds],
  )
  await query(
    '/* deleteOwnedHostnamesForLockTest */ DELETE FROM url_hostnames WHERE id = ANY($1::uuid[])',
    [hostnameIds],
  )
}
