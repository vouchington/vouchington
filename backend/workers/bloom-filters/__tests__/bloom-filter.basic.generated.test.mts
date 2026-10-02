import { registerBookmarkBloomFixture } from '@voucha/test-helpers/bookmark-bloom-fixture'
import { it, expect, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import {
  backfillUserBookmarkBloomFilter,
  checkBookmarkBloomCandidatesByRelations,
  deleteUserBookmarkBloomFilter,
} from '@services/bookmarks/bloom-filter'
import { checkBookmarkBloomCandidates } from '@services/bookmarks/bloom-filter-candidates'
import { getBookmarkBloomFilter } from '@services/bookmarks/bloom-filter-utils'
import { overrideDynamicConfigFieldsForTest, insertTestTopic } from '@voucha/test-helpers'
import { bloomFilterConfig } from '@services/bloom-filter-config'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('bloom-filter.generated (basic)', () => {
  const fixture = registerBookmarkBloomFixture()

  it('backfillUserBookmarkBloomFilter marks filter as ready and preserves bookmark reads', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const bookmarkedTopicId = await insertTestTopic({
      name: `Bloom Topic ${random}`,
      slug: `bloom-topic-${random}`,
      createdById: fixture.user.id,
    })
    const unbookmarkedTopicId = await insertTestTopic({
      name: `Bloom Topic Miss ${random}`,
      slug: `bloom-topic-miss-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: bookmarkedTopicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const bloomCandidates = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [bookmarkedTopicId, unbookmarkedTopicId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    const bookmarks = await getBookmarksForEntities(fixture.user, 'topic', [
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
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')

    const bloomCandidatesBefore = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidatesBefore.ready).toBe(false)

    const bookmarks = await getBookmarksForEntities(fixture.user, 'topic', [topicId])
    expect(bookmarks[topicId].follow).toBe(true)
  })

  it('bookmarkEntity adds new keys to an already-ready bloom filter', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const existingTopicId = await insertTestTopic({
      name: `Bloom Existing Topic ${random}`,
      slug: `bloom-existing-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: existingTopicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const newTopicId = await insertTestTopic({
      name: `Bloom New Topic ${random}`,
      slug: `bloom-new-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: newTopicId }, 'follow')

    const bloomCandidates = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
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
      createdById: fixture.user.id,
    })
    // Bookmark then backfill so the filter is ready with the topic in it
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    // Unbookmark — the bloom filter still has the entry (false positive)
    await unbookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')

    // The bloom filter should still report the topic as a candidate (false positive)
    const bloomCandidates = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidates.ready).toBe(true)
    expect(bloomCandidates.results[0]).toBe(true)

    // But the DB lookup should confirm it's actually not bookmarked
    const bookmarks = await getBookmarksForEntities(fixture.user, 'topic', [topicId])
    expect(bookmarks[topicId]).toBeUndefined()
  })

  it('getBookmarksForEntities bypasses bloom filter when feature flag is disabled', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Disabled Topic ${random}`,
      slug: `bloom-disabled-topic-${random}`,
      createdById: fixture.user.id,
    })
    overrideDynamicConfigFieldsForTest(bloomFilterConfig, { bookmarkBloomFilterEnabled: false })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')

    const bloomCandidates = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(bloomCandidates.ready).toBe(false)

    const bookmarks = await getBookmarksForEntities(fixture.user, 'topic', [topicId])
    expect(bookmarks[topicId].follow).toBe(true)
  })

  it('deleteUserBookmarkBloomFilter causes checkBookmarkBloomCandidates to return ready: false', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Delete Topic ${random}`,
      slug: `bloom-delete-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const beforeDelete = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(beforeDelete.ready).toBe(true)

    await deleteUserBookmarkBloomFilter(fixture.user.id)

    const afterDelete = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(afterDelete.ready).toBe(false)

    // checkBookmarkBloomCandidatesByRelations should also return not-ready
    const byRelations = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName],
      [topicId],
    )
    expect(byRelations[fixture.topicFollowRelationTableName]?.ready).toBe(false)
  })

  it('live filter key expiring (TTL) causes checkBookmarkBloomCandidates to return ready: false with no false negative', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom TTL Expiry Topic ${random}`,
      slug: `bloom-ttl-expiry-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    // The live filter key must carry BOOKMARK_BLOOM_FILTER_TTL_SECONDS after backfill, not just the
    // ready markers, or it leaks forever on the shared noeviction Valkey instance.
    const filterKeyTtl = await bloomValkeyClient.ttl(
      getBookmarkBloomFilter(fixture.user.id).getKey(),
    )
    expect(filterKeyTtl).toBeGreaterThan(0)

    const beforeExpiry = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(beforeExpiry.ready).toBe(true)
    expect(beforeExpiry.results[0]).toBe(true)

    // Simulate BOOKMARK_BLOOM_FILTER_TTL_SECONDS expiring the live filter key without touching the
    // ready markers (whose own, shorter TTL is not under test here). UNLINK is indistinguishable
    // from TTL expiry to the Lua script's EXISTS(KEYS[1]) check, and is deterministic — unlike
    // waiting out a real TTL.
    await bloomValkeyClient.unlink([getBookmarkBloomFilter(fixture.user.id).getKey()])

    const afterExpiry = await checkBookmarkBloomCandidates(
      fixture.user.id,
      fixture.topicFollowRelationTableName,
      [topicId],
    )
    expect(afterExpiry.ready).toBe(false)
    // Never a false negative: an unready result must be null (unknown), never `false` (definitely
    // not bookmarked) — callers must fall back to PostgreSQL instead of trusting a stale bloom read.
    expect(afterExpiry.results[0]).toBeNull()

    // The by-relations entry point degrades the same way, even though its ready marker is untouched.
    const byRelations = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName],
      [topicId],
    )
    expect(byRelations[fixture.topicFollowRelationTableName]?.ready).toBe(false)
    expect(byRelations[fixture.topicFollowRelationTableName]?.results[0]).toBeNull()
  })

  it('backfill sets ready markers for all bookmark relations (validates Batch pipeline)', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const topicId = await insertTestTopic({
      name: `Bloom Ready Marker Topic ${random}`,
      slug: `bloom-ready-marker-topic-${random}`,
      createdById: fixture.user.id,
    })
    await bookmarkEntity(fixture.user, 'topic', { id: topicId }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    // Check that bloom filter is ready for multiple relation types
    const topicResult = await checkBookmarkBloomCandidatesByRelations(
      fixture.user.id,
      [fixture.topicFollowRelationTableName, fixture.rssFeedItemSaveRelationTableName],
      [topicId],
    )
    // Both relations should be ready after backfill (Batch pipeline sets all ready keys in 1 roundtrip)
    expect(topicResult[fixture.topicFollowRelationTableName]?.ready).toBe(true)
    expect(topicResult[fixture.rssFeedItemSaveRelationTableName]?.ready).toBe(true)
  })
})
