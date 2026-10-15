import type { TransactionQuery } from '@data-stores/psql'
import { getEntityCacheWorkLimit } from '@services/entity-cache/work-limits'

export const ADDED_DOMAINS_TABLE = 'tmp_domain_blacklist_added_domains'
export const REMOVED_DOMAINS_TABLE = 'tmp_domain_blacklist_removed_domains'

/** Persist both added and removed hostname identities while the staged diff still exists. */
export async function enqueueChangedHostnameCaches(query: TransactionQuery): Promise<string[]> {
  const { rows } = await query<{ url_hostname_id: string }>(
    `/* enqueueChangedHostnameCaches */
    WITH persisted AS (
      INSERT INTO url_hostname_cache_invalidation_work_items (url_hostname_id)
      SELECT DISTINCT hostname.id
      FROM (
        SELECT domain FROM ${ADDED_DOMAINS_TABLE}
        UNION
        SELECT domain FROM ${REMOVED_DOMAINS_TABLE}
      ) changed
      JOIN url_hostnames hostname ON hostname.hostname = changed.domain
      ORDER BY hostname.id ASC NULLS LAST
      ON CONFLICT (url_hostname_id) DO UPDATE SET
        generation = url_hostname_cache_invalidation_work_items.generation + 1,
        enqueued_at = CURRENT_TIMESTAMP,
        available_at = CURRENT_TIMESTAMP,
        attempt_count = 0,
        lease_token = NULL,
        leased_at = NULL,
        lease_expires_at = NULL
      RETURNING url_hostname_id
    )
    SELECT url_hostname_id FROM persisted ORDER BY url_hostname_id LIMIT $1::int`,
    [getEntityCacheWorkLimit('delete_keys_per_batch')],
  )
  return rows.map(row => row.url_hostname_id)
}
