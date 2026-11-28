import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssItemFeedHydrationCapacityScenario(): Promise<void> {
  const scenario = 'rss-item-feed-hydration-at-cap'
  // The signed-in RSS route hydrates 100 primary plus up to three preview items per story.
  const inputCount = 400
  const guids = Array.from(
    { length: inputCount - 1 },
    (_, index) => `seed-item-guid-${8_000 + index}`,
  )
  const { rows } = await read<{
    id: string
    guid: string
  }>(sql`/* readExplainRssFeedHydrationItems */
    SELECT id, guid FROM rss_feed_item_guids WHERE guid = ANY(${guids}::text[])`)
  assert.equal(rows.length, guids.length)
  const itemIds = new Map(rows.map(row => [row.guid, row.id]))
  const selected = guids.map(guid => itemIds.get(guid)!)
  assert.ok(selected.every(Boolean))
  const missingId = seedUuid(6_911_919, 'a1')
  const firstHalf = selected.slice(0, 200)
  const secondHalf = selected.slice(200)
  const ids = [...firstHalf, missingId, ...secondHalf]
  const {
    rows: [corpus],
  } = await read<{ feeds: number; items: number; sources: number; guids: number }>(sql`
    /* countExplainRssFeedHydrationCorpus */
    SELECT (SELECT count(*)::int FROM rss_feeds) AS feeds,
      (SELECT count(*)::int FROM rss_feed_items) AS items,
      (SELECT count(*)::int FROM rss_feed_item_sources) AS sources,
      (SELECT count(*)::int FROM rss_feed_item_guids) AS guids`)
  assert.ok(corpus)
  registerScenarioContract(scenario, {
    seededRows: {
      rss_feeds: corpus.feeds,
      rss_feed_items: corpus.items,
      rss_feed_item_guids: corpus.guids,
      rss_feed_item_sources: corpus.sources,
    },
    crossPartition: { rss_feed_items: 'Feed hydration IDs can be spread across item partitions.' },
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: inputCount },
      // Keyed to the batch in both plan modes (399 measured lookups for 399 existing IDs + ~20% headroom).
      {
        kind: 'maxProcessedRows',
        relation: 'rss_feed_item_guids',
        max: Math.ceil(inputCount * 1.2),
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const hydrated = await getRssFeedItemsByIdBatch(ids)
      assert.deepEqual(
        hydrated.map(item => item?.id ?? null),
        [...firstHalf, null, ...secondHalf],
      )
    },
    undefined,
    'getRssFeedItemsByIdBatch',
  )
}
