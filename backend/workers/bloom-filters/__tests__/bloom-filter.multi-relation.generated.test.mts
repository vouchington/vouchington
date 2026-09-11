import { it, expect, beforeAll, afterAll, afterEach, describe } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  backfillUserBookmarkBloomFilter,
  checkBookmarkBloomCandidates,
  checkBookmarkBloomCandidatesByRelations,
  deleteUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from '@services/bookmarks/bloom-filter'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestTopic,
  insertTestRssFeed,
  insertTestRssFeedItem,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { addUrl } from '@services/urls'
import { createHash } from 'node:crypto'
import { bloomFilters as bloomFiltersWorker } from '../workers.mts'
import { cacheValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated (multi-relation)', () => {
  let user: PrivateUser
  let topicFollowRelationTableName: string
  let rssFeedItemSaveRelationTableName: string
  let restoreBloomFilterConfig: () => void

  beforeAll(async () => {
    await bloomFilterConfig.waitForInitialization()
    // globalSetup disables bloom filter for non-bloom tests. Re-enable it here
    // so this test suite exercises the bloom code paths.
    restoreBloomFilterConfig = overrideDynamicConfigFieldsForTest(bloomFilterConfig, {
      bookmarkBloomFilterEnabled: true,
    })

    const createdUser = await createTestUser()
    if (!createdUser) throw new Error('Failed to create test user')
    user = createdUser

    const topicRelation = getUserBookmarkRelationsForEntityType('topic').find(
      relationData => relationData.predicate === 'follow',
    )
    if (!topicRelation) throw new Error('Missing user->follow->topic relation metadata')
    topicFollowRelationTableName = topicRelation.table_name

    const rssRelation = getUserBookmarkRelationsForEntityType('rss_feed_item').find(
      relationData => relationData.predicate === 'save',
    )
    if (!rssRelation) throw new Error('Missing user->save->rss_feed_item relation metadata')
    rssFeedItemSaveRelationTableName = rssRelation.table_name
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(bloomFilterConfig, { bookmarkBloomFilterEnabled: true })
    // Wait for any in-flight bloom filter jobs to finish before deleting the filter.
    // getBookmarksForEntities enqueues a backfill job when the filter is unready; that job runs
    // asynchronously via the TestWorker and can race with the next test's explicit backfill call.
    // Draining here ensures no concurrent rebuildFromStream calls interfere across tests.
    const worker = bloomFiltersWorker as unknown as {
      getActiveCount(): number
      once(event: string, cb: () => void): void
    }
    if (worker.getActiveCount() > 0) {
      await new Promise<void>(resolve => worker.once('drained', resolve))
    }
    await deleteUserBookmarkBloomFilter(user.id).catch(() => {})
  })

  afterAll(async () => {
    await deleteUserBookmarkBloomFilter(user.id).catch(() => {})
    restoreBloomFilterConfig()
  })

  it('delete removes all keys including bloom filter and ready markers (validates combined unlink)', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Delete All Topic ${random}`,
      slug: `bloom-delete-all-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    // Verify ready before delete
    const before = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(before[topicFollowRelationTableName]?.ready).toBe(true)
    expect(before[rssFeedItemSaveRelationTableName]?.ready).toBe(true)

    await deleteUserBookmarkBloomFilter(user.id)

    // All relations should be unready after delete (combined unlink removes filter + ready keys)
    const after = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(after[topicFollowRelationTableName]?.ready).toBe(false)
    expect(after[rssFeedItemSaveRelationTableName]?.ready).toBe(false)
  })

  it('multi-relation bloom check with mixed ready states', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Mixed Ready Topic ${random}`,
      slug: `bloom-mixed-ready-topic-${random}`,
      createdById: user.id,
    })
    // Before backfill, all relations are unready
    const beforeBackfill = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(beforeBackfill[topicFollowRelationTableName]?.ready).toBe(false)
    expect(beforeBackfill[rssFeedItemSaveRelationTableName]?.ready).toBe(false)

    // Backfill sets all relations ready simultaneously
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    const afterBackfill = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )
    expect(afterBackfill[topicFollowRelationTableName]?.ready).toBe(true)
    // Topic is bookmarked — bloom filter should report it as a candidate
    expect(afterBackfill[topicFollowRelationTableName]?.results[0]).toBe(true)
    // RSS feed item is not bookmarked — ready state is set via backfill
    // (actual bloom filter result can be false or true due to false positives)
    expect(afterBackfill[rssFeedItemSaveRelationTableName]?.ready).toBe(true)
  })

  it('multi-relation bloom check keeps unready relations isolated', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Partial Ready Topic ${random}`,
      slug: `bloom-partial-ready-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    await cacheValkeyClient.unlink([
      `bookmark-bloom-ready:${user.id}:${rssFeedItemSaveRelationTableName}`,
    ])

    const result = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )

    expect(result[topicFollowRelationTableName]?.ready).toBe(true)
    expect(result[topicFollowRelationTableName]?.results[0]).toBe(true)
    expect(result[rssFeedItemSaveRelationTableName]?.ready).toBe(false)
    expect(result[rssFeedItemSaveRelationTableName]?.results).toEqual([null])
  })

  it('multi-relation bloom check chunks large candidate lists before invoking Lua', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Chunk Topic ${random}`,
      slug: `bloom-chunk-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    const objectIds = [
      topicId,
      ...Array.from({ length: 5001 }, (_, index) => `missing-chunk-${random}-${index}`),
    ]
    const result = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      objectIds,
    )

    expect(result[topicFollowRelationTableName]?.ready).toBe(true)
    expect(result[topicFollowRelationTableName]?.results).toHaveLength(objectIds.length)
    expect(result[topicFollowRelationTableName]?.results[0]).toBe(true)
    expect(result[rssFeedItemSaveRelationTableName]?.ready).toBe(true)
    expect(result[rssFeedItemSaveRelationTableName]?.results).toHaveLength(objectIds.length)
  })

  it('bloom filter works correctly for rss_feed_item UUID bookmark IDs', async () => {
    const random = Math.random().toString(36).slice(2, 12)

    const topicId = await insertTestTopic({
      name: `Bloom RSS Topic ${random}`,
      slug: `bloom-rss-topic-${random}`,
      createdById: user.id,
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

    await bookmarkEntity(user, 'rss_feed_item', { id: savedItemId }, 'save')
    await backfillUserBookmarkBloomFilter(user.id)

    const bloomCandidates = await checkBookmarkBloomCandidates(
      user.id,
      rssFeedItemSaveRelationTableName,
      [savedItemId, unsavedItemId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    const bookmarks = await getBookmarksForEntities(user, 'rss_feed_item', [
      savedItemId,
      unsavedItemId,
    ])
    expect(bookmarks[savedItemId].save).toBe(true)
    expect(bookmarks[unsavedItemId]).toBeUndefined()
  })
})
