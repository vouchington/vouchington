import { beginTransaction, read, write, type QueryExecutor } from '@data-stores/psql'
import type { ExpiredMonthlyPartition } from '@vouchington/postgres/partitions'
import sql from 'sql-template-strings'
import { randomUUID } from 'node:crypto'
import { createTestUserDirect } from './entities/users.mts'
import { createTestUrlWithHostname } from './entities/urls.mts'
import { insertOldInvalidCrawlForTest } from './entities/crawls.mts'
import { createPendingRssFeedImportDiscoveryForTest } from './rss-feed-import-rows.mts'

/** Runs the real retirement hook against an owned crawl reference without touching other rows. */
export async function withTestScopedCrawlRetirementReference(
  run: (query: QueryExecutor, partition: ExpiredMonthlyPartition) => Promise<void>,
): Promise<{ discoveryRetained: boolean; pointerCleared: boolean; crawlRemovable: boolean }> {
  const user = await createTestUserDirect()
  if (!user) throw new Error('Expected import owner')
  const urlId = await createTestUrlWithHostname()
  const crawlId = await insertOldInvalidCrawlForTest(urlId)
  const { rowId } = await createPendingRssFeedImportDiscoveryForTest(
    user.id,
    `https://example.com/${randomUUID()}`,
    urlId,
  )
  await write(sql`/* attachTestImportDiscoveryCrawl */
    UPDATE user_rss_feed_import_row_discoveries
    SET crawl_id = ${crawlId}::uuid
    WHERE import_row_id = ${rowId}::uuid AND discovery_url_id = ${urlId}::uuid`)
  const { rows: partitionRows } = await read<{ partition_name: string }>(sql`
    /* readTestCrawlPartitionName */
    SELECT tableoid::regclass::text AS partition_name FROM crawls
    WHERE id = ${crawlId}::uuid`)
  const partitionName = partitionRows[0]?.partition_name
  if (!partitionName) throw new Error('Owned crawl partition is missing')
  const partition: ExpiredMonthlyPartition = {
    table: 'crawls',
    partitionName,
    year: 2020,
    month: 1,
    dropPriority: 0,
  }
  await using transaction = await beginTransaction()
  const scopedQuery: QueryExecutor = (statement, _values) => {
    if (typeof statement !== 'string') throw new TypeError('Retirement hook must use string SQL')
    const target = `SELECT id FROM ${partitionName}`
    if (!statement.includes(target)) throw new Error('Retirement hook lost partition scoping')
    return transaction(statement.replace(target, `${target} WHERE id = $1::uuid`), [crawlId])
  }
  await run(scopedQuery, partition)
  const { rows: discoveries } = await transaction<{ crawl_id: string | null }>(sql`
    /* readTestRetiredCrawlDiscovery */
    SELECT crawl_id FROM user_rss_feed_import_row_discoveries
    WHERE import_row_id = ${rowId}::uuid AND discovery_url_id = ${urlId}::uuid`)
  const { rowCount } = await transaction(sql`/* deleteTestRetiredCrawl */
    DELETE FROM crawls WHERE id = ${crawlId}::uuid`)
  return {
    discoveryRetained: discoveries.length === 1,
    pointerCleared: discoveries[0]?.crawl_id === null,
    crawlRemovable: rowCount === 1,
  }
}
