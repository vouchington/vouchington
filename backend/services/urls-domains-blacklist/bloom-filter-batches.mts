import { getUrlsDomainsBlacklistWorkLimit } from './work-limits.mts'
import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function* urlBlocklistBatchesFromDb(): AsyncGenerator<string[]> {
  const URL_BLOCKLIST_BLOOM_BATCH_SIZE = getUrlsDomainsBlacklistWorkLimit('bloom_batch_size')
  let batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<{ domain: string }>(
    sql`/* urlBlocklistBatchesFromDb */
      SELECT db.domain
      FROM blocklisted_domains db
      INNER JOIN domain_blocklist_sources dbs ON dbs.id = db.source_id
      WHERE dbs.type = 'url'::domain_blocklist_types
    `,
    { batchSize: URL_BLOCKLIST_BLOOM_BATCH_SIZE },
  )) {
    batch.push(row.domain)
    if (batch.length >= URL_BLOCKLIST_BLOOM_BATCH_SIZE) {
      yield batch.splice(0, URL_BLOCKLIST_BLOOM_BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
    batch = []
  }

  for await (const row of createAsyncGeneratorFromCursor<{ hostname: string }>(
    sql`/* urlBlocklistBatchesFromDb:hostnames */
      SELECT DISTINCT (
        SELECT host.hostname FROM url_hostnames host WHERE host.id = block.url_hostname_id
      ) AS hostname
      FROM url_hostname_blocks block
      WHERE block.lifted_at IS NULL
        AND block.blocked_source NOT IN ('url_blocklist', 'email_blocklist')
      UNION ALL
      SELECT hostname FROM url_hostnames WHERE NOT is_crawlable AND NOT is_blocked
    `,
    { batchSize: URL_BLOCKLIST_BLOOM_BATCH_SIZE },
  )) {
    batch.push(row.hostname)
    if (batch.length >= URL_BLOCKLIST_BLOOM_BATCH_SIZE) {
      yield batch.splice(0, URL_BLOCKLIST_BLOOM_BATCH_SIZE)
    }
  }

  if (batch.length > 0) {
    yield batch
  }
}
