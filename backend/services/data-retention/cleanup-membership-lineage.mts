import { getDataRetentionLimits } from './config.mts'
import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function releaseMembershipLineageBindings(
  query: QueryExecutor,
  userId: string,
  batchSize = getDataRetentionLimits().batchSize,
): Promise<number> {
  const { rowCount } =
    await query(sql`/* cleanupSoftDeletedUserBatch: release membership lineage bindings */
    WITH candidates AS (SELECT id FROM membership_lineage_bindings
      WHERE user_id = ${userId} AND released_at IS NULL
      ORDER BY id LIMIT ${batchSize})
    UPDATE membership_lineage_bindings
    SET released_at = CURRENT_TIMESTAMP,
        release_reason = 'account_hard_deleted'
    WHERE id IN (SELECT id FROM candidates) AND released_at IS NULL`)
  return rowCount ?? 0
}

export async function detachProviderMembershipSources(
  query: QueryExecutor,
  userId: string,
  batchSize = getDataRetentionLimits().batchSize,
): Promise<number> {
  const { rowCount } =
    await query(sql`/* cleanupSoftDeletedUserBatch: detach provider membership sources */
    WITH candidates AS (SELECT id FROM membership_sources
      WHERE user_id = ${userId} AND membership_provider_lineage_id IS NOT NULL
      ORDER BY id LIMIT ${batchSize})
    UPDATE membership_sources
    SET user_id = NULL
    WHERE id IN (SELECT id FROM candidates) AND user_id = ${userId}`)
  return rowCount ?? 0
}
