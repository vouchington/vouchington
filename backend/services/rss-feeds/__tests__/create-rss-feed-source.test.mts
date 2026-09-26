import { describe, it, expect } from 'vitest'
import { createRssFeedSource } from '../create-source-helpers.mts'
import { createRssFeedUrlId } from '../rss-feed-url-id.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { getTopicByAny } from '@services/topics/get'
import { getTopicAliases } from '@services/topics/get-topic-aliases'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { normalizeKey } from '@ts-shared/utils/strings'
import { findExistingFeedByUrlId, findExistingFeedByUrl } from '../find-existing-feed.mts'
import {
  createTestUserDirect,
  insertTestTopic,
  softDeleteTopic,
  mergeTopicForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function makeSourceArgs(hostname: string, feedUrl: string) {
  const hostnameMap = await upsertUrlHostnames(null, [hostname])
  const hostnameId = hostnameMap.get(new URL(`https://${hostname}`).hostname)!
  const rssFeedUrlId = await createRssFeedUrlId(feedUrl)
  return { hostnameId, rssFeedUrlId }
}

describe('createRssFeedSource', () => {
  it('creates topic, hostname link, and rss_feed with createdById=null (kagi path)', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-test-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)

    const result = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-src-test-${suffix}-example-com`,
      feedTitle: hostname,
      feedType: 'article',
      createdById: null,
    })

    expect(result).not.toBeNull()
    const topic = await getTopicByAny(result!.topicId)
    expect(topic).not.toBeNull()
    expect(topic!.topic_type).toBe('rss_feed')
    expect(topic!.hostname_id).not.toBeNull()

    const feed = await getRssFeedByTopicId(result!.topicId)
    expect(feed).not.toBeNull()
    expect(feed!.title).toBe(hostname)
  })

  it('claims the source slug as a topic alias', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-alias-${suffix}.example.com`
    const slug = `rss-src-alias-${suffix}-example-com`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(
      hostname,
      `https://${hostname}/feed.xml`,
    )

    const result = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug,
      feedTitle: hostname,
      feedType: 'article',
      createdById: null,
    })

    await expect(getTopicAliases(result!.topicId)).resolves.toMatchObject({ results: [slug] })
  })

  it('returns null on duplicate — idempotent on same rssFeedUrlId', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-idem-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)

    const args = {
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-src-idem-${suffix}-example-com`,
      feedTitle: hostname,
      feedType: 'article' as const,
      createdById: null,
    }

    const first = await createRssFeedSource(args)
    expect(first).not.toBeNull()

    const second = await createRssFeedSource(args)
    expect(second).toBeNull()

    const existing = await findExistingFeedByUrlId(rssFeedUrlId)
    expect(existing?.topic_id).toBe(first!.topicId)
  })

  it('adds topic to bloom filter after creation', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-bloom-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)
    const slug = `rss-src-bloom-${suffix}-example-com`

    const originalBloomFilter = entityCacheBloomFilters.topics
    const originalConfig = originalBloomFilter.getConfig()
    const testBloomFilter = new ValkeyBloomFilter({
      name: `topics-rss-feed-source-test-${suffix}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })

    entityCacheBloomFilters.topics = testBloomFilter
    try {
      await testBloomFilter.delete()
      await testBloomFilter.ensureExists()

      const result = await createRssFeedSource({
        provenance: WEB_PROVENANCE,
        rssFeedUrlId,
        hostnameId,
        topicName: hostname,
        slug,
        feedTitle: hostname,
        feedType: 'article',
        createdById: null,
      })

      expect(result).not.toBeNull()
      await expect.poll(() => testBloomFilter.exists(normalizeKey(slug))).toBe(true)
      await expect.poll(() => testBloomFilter.exists(normalizeKey(result!.topicId))).toBe(true)
    } finally {
      entityCacheBloomFilters.topics = originalBloomFilter
      await testBloomFilter.delete().catch(() => {})
    }
  })

  it('creates topic revision when createdById is a real user', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-user-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()

    const result = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-src-user-${suffix}-example-com`,
      feedTitle: hostname,
      feedType: 'article',
      createdById: user!.id,
    })

    expect(result).not.toBeNull()
    const topic = await getTopicByAny(result!.topicId)
    expect(topic).not.toBeNull()
  })
})

describe('findExistingFeed* — dedup invariant: spans all topic lifecycle states', () => {
  // Regression guard: these queries intentionally omit the active-topic filter
  // (deleted_at IS NULL AND merged_into_topic_id IS NULL) because dedup lookups
  // must match feeds whose topic was later merged or soft-deleted. Adding that
  // filter causes false-negative dedup and downstream unique violations. This suite
  // breaks CI the moment someone adds the "obvious" active-state filter.

  it('findExistingFeedByUrlId and findExistingFeedByUrl still return a feed after its topic is soft-deleted', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')
    const suffix = randomSuffix()
    const hostname = `rss-dedup-del-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)

    const created = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-dedup-del-${suffix}-xc`,
      feedTitle: hostname,
      feedType: 'article',
      createdById: null,
    })
    expect(created).not.toBeNull()

    await softDeleteTopic(created!.topicId, user.id)

    const byUrlId = await findExistingFeedByUrlId(rssFeedUrlId)
    expect(byUrlId).not.toBeNull()
    expect(byUrlId!.topic_id).toBe(created!.topicId)

    const byUrl = await findExistingFeedByUrl(feedUrl)
    expect(byUrl).not.toBeNull()
    expect(byUrl!.topic_id).toBe(created!.topicId)
  })

  it('findExistingFeedByUrlId and findExistingFeedByUrl still return a feed after its topic is merged', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')
    const suffix = randomSuffix()
    const hostname = `rss-dedup-mrg-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)

    const created = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-dedup-mrg-${suffix}-xc`,
      feedTitle: hostname,
      feedType: 'article',
      createdById: null,
    })
    expect(created).not.toBeNull()

    const destTopicId = await insertTestTopic({
      name: `Dedup Merge Dest ${suffix}`,
      slug: `rss-dedup-mrg-dest-${suffix}`,
      createdById: user.id,
    })
    await mergeTopicForTest(created!.topicId, destTopicId, user.id)

    const byUrlId = await findExistingFeedByUrlId(rssFeedUrlId)
    expect(byUrlId).not.toBeNull()
    expect(byUrlId!.topic_id).toBe(created!.topicId)

    const byUrl = await findExistingFeedByUrl(feedUrl)
    expect(byUrl).not.toBeNull()
    expect(byUrl!.topic_id).toBe(created!.topicId)
  })
})

describe('findExistingFeedByUrl', () => {
  it('finds a feed by its URL string', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-find-url-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const { hostnameId, rssFeedUrlId } = await makeSourceArgs(hostname, feedUrl)

    const created = await createRssFeedSource({
      provenance: WEB_PROVENANCE,
      rssFeedUrlId,
      hostnameId,
      topicName: hostname,
      slug: `rss-find-url-${suffix}-example-com`,
      feedTitle: hostname,
      feedType: 'article',
      createdById: null,
    })

    expect(created).not.toBeNull()
    const found = await findExistingFeedByUrl(feedUrl)
    expect(found).not.toBeNull()
    expect(found!.topic_id).toBe(created!.topicId)
  })

  it('returns null for a URL that does not exist', async () => {
    const result = await findExistingFeedByUrl(
      'https://nonexistent-rss-find-url.example.com/feed.xml',
    )
    expect(result).toBeNull()
  })
})
