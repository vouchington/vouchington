import assert from 'node:assert/strict'
import { paginationMaxima } from '@services/pagination/config'
import { getUrlEmbedsByUrlIds } from '@services/rss-feed-items/get-url-embeds'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { FEED_URL_COUNT, seedUuid } from '../seed-data/common.mts'

const scenario = 'url-embeds-at-post-page-cap'
const queryName = 'getUrlEmbedsByUrlIds'
const rssCount = 60
const crawlCount = 20

export async function runUrlEmbedCapacityScenario(): Promise<void> {
  // The post and feed handlers deduplicate at most one URL per returned post. The seeded
  // corpus has 25,000 item rows distributed across 600 URL IDs and crawls on feed URLs.
  const rssIds = Array.from({ length: rssCount }, (_, index) =>
    seedUuid(FEED_URL_COUNT + index, '03'),
  )
  const crawlIds = Array.from({ length: crawlCount }, (_, index) => seedUuid(60 + index, '03'))
  const plainIds = Array.from(
    { length: paginationMaxima.max_limit - rssCount - crawlCount },
    (_, index) => seedUuid(2000 + index, '03'),
  )
  const ids = [...rssIds, ...crawlIds, ...plainIds]
  registerScenarioContract(scenario, {
    crossPartition: {
      rss_feed_items: 'A URL may reference item rows in any arrival-time partition.',
      crawls: 'The latest eligible crawl for an origin URL may be in any arrival-time partition.',
    },
    expectations: [
      // Paired captures scan RSS items, source associations, feeds and topics.
      // https://github.com/vouchington/vouchington/issues/6398
      { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: 36_689 },
      { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: 75_433 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2_578 },
      { kind: 'maxProcessedRows', relation: 'topics', max: 15_070 },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      const embeds = await getUrlEmbedsByUrlIds(ids, {}, 'administrator')
      assert.deepEqual(Object.keys(embeds).toSorted(), ids.toSorted())
      for (const id of rssIds) assert.ok(embeds[id]?.rss_feed_item_id)
      for (const id of crawlIds) assert.ok(embeds[id]?.markdown)
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
