import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { upsertRssFeedItemIdentities } from '@services/rss-feed-items/upsert-identities'
import { upsertRssFeedItemSources } from '@services/rss-feed-items/upsert-queries'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { contentHash } from '../seed-data/common.mts'
import { runRssItemCategoryWriteScenarios } from './rss-write-capacity-item-categories.mts'
import { runRssItemCategoryClearScenario } from './rss-item-category-clear.mts'
import { runRecentlyViewedRssItemTypeScenario } from './recently-viewed-rss-types.mts'
import { runRssStoryProjectionRefreshScenario } from './rss-story-projection-refresh.mts'
import { runRssCategorySnapshotWriteScenario } from './rss-category-snapshot-write.mts'
import { runRssCategorySnapshotSourcePages } from './rss-category-snapshot-source-pages.mts'
import { runRssListabilityScenario } from './rss-listability.mts'
import { runRssFeedCategoryWriteScenario } from './rss-write-capacity-feed-categories.mts'
import {
  cleanupRssWriteCapacity,
  seedRssWriteCapacity,
  type RssWriteCapacityFixture,
} from './rss-write-capacity-fixture.mts'

export async function runRssWriteCapacityScenarios(): Promise<void> {
  const fixture = await seedRssWriteCapacity()
  try {
    await runIdentityWrite(fixture)
    await runSourceWrite(fixture)
    await runRssStoryProjectionRefreshScenario(fixture)
    await runRssCategorySnapshotWriteScenario(fixture)
    await runRssItemCategoryWriteScenarios(fixture)
    await runRssItemCategoryClearScenario(fixture)
    await runRssFeedCategoryWriteScenario(fixture)
    await runRssListabilityScenario(fixture)
  } finally {
    await cleanupRssWriteCapacity(fixture)
  }
}

export async function runRssItemFilterAndSourcePageScenarios(): Promise<void> {
  const fixture = await seedRssWriteCapacity()
  try {
    await runRecentlyViewedRssItemTypeScenario(fixture)
    await runRssCategorySnapshotSourcePages(fixture)
  } finally {
    await cleanupRssWriteCapacity(fixture)
  }
}

async function runIdentityWrite(fixture: RssWriteCapacityFixture) {
  const scenario = 'rss-ingest-identities-at-cap'
  const marker = 'upsertRssFeedItems:identities'
  const items = fixture.itemIds.map((_, index) => {
    const guid = `${fixture.prefix}-guid-${index}`
    return {
      feedItem: { guid, link: `https://seed-host-0.example.com/${guid}`, title: guid },
      content_sha256: contentHash(guid),
      url_id: fixture.urlId,
    }
  })
  const half = items.length / 2
  let existing: Awaited<ReturnType<typeof upsertRssFeedItemIdentities>>
  {
    await using query = await beginTransaction()
    existing = await upsertRssFeedItemIdentities(query, fixture.hostnameId, items.slice(0, half))
    await query.commit()
  }
  assert.equal(existing.length, half)

  registerScenarioContract(scenario, {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxInputRows', nodeType: 'Sort', max: items.length },
      { kind: 'maxInputRows', nodeType: 'Function Scan', max: items.length },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const rows = await upsertRssFeedItemIdentities(query, fixture.hostnameId, items)
      assert.deepEqual(
        rows.map(row => row.guid),
        items.map(item => item.feedItem.guid).toSorted(),
      )
      const lookup = new Map(rows.map(row => [row.guid, row.id]))
      assert.ok(existing.every(row => lookup.get(row.guid) === row.id))
      assert.equal(new Set(rows.map(row => row.id)).size, items.length)
      await query.rollback()
    },
    undefined,
    marker,
    { exactCapturedNames: [marker, 'upsertRssFeedItems:identitiesLookup'] },
  )
}

async function runSourceWrite(fixture: RssWriteCapacityFixture) {
  const scenario = 'rss-ingest-source-associations-at-cap'
  const marker = 'buildRssFeedItemSourcesQuery'
  const half = fixture.itemIds.length / 2
  const sourceIds = fixture.itemIds.slice(0, half)
  const retainedPublishedAt = '2020-01-01T00:00:00.000Z'
  const suppliedPublishedAt = '2021-01-01T00:00:00.000Z'
  await write(
    `/* seedRssWriteCapacitySources */
     INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id, published_at)
     SELECT $1::uuid, item_id, $3::timestamptz FROM unnest($2::uuid[]) AS input(item_id)`,
    [fixture.feedId, sourceIds, retainedPublishedAt],
  )
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'maxInputRows', nodeType: 'Sort', max: fixture.itemIds.length },
      { kind: 'maxInputRows', nodeType: 'Function Scan', max: fixture.itemIds.length },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      await using query = await beginTransaction()
      const inserted = await upsertRssFeedItemSources(
        query,
        fixture.feedId,
        fixture.itemIds.map(id => ({ id, isoDate: suppliedPublishedAt })),
      )
      assert.deepEqual(
        inserted.map(row => row.rss_feed_item_id).toSorted(),
        fixture.itemIds.slice(half),
      )
      const { rows } = await query<{ rss_feed_item_id: string; published_at: Date }>(
        `/* checkRssWriteCapacitySources */
         SELECT rss_feed_item_id, published_at FROM rss_feed_item_sources
         WHERE rss_feed_id = $1 ORDER BY rss_feed_item_id`,
        [fixture.feedId],
      )
      assert.deepEqual(
        rows.map(row => [row.rss_feed_item_id, row.published_at.toISOString()]),
        fixture.itemIds.map((id, index) => [
          id,
          index < half ? retainedPublishedAt : suppliedPublishedAt,
        ]),
      )
      await query.rollback()
    },
    undefined,
    marker,
    { exactCapturedNames: [marker, 'checkRssWriteCapacitySources'] },
  )
}
