import { registerBookmarkBloomFixture } from '@voucha/test-helpers/bookmark-bloom-fixture'
import { it, expect, describe } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  backfillUserBookmarkBloomFilter,
  checkBookmarkBloomCandidates,
  checkBookmarkBloomCandidatesByRelations,
  deleteUserBookmarkBloomFilter,
} from '@services/bookmarks/bloom-filter'
import { insertTestTopic, insertTestRssFeed, insertTestRssFeedItem } from '@voucha/test-helpers'
import { addUrl } from '@services/urls'
import { createHash } from 'node:crypto'
import { cacheValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated (multi-relation)', () => {
  const fixture = registerBookmarkBloomFixture()

  it('delete removes all keys including bloom filter and ready markers (validates combined unlink)', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Delete All Topic ${random}`,
      slug: `bloom-delete-all-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    // Verify ready before delete
    const before = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(before[fixture.topicFollowRelationTableName]?.ready).toBe(true)
    expect(before[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(true)

    await deleteUserBookmarkBloomFilter(fixture.user.id)

    // All relations should be unready after delete (combined unlink removes filter + ready keys)
    const after = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(after[fixture.topicFollowRelationTableName]?.ready).toBe(false)
    expect(after[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(false)
  })

  it('multi-relation bloom check with mixed ready states', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Mixed Ready Topic ${random}`,
      slug: `bloom-mixed-ready-topic-${random}`,
      createdById: fixture.user.id,
    })
    // Before backfill, all relations are unready
    const beforeBackfill = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(beforeBackfill[fixture.topicFollowRelationTableName]?.ready).toBe(false)
    expect(beforeBackfill[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(false)

    // Backfill sets all relations ready simultaneously
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const afterBackfill = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(afterBackfill[fixture.topicFollowRelationTableName]?.ready).toBe(true)
    // Topic is bookmarked — bloom filter should report it as a candidate
    expect(afterBackfill[fixture.topicFollowRelationTableName]?.results[0]).toBe(true)
    // RSS feed item is not bookmarked — ready state is set via backfill
    // (actual bloom filter result can be false or true due to false positives)
    expect(afterBackfill[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(true)
  })

  it('multi-relation bloom check keeps unready relations isolated', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Partial Ready Topic ${random}`,
      slug: `bloom-partial-ready-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    await cacheValkeyClient.unlink([
      `bookmark-bloom-ready:${fixture.user.id}:${fixture.rssFeedItemSaveRelationTableName}`,
    ])

    const result = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )

    expect(result[fixture.topicFollowRelationTableName]?.ready).toBe(true)
    expect(result[fixture.topicFollowRelationTableName]?.results[0]).toBe(true)
    expect(result[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(false)
    expect(result[fixture.rssFeedItemSaveRelationTableName]?.results).toEqual([null])
  })

  it('multi-relation bloom check chunks large candidate lists before invoking Lua', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Chunk Topic ${random}`,
      slug: `bloom-chunk-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const objectIds = [
      topicId,
      ...Array.from({ length: 5001 }, (_, index) => `missing-chunk-${random}-${index}`),
    ]
    const result = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      objectIds,
    )

    expect(result[fixture.topicFollowRelationTableName]?.ready).toBe(true)
    expect(result[fixture.topicFollowRelationTableName]?.results).toHaveLength(objectIds.length)
    expect(result[fixture.topicFollowRelationTableName]?.results[0]).toBe(true)
    expect(result[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(true)
    expect(result[fixture.rssFeedItemSaveRelationTableName]?.results).toHaveLength(objectIds.length)
  })

  it('bloom filter works correctly for rss_feed_item UUID bookmark IDs', async () => {
    const random = Math.random().toString(36).slice(2, 12)

    const topicId = await insertTestTopic({
      name: `Bloom RSS Topic ${random}`,
      slug: `bloom-rss-topic-${random}`,
      createdById: fixture.user.id,
    })
    const rssFeedId = await insertTestRssFeed({ topicId, title: `Bloom RSS Feed ${random}` })
    const itemUrl = await addUrl(null, `https://example.com/item-${random}`, {
      content_type: 'text/html',
    })

    // RSS feed items cascade-delete when the feed is deleted; don't push to entities
    const savedItemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: itemUrl!.id,
      guid: `bloom-saved-item-${random}`,
      itemData: { title: `Saved Item ${random}` },
      contentSha256: createHash('sha256').update(`saved-${random}`).digest(),
    })

    const unsavedItemId = await insertTestRssFeedItem({
      rssFeedId,
      urlId: itemUrl!.id,
      guid: `bloom-unsaved-item-${random}`,
      itemData: { title: `Unsaved Item ${random}` },
      contentSha256: createHash('sha256').update(`unsaved-${random}`).digest(),
    })

    await bookmarkEntity(fixture.user, 'rss_feed_item', { id: savedItemId }, 'save')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const bloomCandidates = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.rssFeedItemSaveRelationTableName,
      [savedItemId, unsavedItemId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    const bookmarks = await getBookmarksForEntities(fixture.user, 'rss_feed_item', [
      savedItemId,
      unsavedItemId,
    ])
    expect(bookmarks[savedItemId].save).toBe(true)
    expect(bookmarks[unsavedItemId]).toBeUndefined()
  })
})
