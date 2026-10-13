import type { PoolClient } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { getEntityCacheWorkLimit } from '@services/entity-cache/work-limits'

export const ADDED_DOMAINS_TABLE = 'tmp_domain_blacklist_added_domains'
export const REMOVED_DOMAINS_TABLE = 'tmp_domain_blacklist_removed_domains'

/** Consume committed feed changes by indexed keyset while their session temp tables still exist. */
export async function invalidateChangedHostnameCaches(client: PoolClient): Promise<void> {
  const batchSize = getEntityCacheWorkLimit('delete_keys_per_batch')
  let after = ''
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- the indexed keyset query reads one bounded batch at a time.
    const { rows } = await client.query<{ domain: string }>(
      `/* invalidateChangedHostnameCaches */
      SELECT domain FROM (
        SELECT domain FROM ${ADDED_DOMAINS_TABLE} WHERE domain > $1::text
        UNION ALL
        SELECT domain FROM ${REMOVED_DOMAINS_TABLE} WHERE domain > $1::text
      ) changed
      ORDER BY domain LIMIT $2::int`,
      [after, batchSize],
    )
    if (rows.length === 0) return
    // oxlint-disable-next-line no-await-in-loop -- invalidate committed batches before advancing the cursor.
    await invalidate.url_hostnames(...rows.map(row => row.domain))
    after = rows.at(-1)!.domain
  }
}
