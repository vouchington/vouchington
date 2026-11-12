import assert from 'node:assert/strict'
import { beginTransaction, read } from '@data-stores/psql'
import { getTopUrlsByHostnameIds, TOP_URLS_PER_HOSTNAME } from '@services/urls-hostnames/top-urls'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  cleanupTopUrlRanking,
  seedTopUrlRanking,
  TOP_URL_BATCH,
  TOP_URL_EMPTY_HOST,
  TOP_URL_HOT,
  TOP_URL_HOST_COUNT,
  TOP_URL_MOVE_TARGET,
  TOP_URL_PARTITION_COUNT,
  topUrlHostId,
  topUrlOldItemId,
} from '../seed-data/top-url-ranking.mts'
import { seedUuidAtTimestamp } from '../seed-data/common.mts'
import { captureTopUrlTriggerWrites } from './top-url-ranking-trigger-writes.mts'
import { captureTopUrlInsertBatch } from './top-url-ranking-insert-batch.mts'

export async function runTopUrlRankingScenarios(): Promise<void> {
  await seedTopUrlRanking()
  try {
    await captureTopUrlReads()
    await captureTopUrlWrites()
    await captureTopUrlTriggerWrites()
    await captureTopUrlInsertBatch()
  } finally {
    await cleanupTopUrlRanking()
  }
}

async function captureTopUrlReads(): Promise<void> {
  const hostnameIds = Array.from({ length: TOP_URL_HOST_COUNT }, (_, index) => topUrlHostId(index))
  const itemIndexNames = (
    await read<{ index_name: string }>(
      `/* topUrlRanking.partitionIndexes */ SELECT child.relname AS index_name
     FROM pg_inherits inheritance
     JOIN pg_class child ON child.oid = inheritance.inhrelid
     JOIN pg_class parent ON parent.oid = inheritance.inhparent
     JOIN pg_index mapping ON mapping.indexrelid = child.oid
     JOIN pg_class item_partition ON item_partition.oid = mapping.indrelid
     WHERE parent.relname = $1 AND item_partition.relname = ANY($2::text[])
     ORDER BY item_partition.relname`,
      [
        'idx_rss_feed_items__url_id__published_at',
        ['rss_feed_items_default', 'rss_feed_items__p_2001_01', 'rss_feed_items__p_2002_01'],
      ],
    )
  ).rows.map(row => row.index_name)
  assert.equal(itemIndexNames.length, TOP_URL_PARTITION_COUNT)
  registerScenarioContract('top-urls-by-hostname-ids', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_urls__hostname_feed_rank_latest_published_id'] },
      {
        kind: 'maxProcessedRows',
        relation: 'urls',
        max: hostnameIds.length * TOP_URLS_PER_HOSTNAME,
      },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 0 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 0 },
    ],
  })
  await runAndCapture('top-urls-by-hostname-ids', async () => {
    const result = await getTopUrlsByHostnameIds(hostnameIds)
    assert.equal(Object.keys(result).length, hostnameIds.length)
    assert.equal(
      Object.values(result).reduce((sum, rows) => sum + rows.length, 0),
      hostnameIds.length * TOP_URLS_PER_HOSTNAME,
    )
  })
  registerScenarioContract('top-urls-empty-hostname', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_urls__hostname_feed_rank_latest_published_id'] },
      { kind: 'maxProcessedRows', relation: 'urls', max: 0 },
    ],
  })
  await runAndCapture('top-urls-empty-hostname', async () => {
    assert.deepEqual(await getTopUrlsByHostnameIds([TOP_URL_EMPTY_HOST]), {})
  })
  registerScenarioContract('top-url-latest-heavy', {
    crossPartition: {
      rss_feed_items:
        'One ordered URL maximum probe spans the default and two fixture-owned historical item partitions.',
    },
    expectations: [
      { kind: 'usesIndexes', indexes: itemIndexNames },
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: TOP_URL_PARTITION_COUNT },
    ],
  })
  await runAndCapture('top-url-latest-heavy', async () => {
    const result = await read<{ published_at: Date }>(
      `/* topUrlRanking.latest */ SELECT published_at
       FROM fn_url_latest_rss_feed_item_published_at($1)`,
      [TOP_URL_HOT],
    )
    assert.equal(result.rows.length, 1)
    assert.ok(result.rows[0]?.published_at)
  })
  registerScenarioContract('top-url-latest-empty', {
    allowEmptyResult: true,
    crossPartition: {
      rss_feed_items:
        'The missing URL probe checks all three item partitions through their URL indexes.',
    },
    expectations: [{ kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 0 }],
  })
  await runAndCapture('top-url-latest-empty', async () => {
    const result = await read(
      `/* topUrlRanking.empty */ SELECT published_at
      FROM fn_url_latest_rss_feed_item_published_at($1)`,
      [seedUuidAtTimestamp(Date.UTC(2003, 0, 1), 0)],
    )
    assert.equal(result.rows.length, 0)
  })
}

async function captureTopUrlWrites(): Promise<void> {
  const first = topUrlOldItemId(2002, 0)
  const end = seedUuidAtTimestamp(Date.UTC(2002, 1, 1), 0)
  const itemIds = Array.from({ length: TOP_URL_BATCH }, (_, index) => topUrlOldItemId(2002, index))
  registerScenarioContract('top-url-move-batch', {
    expectations: [
      // ModifyTable RETURNING and its source scan each report the same bounded batch.
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: TOP_URL_BATCH * 2 },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_update_url_latest_published_at',
        max: 1,
      },
    ],
  })
  await runAndCapture(
    'top-url-move-batch',
    async () => {
      await using query = await beginTransaction()
      const result = await query<{ id: string }>(
        `/* topUrlRanking.move */ UPDATE rss_feed_items SET url_id = $4
       WHERE id >= $1 AND id < $2 AND id = ANY($3::uuid[])
         AND url_id = $5 RETURNING id`,
        [first, end, itemIds, TOP_URL_MOVE_TARGET, TOP_URL_HOT],
      )
      assert.equal(result.rows.length, TOP_URL_BATCH)
      // Disposal rolls the captured write back before either EXPLAIN pass.
    },
    undefined,
    'topUrlRanking.move',
  )
  registerScenarioContract('top-url-delete-batch', {
    expectations: [
      // ModifyTable RETURNING and its source scan each report the same bounded batch.
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: TOP_URL_BATCH * 2 },
      {
        kind: 'maxFunctionCalls',
        function: 'fn_update_url_latest_published_at',
        max: 1,
      },
    ],
  })
  await runAndCapture(
    'top-url-delete-batch',
    async () => {
      await using query = await beginTransaction()
      const result = await query<{ id: string }>(
        `/* topUrlRanking.delete */ DELETE FROM rss_feed_items
       WHERE id >= $1 AND id < $2 AND id = ANY($3::uuid[])
         AND url_id = $4 RETURNING id`,
        [first, end, itemIds, TOP_URL_HOT],
      )
      assert.equal(result.rows.length, TOP_URL_BATCH)
    },
    undefined,
    'topUrlRanking.delete',
  )
}
