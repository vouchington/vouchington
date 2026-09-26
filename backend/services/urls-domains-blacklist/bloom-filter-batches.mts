import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const URL_BLOCKLIST_BLOOM_BATCH_SIZE = 10_000

export async function* urlBlocklistBatchesFromDb(): AsyncGenerator<string[]> {
  let batch: string[] = []

  for await (const row of createAsyncGeneratorFromCursor<{ domain: string }>(
    sql`/* urlBlocklistBatchesFromDb */
      SELECT db.domain
      FROM domain_blacklists db
      INNER JOIN domain_blacklist_sources dbs ON dbs.id = db.source_id
      WHERE dbs.type = 'url'::domain_blacklist_types
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
    sql`/* urlBlocklistBatchesFromDb */ SELECT hostname FROM url_hostnames WHERE blocked = TRUE OR crawlable = FALSE`,
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
