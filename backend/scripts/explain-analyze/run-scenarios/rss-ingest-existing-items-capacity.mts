import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { getExistingRssFeedItems } from '@services/rss-feed-items/upsert-existing'
import { getRssFeedItemsWorkLimit } from '@services/rss-feed-items/work-limits'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  cleanupRssWriteCapacity,
  rssWriteItemCapacity,
  seedRssWriteCapacity,
} from './rss-write-capacity-fixture.mts'

export async function runRssIngestExistingItemsCapacity(): Promise<void> {
  const scenario = 'rss-ingest-existing-items-at-cap'
  const fixture = await seedRssWriteCapacity()
  try {
    const {
      rows: [eligibleFeed],
    } = await write<{ id: string }>(sql`/* readExplainRssIngestEligibleFeed */
      SELECT id FROM rss_feeds WHERE id = ${seedUuid(2200, '08')}
        AND is_enabled AND is_discoverable AND deleted_at IS NULL`)
    assert.ok(eligibleFeed)
    const { rows: identities } = await write<{ id: string; guid: string }>(
      sql`/* readExplainRssIngestExistingGuids */
        SELECT id, guid FROM rss_feed_item_guids
        WHERE url_hostname_id = ${fixture.hostnameId} AND id = ANY(${fixture.itemIds}::uuid[])
        ORDER BY id`,
    )
    assert.equal(identities.length, rssWriteItemCapacity)
    const deleted = identities.at(-2)!
    const expected = identities.slice(0, -2).map((row, index) => ({
      ...row,
      is_linked_to_current_feed: index % 2 === 0,
      has_eligible_source: index % 3 === 0,
    }))
    await write(sql`/* seedExplainRssIngestExistingSources */
      INSERT INTO rss_feed_item_sources (rss_feed_id, rss_feed_item_id)
      SELECT ${fixture.feedId}::uuid, item.id
      FROM unnest(${expected.filter(row => row.is_linked_to_current_feed).map(row => row.id)}::uuid[]) AS item(id)
      UNION ALL
      SELECT ${eligibleFeed.id}::uuid, item.id
      FROM unnest(${expected.filter(row => row.has_eligible_source).map(row => row.id)}::uuid[]) AS item(id)`)
    await write(sql`/* seedExplainRssIngestDeletedItem */
      UPDATE rss_feed_items SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${deleted.id}`)
    await write(
      '/* analyzeExplainRssIngestExisting */ ANALYZE rss_feed_item_guids, rss_feed_items, rss_feed_item_sources',
    )
    const guids = [...identities.slice(0, -1).map(row => row.guid), `${fixture.prefix}-missing`]
    const {
      rows: [corpus],
    } = await write<{
      feeds: number
      guids: number
      items: number
      sources: number
    }>(sql`/* countExplainRssIngestExistingCorpus */
      SELECT (SELECT count(*)::int FROM rss_feeds) AS feeds,
        (SELECT count(*)::int FROM rss_feed_item_guids) AS guids,
        (SELECT count(*)::int FROM rss_feed_items) AS items,
        (SELECT count(*)::int FROM rss_feed_item_sources) AS sources`)
    assert.ok(corpus)
    const chunkSize = Math.min(guids.length, getRssFeedItemsWorkLimit('sql_batch_size'))
    registerScenarioContract(scenario, {
      crossPartition: {
        rss_feed_items: 'A crawl can contain items from multiple UUID partitions.',
      },
      seededRows: {
        rss_feeds: corpus.feeds,
        rss_feed_item_guids: corpus.guids,
        rss_feed_items: corpus.items,
        rss_feed_item_sources: corpus.sources,
      },
      expectations: [
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_guids', max: chunkSize },
        { kind: 'maxProcessedRows', relation: 'rss_feed_items', max: chunkSize },
        { kind: 'maxProcessedRows', relation: 'rss_feed_item_sources', max: chunkSize * 2 },
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: chunkSize },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const rows = await getExistingRssFeedItems(fixture.feedId, fixture.hostnameId, guids)
        const actual = rows
          .map(({ id, guid, is_linked_to_current_feed, has_eligible_source }) => ({
            id,
            guid,
            is_linked_to_current_feed,
            has_eligible_source,
          }))
          .toSorted((first, second) => first.id.localeCompare(second.id))
        assert.deepEqual(actual, expected)
      },
      undefined,
      'upsertRssFeedItems',
    )
  } finally {
    await cleanupRssWriteCapacity(fixture)
  }
}
