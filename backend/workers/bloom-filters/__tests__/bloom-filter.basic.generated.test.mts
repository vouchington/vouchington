import { it, expect, beforeAll, afterAll, afterEach, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  backfillUserBookmarkBloomFilter,
  checkBookmarkBloomCandidates,
  checkBookmarkBloomCandidatesByRelations,
  deleteUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from '@services/bookmarks/bloom-filter'
import { getBookmarkBloomFilter } from '@services/bookmarks/bloom-filter-utils'
import {
  overrideDynamicConfigFieldsForTest,
  createTestUser,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { bloomFilters as bloomFiltersWorker } from '../workers.mts'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated (basic)', () => {
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

  it('backfillUserBookmarkBloomFilter marks filter as ready and preserves bookmark reads', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const bookmarkedTopicId = await insertTestTopic({
      name: `Bloom Topic ${random}`,
      slug: `bloom-topic-${random}`,
      createdById: user.id,
    })
    const unbookmarkedTopicId = await insertTestTopic({
      name: `Bloom Topic Miss ${random}`,
      slug: `bloom-topic-miss-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: bookmarkedTopicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    const bloomCandidates = await checkBookmarkBloomCandidates(
      user.id,
      topicFollowRelationTableName,
      [bookmarkedTopicId, unbookmarkedTopicId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    const bookmarks = await getBookmarksForEntities(user, 'topic', [
      bookmarkedTopicId,
      unbookmarkedTopicId,
    ])
    expect(bookmarks[bookmarkedTopicId].follow).toBe(true)
    expect(bookmarks[unbookmarkedTopicId]).toBeUndefined()
  })

  it('getBookmarksForEntities stays correct when bloom filter is unready', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Fallback Topic ${random}`,
      slug: `bloom-fallback-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')

    const bloomCandidatesBefore = await checkBookmarkBloomCandidates(
      user.id,
      topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidatesBefore.ready).toBe(false)

    const bookmarks = await getBookmarksForEntities(user, 'topic', [topicId])
    expect(bookmarks[topicId].follow).toBe(true)
  })

  it('bookmarkEntity adds new keys to an already-ready bloom filter', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const existingTopicId = await insertTestTopic({
      name: `Bloom Existing Topic ${random}`,
      slug: `bloom-existing-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: existingTopicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    const newTopicId = await insertTestTopic({
      name: `Bloom New Topic ${random}`,
      slug: `bloom-new-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: newTopicId }, 'follow')

    const bloomCandidates = await checkBookmarkBloomCandidates(
      user.id,
      topicFollowRelationTableName,
      [newTopicId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)
  })

  it('getBookmarksForEntities correctly returns no bookmark after unbookmark despite bloom false positive', async () => {
    // This tests the key correctness property: bloom filters can return true for items that are no
    // longer bookmarked (false positives). The DB lookup must confirm the actual state.
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Unbookmark Topic ${random}`,
      slug: `bloom-unbookmark-topic-${random}`,
      createdById: user.id,
    })
    // Bookmark then backfill so the filter is ready with the topic in it
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    // Unbookmark — the bloom filter still has the entry (false positive)
    await unbookmarkEntity(user, 'topic', { id: topicId }, 'follow')

    // The bloom filter should still report the topic as a candidate (false positive)
    const bloomCandidates = await checkBookmarkBloomCandidates(
      user.id,
      topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    // But the DB lookup should confirm it's actually not bookmarked
    const bookmarks = await getBookmarksForEntities(user, 'topic', [topicId])
    expect(bookmarks[topicId]).toBeUndefined()
  })

  it('getBookmarksForEntities bypasses bloom filter when feature flag is disabled', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Disabled Topic ${random}`,
      slug: `bloom-disabled-topic-${random}`,
      createdById: user.id,
    })
    overrideDynamicConfigFieldsForTest(bloomFilterConfig, { bookmarkBloomFilterEnabled: false })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')

    const bloomCandidates = await checkBookmarkBloomCandidates(
      user.id,
      topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidates.ready).toBe(false)

    const bookmarks = await getBookmarksForEntities(user, 'topic', [topicId])
    expect(bookmarks[topicId].follow).toBe(true)
  })

  it('deleteUserBookmarkBloomFilter causes checkBookmarkBloomCandidates to return ready: false', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Delete Topic ${random}`,
      slug: `bloom-delete-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    const beforeDelete = await checkBookmarkBloomCandidates(user.id, topicFollowRelationTableName, [
      topicId,
    ])
    expect(beforeDelete.ready).toBe(true)

    await deleteUserBookmarkBloomFilter(user.id)

    const afterDelete = await checkBookmarkBloomCandidates(user.id, topicFollowRelationTableName, [
      topicId,
    ])
    expect(afterDelete.ready).toBe(false)

    // checkBookmarkBloomCandidatesByRelations should also return not-ready
    const byRelations = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName],
      [topicId],
    )
    expect(byRelations[topicFollowRelationTableName]?.ready).toBe(false)
  })

  it('live filter key expiring (TTL) causes checkBookmarkBloomCandidates to return ready: false with no false negative', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom TTL Expiry Topic ${random}`,
      slug: `bloom-ttl-expiry-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    // The live filter key must carry BOOKMARK_BLOOM_FILTER_TTL_SECONDS after backfill, not just the
    // ready markers, or it leaks forever on the shared noeviction Valkey instance.
    const filterKeyTtl = await bloomValkeyClient.ttl(getBookmarkBloomFilter(user.id).getKey())
    expect(filterKeyTtl).toBeGreaterThan(0)

    const beforeExpiry = await checkBookmarkBloomCandidates(user.id, topicFollowRelationTableName, [
      topicId,
    ])
    expect(beforeExpiry.ready).toBe(true)
    expect(beforeExpiry.results[0]).toBe(true)

    // Simulate BOOKMARK_BLOOM_FILTER_TTL_SECONDS expiring the live filter key without touching the
    // ready markers (whose own, shorter TTL is not under test here). UNLINK is indistinguishable
    // from TTL expiry to the Lua script's EXISTS(KEYS[1]) check, and is deterministic — unlike
    // waiting out a real TTL.
    await bloomValkeyClient.unlink([getBookmarkBloomFilter(user.id).getKey()])

    const afterExpiry = await checkBookmarkBloomCandidates(user.id, topicFollowRelationTableName, [
      topicId,
    ])
    expect(afterExpiry.ready).toBe(false)
    // Never a false negative: an unready result must be null (unknown), never `false` (definitely
    // not bookmarked) — callers must fall back to PostgreSQL instead of trusting a stale bloom read.
    expect(afterExpiry.results[0]).toBeNull()

    // The by-relations entry point degrades the same way, even though its ready marker is untouched.
    const byRelations = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName],
      [topicId],
    )
    expect(byRelations[topicFollowRelationTableName]?.ready).toBe(false)
    expect(byRelations[topicFollowRelationTableName]?.results[0]).toBeNull()
  })

  it('backfill sets ready markers for all bookmark relations (validates Batch pipeline)', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Ready Marker Topic ${random}`,
      slug: `bloom-ready-marker-topic-${random}`,
      createdById: user.id,
    })
    await bookmarkEntity(user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(user.id)

    // Check that bloom filter is ready for multiple relation types
    const topicResult = await checkBookmarkBloomCandidatesByRelations(
      user.id,
      [topicFollowRelationTableName, rssFeedItemSaveRelationTableName],
      [topicId],
    )
    // Both relations should be ready after backfill (Batch pipeline sets all ready keys in 1 roundtrip)
    expect(topicResult[topicFollowRelationTableName]?.ready).toBe(true)
    expect(topicResult[rssFeedItemSaveRelationTableName]?.ready).toBe(true)
  })
})
