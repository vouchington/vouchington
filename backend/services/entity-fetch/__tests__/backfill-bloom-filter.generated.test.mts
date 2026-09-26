import { it, expect, beforeAll, describe, vi } from 'vitest'
import {
  entityCacheBloomFilters,
  backfillBloomFilter,
  warmUpEntityCacheBloomFilters,
} from '@services/entity-cache/backfill-bloom-filter'
import * as bloomFilterEnqueues from '@queues/bloom-filters/enqueues'
import {
  createTestTopic,
  createTestUser,
  insertTestPost,
  insertTestTopic,
  insertTestRssFeedItem,
  insertTestRssFeedDirect,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { addUrls } from '@services/urls'
import { createCommunity } from '@services/communities/create'
import { createHash } from 'node:crypto'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'

describe('backfill-bloom-filter.generated', () => {
  // Inline normalization to match the bloom filter's key format
  const normalizeKey = (key: string) => key.trim().toLowerCase()
  const suffix = Math.random().toString(36).slice(2, 10)

  let userId: string
  let rssFeedItemId: string

  beforeAll(async () => {
    const user = await createTestUser()
    if (!user) throw new Error('User creation failed')
    userId = user.id

    // Pre-create the RSS feed item chain once so the rss_feed_items test
    // doesn't do sequential setup inside the timed test body.
    const topic = await createTestTopic({
      name: `Test Topic RSS ${suffix}`,
      slug: `test-topic-rss-${suffix}`,
      hostname: `bloom-${suffix}.example.com`,
    })
    const rssFeed = await insertTestRssFeedDirect({
      topicId: topic.id,
      rssFeedUrl: `https://example.com/feed-bloom-${suffix}.xml`,
      title: `Test Feed ${suffix}`,
    })
    const itemUrls = await addUrls(null, [`https://example.com/item-bloom-${suffix}`])
    const guid = `test-guid-bloom-${suffix}`
    rssFeedItemId = await insertTestRssFeedItem({
      rssFeedId: rssFeed.id,
      urlId: itemUrls[0].id,
      guid,
      itemData: { title: 'Test Item' },
      contentSha256: createHash('sha256').update(`bloom-test-${suffix}`).digest(),
    })
  }, 30_000)

  it('entityCacheBloomFilters exports expected filter instances', () => {
    expect(entityCacheBloomFilters.posts).toBeDefined()
    expect(entityCacheBloomFilters.topics).toBeDefined()
    expect(entityCacheBloomFilters.users).toBeDefined()
    expect(entityCacheBloomFilters.communities).toBeDefined()
    expect(entityCacheBloomFilters.rss_feed_items).toBeDefined()

    expect(entityCacheBloomFilters.posts.getConfig().name).toBe('posts')
    expect(entityCacheBloomFilters.topics.getConfig().name).toBe('topics')
    expect(entityCacheBloomFilters.users.getConfig().name).toBe('users')
    expect(entityCacheBloomFilters.communities.getConfig().name).toBe('communities')
    expect(entityCacheBloomFilters.rss_feed_items.getConfig().name).toBe('rss_feed_items')
  })

  it('warmUpEntityCacheBloomFilters enqueues backfill for all filters', async () => {
    await Promise.all(Object.values(entityCacheBloomFilters).map(bf => bf.delete()))

    // In tests the vitest shim executes the backfill job inline, so filters are
    // rebuilt from the DB (not left empty) by the time this call returns.
    // The regression for the empty-filter bug (warmUp must not call ensureExists) is
    // covered by bloom-filter.add-no-autocreate.test.mts which verifies that add() is
    // a no-op when the live key is absent — the property warmUp relies on.
    await warmUpEntityCacheBloomFilters()

    // Capture results before deleting to minimize the window the filter is live
    const checks = await Promise.all(
      Object.values(entityCacheBloomFilters).map(bf => bf.exists('any-key')),
    )

    // All should return false (not null), meaning filter existed but key was not in it
    for (const result of checks) {
      expect(result).not.toBeNull()
    }
  })

  it('warmUpEntityCacheBloomFilters skips filters with existing live keys', async () => {
    const sentinelItems = Object.fromEntries(
      Object.keys(entityCacheBloomFilters).map(entityType => [
        entityType,
        `warmup-sentinel-${entityType}-${suffix}`,
      ]),
    ) as Record<keyof typeof entityCacheBloomFilters, string>

    await Promise.all(
      Object.entries(entityCacheBloomFilters).map(([entityType, bf]) =>
        bf.rebuild([sentinelItems[entityType as keyof typeof entityCacheBloomFilters]]),
      ),
    )

    await warmUpEntityCacheBloomFilters()

    const checks = await Promise.all(
      Object.entries(entityCacheBloomFilters).map(([entityType, bf]) =>
        bf.exists(sentinelItems[entityType as keyof typeof entityCacheBloomFilters]),
      ),
    )

    expect(checks).toEqual([true, true, true, true, true])
  })

  it('warmUpEntityCacheBloomFilters treats key existence errors as missing filters', async () => {
    await Promise.all(Object.values(entityCacheBloomFilters).map(bf => bf.delete()))

    const originalKeyExists = entityCacheBloomFilters.posts.keyExists
    entityCacheBloomFilters.posts.keyExists = () =>
      Promise.reject(suppressedError('test keyExists failure'))

    try {
      await expect(warmUpEntityCacheBloomFilters()).resolves.toBeUndefined()

      const exists = await entityCacheBloomFilters.posts.exists('definitely-not-a-real-post-id')
      expect(exists).not.toBeNull()
    } finally {
      entityCacheBloomFilters.posts.keyExists = originalKeyExists
    }
  })

  it('warmUpEntityCacheBloomFilters handles enqueue failures for missing filters', async () => {
    await Promise.all(Object.values(entityCacheBloomFilters).map(bf => bf.rebuild(['sentinel'])))

    const originalKeyExists = entityCacheBloomFilters.posts.keyExists
    entityCacheBloomFilters.posts.keyExists = () => Promise.resolve(false)
    const enqueueSpy = vi
      .spyOn(bloomFilterEnqueues, 'enqueueBackfillBloomFilter')
      .mockRejectedValueOnce(suppressedError('test enqueue failure'))

    try {
      await expect(warmUpEntityCacheBloomFilters()).resolves.toBeUndefined()
      expect(enqueueSpy).toHaveBeenCalledWith({ entityType: 'posts' })
    } finally {
      entityCacheBloomFilters.posts.keyExists = originalKeyExists
      enqueueSpy.mockRestore()
    }
  })

  it('backfillBloomFilter for users populates filter with user id and username', async () => {
    const user = await createTestUser()
    if (!user) throw new Error('User creation failed')

    await backfillBloomFilter('users')

    const [idExists, usernameExists, missingExists] = await Promise.all([
      entityCacheBloomFilters.users.exists(normalizeKey(user.id)),
      entityCacheBloomFilters.users.exists(normalizeKey(user.username ?? '')),
      entityCacheBloomFilters.users.exists('definitely-not-a-real-user-id'),
    ])

    expect(idExists).toBe(true)
    expect(usernameExists).toBe(true)
    expect(missingExists).toBe(false)
  })

  it('backfillBloomFilter for posts populates filter with post id and slug', async () => {
    const postSlug = `test-post-${suffix}`
    const postId = await insertTestPost({
      title: `Test Post ${suffix}`,
      slug: postSlug,
      createdById: userId,
      markdown: 'test',
    })
    await backfillBloomFilter('posts')

    const [idExists, slugExists, missingExists] = await Promise.all([
      entityCacheBloomFilters.posts.exists(normalizeKey(postId)),
      entityCacheBloomFilters.posts.exists(normalizeKey(postSlug)),
      entityCacheBloomFilters.posts.exists('definitely-not-a-real-post-id'),
    ])

    expect(idExists).toBe(true)
    expect(slugExists).toBe(true)
    expect(missingExists).toBe(false)
  })

  it('backfillBloomFilter for topics populates filter with topic id and slug', async () => {
    const topicSlug = `test-topic-${suffix}`
    const topicId = await insertTestTopic({
      name: `Test Topic ${suffix}`,
      slug: topicSlug,
      createdById: userId,
    })
    await backfillBloomFilter('topics')

    const [idExists, slugExists, missingExists] = await Promise.all([
      entityCacheBloomFilters.topics.exists(normalizeKey(topicId)),
      entityCacheBloomFilters.topics.exists(normalizeKey(topicSlug)),
      entityCacheBloomFilters.topics.exists('definitely-not-a-real-topic-id'),
    ])

    expect(idExists).toBe(true)
    expect(slugExists).toBe(true)
    expect(missingExists).toBe(false)
  })

  it('backfillBloomFilter for communities populates filter with community id and slug', async () => {
    const slug = `test-community-${suffix}`
    const community = await createCommunity(WEB_PROVENANCE, userId, {
      name: `Test Community ${suffix}`,
      slug,
    })
    await backfillBloomFilter('communities')

    const [idExists, slugExists, missingExists] = await Promise.all([
      entityCacheBloomFilters.communities.exists(normalizeKey(community.id)),
      entityCacheBloomFilters.communities.exists(normalizeKey(slug)),
      entityCacheBloomFilters.communities.exists('definitely-not-a-real-community-id'),
    ])

    expect(idExists).toBe(true)
    expect(slugExists).toBe(true)
    expect(missingExists).toBe(false)
  })

  it('backfillBloomFilter for rss_feed_items populates filter with item UUID key', async () => {
    await backfillBloomFilter('rss_feed_items')

    const [keyExists, missingExists] = await Promise.all([
      entityCacheBloomFilters.rss_feed_items.exists(normalizeKey(rssFeedItemId)),
      entityCacheBloomFilters.rss_feed_items.exists('definitely-not-a-real-id'),
    ])

    expect(keyExists).toBe(true)
    expect(missingExists).toBe(false)
  })
})
