import { read } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { caches } from '@services/entity-cache/caches'
import { getEntityCacheWorkLimit } from '@services/entity-cache/work-limits'

/** Invalidate policy cached by hostname after a source changes URL/email classification. */
export async function invalidateSourceHostnameCaches(
  sourceIds: Array<string | number>,
): Promise<void> {
  const batchSize = getEntityCacheWorkLimit('delete_keys_per_batch')
  for (const sourceId of sourceIds) {
    let after = ''
    for (;;) {
      // The type-change transaction writes domain_blocklist_sources only, so replica lag cannot hide membership rows that transaction added.
      // oxlint-disable-next-line no-await-in-loop -- the source-leading index bounds each keyset read.
      const { rows } = await read<{ domain: string }>( // no-mistakes-disable-line query-reached-per-item: one bounded keyset page, evicted before the cursor advances
        `/* invalidateSourceHostnameCaches */
        SELECT domain FROM blocklisted_domains
        WHERE source_id = $1::bigint AND domain COLLATE "C" > $2::text COLLATE "C"
        ORDER BY domain COLLATE "C" LIMIT $3::int`,
        [sourceId, after, batchSize],
      )
      if (rows.length === 0) break
      const domains = rows.map(row => row.domain)
      // oxlint-disable-next-line no-await-in-loop -- evict each committed batch before advancing.
      await Promise.all([
        invalidate.url_hostnames(...domains),
        caches.email_domain_validation.invalidateCacheGetByAny(...domains),
      ])
      after = rows.at(-1)!.domain
    }
  }
}
