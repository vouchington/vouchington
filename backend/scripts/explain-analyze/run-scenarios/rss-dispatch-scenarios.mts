import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import {
  FAILING_DISPATCH_LANE,
  getRssFeedsToFetch,
  type RssFeedDispatchCursor,
} from '@services/rss-feeds/get-to-fetch'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid } from '../seed-data/common.mts'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'
const SEED_UPPER_FEED_ID = seedUuid(2499, '08')
const ANCHOR_MS = postSeedTimestampMs(0)

export async function runRssDispatchScenarios(): Promise<void> {
  registerRssDispatchContracts()
  const { rows: tierRows } = await read<{ crawl_tier: number }>(
    `/* explainRssDispatchTier */ SELECT crawl_tier FROM mv_rss_feed_crawl_tiers
     WHERE crawl_tier < 5 ORDER BY crawl_tier, rss_feed_id LIMIT 1`,
  )
  const tier = tierRows[0]?.crawl_tier
  assert.ok(tier, 'representative RSS seed must contain a non-fallback tier')
  const anchorAsOf = new Date(ANCHOR_MS)
  await runAndCapture('rss-feeds-to-fetch-tiered', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: new Date(ANCHOR_MS + 2 * 24 * 60 * 60_000),
      cursor: { lane: tier, afterId: NIL_UUID, throughId: SEED_UPPER_FEED_ID },
    })
    assert.ok(page.rawRowsRead > 0 && page.feeds.length > 0)
  })
  await runAndCapture('rss-feeds-to-fetch-fallback-page', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: anchorAsOf,
      cursor: { lane: 5, afterId: NIL_UUID, throughId: SEED_UPPER_FEED_ID },
    })
    assert.equal(page.rawRowsRead, 26)
    assert.equal(page.feeds.length, 25)
    assert.equal(page.nextCursor?.lane, 5)
    assert.equal(page.nextCursor?.afterLastSucceededAt, null)
  })
  await runAndCapture('rss-feeds-to-fetch-fallback-tail', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: anchorAsOf,
      cursor: {
        lane: 5,
        afterLastSucceededAt: null,
        afterId: seedUuid(2000, '08'),
        throughId: SEED_UPPER_FEED_ID,
      },
    })
    assert.equal(page.rawRowsRead, 26)
    assert.equal(page.feeds.length, 25)
    assert.equal(page.nextCursor?.lane, 5)
  })
  await runAndCapture('rss-feeds-to-fetch-failing-page', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: anchorAsOf,
      cursor: { lane: FAILING_DISPATCH_LANE, afterId: NIL_UUID, throughId: SEED_UPPER_FEED_ID },
    })
    assert.equal(page.rawRowsRead, 26)
    assert.equal(page.feeds.length, 25)
    assert.equal(page.nextCursor?.lane, FAILING_DISPATCH_LANE)
    assert.equal(typeof page.nextCursor?.afterLastFailedAt, 'string')
  })
  await runAndCapture('rss-feeds-to-fetch-fallback-backfill', async () => {
    const page = await getRssFeedsToFetch({
      limit: 25,
      rawBudget: 26,
      asOf: new Date(ANCHOR_MS + 60 * 60_000),
      cursor: {
        lane: 10,
        afterLastSucceededAt: anchorAsOf.toISOString(),
        afterId: seedUuid(1000, '08'),
        throughId: SEED_UPPER_FEED_ID,
      },
    })
    assert.equal(page.rawRowsRead, 26)
    assert.ok(page.feeds.length > 0)
    assert.equal(page.nextCursor?.lane, 10)
    assert.equal(typeof page.nextCursor?.afterLastSucceededAt, 'string')
  })
  await runAndCapture('rss-feeds-to-fetch-full-dispatch', async () => {
    let cursor: RssFeedDispatchCursor | undefined = {
      lane: 1,
      afterId: NIL_UUID,
      throughId: SEED_UPPER_FEED_ID,
    }
    let remaining = 100
    let totalRawRead = 0
    let tier5RawRead = 0
    while (remaining > 0 && cursor) {
      const laneBefore = cursor.lane
      const limit = Math.min(100, remaining)
      const page = await getRssFeedsToFetch({
        limit,
        rawBudget: limit + 1,
        asOf: anchorAsOf,
        cursor,
      })
      totalRawRead += page.rawRowsRead
      if (laneBefore === 5 || laneBefore === 10) tier5RawRead += page.rawRowsRead
      remaining -= page.feeds.length
      cursor = page.nextCursor
    }
    assert.equal(remaining, 0)
    assert.ok(tier5RawRead <= 105, `Tier 5 raw rows read ${tier5RawRead} exceeded 105`)
    assert.ok(totalRawRead <= 120, `Full dispatch raw rows read ${totalRawRead} exceeded 120`)
  })
}

function makeIndexedLaneExpectations(index: string, queryContains: string) {
  return [
    { kind: 'maxProcessedRows' as const, relation: 'rss_feed_fetch_states', max: 32 },
    { kind: 'maxProcessedRows' as const, relation: 'rss_feeds', max: 32 },
    { kind: 'maxProcessedRows' as const, relation: 'mv_rss_feed_crawl_tiers', max: 32 },
    { kind: 'maxProcessedRows' as const, relation: 'urls', max: 32 },
    { kind: 'maxProcessedRows' as const, relation: 'url_hostnames', max: 32 },
    { kind: 'usesIndexes' as const, indexes: [index], noSort: true, queryContains },
    { kind: 'usesIndexes' as const, indexes: ['rss_feeds_pkey'], queryContains },
    { kind: 'usesIndexes' as const, indexes: ['urls_pkey'], queryContains },
    { kind: 'usesIndexes' as const, indexes: ['url_hostnames_pkey'], queryContains },
  ]
}

const HEALTHY_PAGE_EXPECTATIONS = makeIndexedLaneExpectations(
  'idx_rss_feed_fetch_states__healthy_fetch_due',
  'getRssFeedsHealthy',
)
const FAILING_PAGE_EXPECTATIONS = makeIndexedLaneExpectations(
  'idx_rss_feed_fetch_states__failing_fetch_due',
  'getRssFeedsFailing',
)

function registerRssDispatchContracts(): void {
  registerScenarioContract('rss-feeds-to-fetch-tiered', {
    expectations: HEALTHY_PAGE_EXPECTATIONS,
  })
  registerScenarioContract('rss-feeds-to-fetch-fallback-page', {
    expectations: HEALTHY_PAGE_EXPECTATIONS,
  })
  registerScenarioContract('rss-feeds-to-fetch-fallback-tail', {
    expectations: HEALTHY_PAGE_EXPECTATIONS,
  })
  registerScenarioContract('rss-feeds-to-fetch-failing-page', {
    expectations: FAILING_PAGE_EXPECTATIONS,
  })
  registerScenarioContract('rss-feeds-to-fetch-fallback-backfill', {
    expectations: HEALTHY_PAGE_EXPECTATIONS,
  })
  registerScenarioContract('rss-feeds-to-fetch-full-dispatch', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'rss_feed_fetch_states', max: 128 },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 128 },
      { kind: 'maxProcessedRows', relation: 'mv_rss_feed_crawl_tiers', max: 128 },
      { kind: 'maxProcessedRows', relation: 'urls', max: 128 },
      { kind: 'maxProcessedRows', relation: 'url_hostnames', max: 128 },
      {
        kind: 'usesIndexes',
        indexes: ['idx_rss_feed_fetch_states__healthy_fetch_due'],
        noSort: true,
        queryContains: 'getRssFeedsHealthy',
      },
    ],
  })
}
