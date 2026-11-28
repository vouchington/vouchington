import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { write } from '@data-stores/psql'
import { getUserRssFeedsCollection } from '@services/entity-fetch/get-rss-feeds-collection'
import { RECENTLY_VIEWED_ZSET_LIMIT } from '@services/recently-viewed'
import { filterRssFeedIdsByFeedType } from '@services/rss-feeds/get-batch'
import sql from 'sql-template-strings'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runRssFeedCollectionHydrationCapacity(): Promise<void> {
  const corpus = await write<{ count: number }>(sql`/* countExplainRssFeedCollectionCorpus */
    SELECT count(*)::int AS count FROM rss_feeds`)
  assert.ok(corpus.rows[0])
  await captureFollowingFeedHydration(corpus.rows[0].count)
  await captureRecentFeedTypeFilter(corpus.rows[0].count)
}

async function captureFollowingFeedHydration(feedCount: number): Promise<void> {
  const scenario = 'rss-followed-feed-hydration-at-cap'
  const limit = 25 // User RSS feed collection cap in api/v1/users/collection-route-config.mts.
  const ids = Array.from({ length: limit + 1 }, (_, index) => seedUuid(900 + index, '08'))
    .toSorted()
    .toReversed()
  const {
    rows: [user],
  } = await write<{ id: string }>(sql`/* seedExplainFollowedRssHydrationOwner */
    INSERT INTO users (username) VALUES (${`explain-feed-hydration-${randomUUID()}`}) RETURNING id`)
  assert.ok(user)
  try {
    await write(sql`/* seedExplainFollowedRssHydration */
      INSERT INTO relation__user__follow__rss_feed (subject_id, object_id)
      SELECT ${user.id}, id FROM unnest(${ids}::uuid[]) AS feed(id)`)
    registerScenarioContract(scenario, {
      seededRows: { rss_feeds: feedCount },
      expectations: [
        // Main does two feed-catalog walks. https://github.com/vouchington/vouchington/issues/6602
        { kind: 'maxProcessedRows', relation: 'rss_feeds', max: 2 * feedCount },
      ],
    })
    await runAndCapture(
      scenario,
      async () => {
        const first = await getUserRssFeedsCollection(user.id, 'following', { limit })
        assert.deepEqual(
          first.results.map(feed => feed.id),
          ids.slice(0, limit),
        )
        assert.equal(first.page_info.has_next_page, true)
        assert.ok(first.page_info.end_cursor)
        const last = await getUserRssFeedsCollection(user.id, 'following', {
          limit,
          after: first.page_info.end_cursor,
        })
        assert.deepEqual(
          last.results.map(feed => feed.id),
          ids.slice(limit),
        )
        assert.equal(last.page_info.has_next_page, false)
      },
      undefined,
      'getRssFeedsByIdBatch',
    )
  } finally {
    await write(
      sql`/* cleanupExplainFollowedRssHydrationOwner */ DELETE FROM users WHERE id = ${user.id}`,
    )
  }
}

async function captureRecentFeedTypeFilter(feedCount: number): Promise<void> {
  const scenario = 'rss-recent-feed-type-filter-at-cap'
  const articles = Array.from({ length: RECENTLY_VIEWED_ZSET_LIMIT - 102 }, (_, index) =>
    seedUuid(700 + index, '08'),
  )
  const missing = Array.from({ length: 100 }, (_, index) => seedUuid(10_000_000 + index, '08'))
  const podcastId = seedUuid(700 + articles.length, '08')
  const deletedId = seedUuid(700 + articles.length + 1, '08')
  const ids = [...articles, ...missing, podcastId, deletedId]
  assert.equal(new Set(ids).size, RECENTLY_VIEWED_ZSET_LIMIT)
  registerScenarioContract(scenario, {
    seededRows: { rss_feeds: feedCount },
    expectations: [
      { kind: 'noSeqScan', relation: 'rss_feeds' },
      { kind: 'usesIndexes', indexes: ['idx_rss_feeds__feed_type'], noSort: true },
      { kind: 'maxProcessedRows', relation: 'rss_feeds', max: articles.length },
    ],
  })
  const podcast = await write(sql`/* seedExplainRecentPodcastFeed */
    UPDATE rss_feeds SET feed_type = 'podcast'
    WHERE id = ${podcastId} AND feed_type = 'article' AND deleted_at IS NULL`)
  assert.equal(podcast.rowCount, 1)
  const deleted = await write(sql`/* seedExplainRecentDeletedArticleFeed */
    UPDATE rss_feeds SET deleted_at = CURRENT_TIMESTAMP
    WHERE id = ${deletedId} AND feed_type = 'article' AND deleted_at IS NULL`)
  assert.equal(deleted.rowCount, 1)
  try {
    await runAndCapture(
      scenario,
      async () => {
        const matching = await filterRssFeedIdsByFeedType(ids, 'article')
        assert.deepEqual(matching, new Set(articles))
      },
      undefined,
      'filterRssFeedIdsByFeedType',
    )
  } finally {
    await write(sql`/* restoreExplainRecentPodcastFeed */
      UPDATE rss_feeds SET feed_type = 'article' WHERE id = ${podcastId}`)
    await write(sql`/* restoreExplainRecentDeletedArticleFeed */
      UPDATE rss_feeds SET deleted_at = NULL WHERE id = ${deletedId}`)
  }
}
