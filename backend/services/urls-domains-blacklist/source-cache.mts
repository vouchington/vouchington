import { write } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'
import { getEntityCacheWorkLimit } from '@services/entity-cache/work-limits'

/** Invalidate policy cached by hostname after a source changes URL/email classification. */
export async function invalidateSourceHostnameCaches(
  sourceIds: Array<string | number>,
): Promise<void> {
  const batchSize = getEntityCacheWorkLimit('delete_keys_per_batch')
  for (const sourceId of sourceIds) {
    let after = ''
    for (;;) {
      // oxlint-disable-next-line no-await-in-loop -- the source-leading index bounds each keyset read.
      const { rows } = await write<{ domain: string }>(
        `/* invalidateSourceHostnameCaches */
        SELECT domain FROM blocklisted_domains
        WHERE source_id = $1::bigint AND domain > $2::text
        ORDER BY domain LIMIT $3::int`,
        [sourceId, after, batchSize],
      )
      if (rows.length === 0) break
      // oxlint-disable-next-line no-await-in-loop -- evict each committed batch before advancing.
      await invalidate.url_hostnames(...rows.map(row => row.domain))
      after = rows.at(-1)!.domain
    }
  }
}
