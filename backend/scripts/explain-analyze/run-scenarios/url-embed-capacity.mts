import assert from 'node:assert/strict'
import { read, write } from '@data-stores/psql'
import { paginationMaxima } from '@services/pagination/config'
import { getUrlEmbedsByUrlIds } from '@services/rss-feed-items/get-url-embeds'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { CATEGORY_PROJECTION_NOISE_ROWS } from '../seed-data/category-projection.mts'
import { crawlSeedUuid, FEED_URL_COUNT, ITEM_URL_POOL, seedUuid } from '../seed-data/common.mts'
import { seedCrawlMarkdown } from '../seed-data/crawls.mts'
import { RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT } from '../seed-data/rss-feed-weekly-workload.mts'

const scenario = 'url-embeds-at-post-page-cap'
const queryName = 'getUrlEmbedsByUrlIds'
const rssCount = 60
const crawlCount = 20
const firstCrawlIndex = 60

export async function runUrlEmbedCapacityScenario(): Promise<void> {
  // The post and feed handlers deduplicate at most one URL per returned post. The seeded
  // corpus has 25,000 item rows distributed across 600 URL IDs and crawls on feed URLs.
  const rssIds = Array.from({ length: rssCount }, (_, index) =>
    seedUuid(FEED_URL_COUNT + index, '03'),
  )
  const crawlFixtures = Array.from({ length: crawlCount }, (_, index) => {
    const seedIndex = firstCrawlIndex + index
    return {
      urlId: seedUuid(seedIndex, '03'),
      markdown: seedCrawlMarkdown(crawlSeedUuid(seedIndex, '12'), seedIndex),
    }
  })
  const plainIds = Array.from(
    { length: paginationMaxima.max_limit - rssCount - crawlCount },
    (_, index) => seedUuid(2000 + index, '03'),
  )
  const ids = [...rssIds, ...crawlFixtures.map(fixture => fixture.urlId), ...plainIds]
  // Category projection seeds a newer history on the first item URL before this scenario.
  // The remaining URLs use the last UUIDv7 assigned by the weekly workload seed.
  const lastCycle =
    ITEM_URL_POOL * Math.floor((RSS_FEED_WEEKLY_WORKLOAD_ITEM_COUNT - 1) / ITEM_URL_POOL)
  const expectedGuids = rssIds.map((_, index) =>
    index === 0
      ? `seed-category-projection-history-${CATEGORY_PROJECTION_NOISE_ROWS}`
      : `seed-week-dense-item-${lastCycle + index}`,
  )
  const { rows } = await read<{ guid: string; id: string }>(
    '/* lookupEmbedCapacitySeedIds */ SELECT guid, id FROM rss_feed_item_guids WHERE guid = ANY($1::text[])',
    [expectedGuids],
  )
  const itemIdsByGuid = new Map(rows.map(row => [row.guid, row.id]))
  assert.equal(itemIdsByGuid.size, rssCount)
  registerScenarioContract(scenario, {
    crossPartition: {
      rss_feed_items: 'A URL may reference item rows in any arrival-time partition.',
      crawls: 'The latest eligible crawl for an origin URL may be in any arrival-time partition.',
    },
    expectations: [
      // Each requested URL selects one current item, then one eligible show per selected item.
      // Keyed probes keep work proportional to the 60 RSS-backed URLs, not corpus size.
      // https://github.com/vouchington/vouchington/issues/6398
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: rssCount },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: rssCount },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: rssCount },
      { kind: 'maxProcessedRows', relation: 'topics', max: rssCount },
    ],
  })
  // Earlier seed updates leave rss_feeds between 155 and 198 pages depending on when autovacuum
  // ran, which flips the generic plan between a hash join over a sequential scan and index probes.
  // Rewriting the heap makes its sequential-scan cost the same on every run.
  await write('/* compactUrlEmbedFeeds */ VACUUM (FULL, ANALYZE) rss_feeds')
  await runAndCapture(
    scenario,
    async () => {
      const embeds = await getUrlEmbedsByUrlIds(ids, {}, 'administrator')
      assert.deepEqual(Object.keys(embeds).toSorted(), ids.toSorted())
      assert.deepEqual(
        rssIds.map(id => embeds[id]?.rss_feed_item_id),
        expectedGuids.map(guid => itemIdsByGuid.get(guid)),
      )
      // The response exposes crawl content. Its seed markdown carries the exact crawl ID.
      for (const { urlId, markdown } of crawlFixtures)
        assert.equal(embeds[urlId]?.markdown, markdown)
      for (const id of plainIds) {
        const embed = embeds[id]!
        assert.equal(embed.rss_feed_item_id, null)
        assert.equal(embed.markdown, null)
      }
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName] },
  )
}
