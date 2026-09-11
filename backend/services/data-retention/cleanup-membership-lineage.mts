import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function releaseMembershipLineageBindings(
  query: QueryExecutor,
  userId: string,
): Promise<void> {
  await query(sql`/* cleanupSoftDeletedUserBatch: release membership lineage bindings */
    UPDATE membership_lineage_bindings
    SET released_at = CURRENT_TIMESTAMP,
        release_reason = 'account_hard_deleted'
    WHERE user_id = ${userId}
      AND released_at IS NULL`)
}

export async function detachProviderMembershipSources(
  query: QueryExecutor,
  userId: string,
): Promise<void> {
  await query(sql`/* cleanupSoftDeletedUserBatch: detach provider membership sources */
    UPDATE membership_sources
    SET user_id = NULL
    WHERE user_id = ${userId}
      AND membership_provider_lineage_id IS NOT NULL`)
}
