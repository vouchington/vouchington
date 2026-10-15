import type { TransactionQuery } from '@data-stores/psql'

/** Persist policy-cache invalidation in the same transaction as the policy change. */
export async function enqueueHostnameCacheInvalidation(
  query: TransactionQuery,
  hostnameIds: readonly string[],
): Promise<void> {
  if (hostnameIds.length === 0) return
  await query(
    `/* enqueueHostnameCacheInvalidation */
    INSERT INTO url_hostname_cache_invalidation_work_items (url_hostname_id)
    SELECT DISTINCT id FROM unnest($1::uuid[]) AS changed(id)
    ON CONFLICT (url_hostname_id) DO UPDATE SET
      generation = url_hostname_cache_invalidation_work_items.generation + 1,
      enqueued_at = CURRENT_TIMESTAMP,
      available_at = CURRENT_TIMESTAMP,
      attempt_count = 0,
      lease_token = NULL,
      leased_at = NULL,
      lease_expires_at = NULL`,
    [hostnameIds],
  )
}
