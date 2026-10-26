import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  lockHostnameBlockCleanupOperation,
  type HostnameBlockCleanupOperation,
} from './cleanup-operation.mts'

export async function getHostnameBlockPenaltyPage(
  operation: HostnameBlockCleanupOperation,
  afterUserId: string | undefined,
  limit: number,
): Promise<string[]> {
  const statement = sql`/* getHostnameBlockPenaltyPage */
    SELECT user_id FROM vote_weight_penalties
    WHERE source_hostname_block_id = ${operation.blockId}
      AND reason = 'blocked_hostname' AND revoked_at IS NULL`
  if (afterUserId) statement.append(sql` AND user_id > ${afterUserId}`)
  statement.append(sql` ORDER BY user_id LIMIT ${limit}`)
  const { rows } = await write<{ user_id: string }>(statement)
  return rows.map(row => row.user_id)
}

export async function advanceHostnameBlockPenaltyPage(
  blockId: string,
  expectedProgress: number,
  completed: boolean,
): Promise<HostnameBlockCleanupOperation | null> {
  await using query = await beginTransaction()
  const operation = await lockHostnameBlockCleanupOperation(query, blockId)
  if (!operation || operation.completedAt || operation.progress !== expectedProgress)
    return operation
  const { rows } =
    await query<HostnameBlockCleanupOperation>(sql`/* advanceHostnameBlockPenaltyPage */
    UPDATE url_hostname_blocks block
    SET relation_cleanup_completed_at = CASE
        WHEN ${completed} THEN CURRENT_TIMESTAMP ELSE relation_cleanup_completed_at
      END,
      relation_cleanup_progress = relation_cleanup_progress + 1
    FROM url_hostnames hostname
    WHERE block.id = ${blockId}
      AND block.relation_cleanup_root_block_id = block.id
      AND block.relation_cleanup_progress = ${expectedProgress}
      AND block.relation_cleanup_completed_at IS NULL
      AND hostname.id = block.url_hostname_id
    RETURNING block.id AS "blockId", block.url_hostname_id AS "hostnameId",
      hostname.hostname, block.blocked_by_id AS "blockedById",
      block.blocked_source AS "blockedSource",
      block.penalize_relation_creators AS "penalizeCreators",
      block.relation_cleanup_progress AS progress,
      block.relation_cleanup_blocked_hostname_count AS "blockedHostnameCount",
      block.relation_cleanup_soft_deleted_relation_count AS "softDeletedRelationCount",
      block.relation_cleanup_penalized_user_count AS "penalizedUserCount",
      block.relation_cleanup_completed_at AS "completedAt"
  `)
  await query.commit()
  return rows[0] ?? operation
}
