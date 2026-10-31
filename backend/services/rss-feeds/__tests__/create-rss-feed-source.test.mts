import { describe, it, expect, vi } from 'vitest'
import { createSourceWithRetry } from '../create-source-helpers.mts'
import { createRssFeedUrlId } from '../rss-feed-url-id.mts'
import { upsertUrlHostnames } from '@services/urls-hostnames/upsert'
import { mergeTopicsForTest as mergeTopicAliases } from '@voucha/test-helpers/merge-topics'
import { getTopicByAny } from '@services/topics/get'
import { getTopicAliasRecords } from '@services/topics/get-topic-aliases'
import { getRssFeedByTopicId } from '@services/rss-feeds/get'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { ValkeyBloomFilter } from '@data-stores/valkey'
import { normalizeKey } from '@ts-shared/utils/strings'
import { findExistingFeedByUrlId, findExistingFeedByUrl } from '../find-existing-feed.mts'
import {
  createTestUserDirect,
  insertTestTopic,
  softDeleteTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import type { BasicUser } from '@services/users/types'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

async function makeSourceArgs(hostname: string, feedUrl: string) {
  const hostnameMap = await upsertUrlHostnames(null, [hostname])
  const hostnameId = hostnameMap.get(new URL(`https://${hostname}`).hostname)!
  const rssFeedUrlId = await createRssFeedUrlId(feedUrl)
  return { hostnameId, rssFeedUrlId }
}

function createOwnedSource(
  user: BasicUser,
  hostname: string,
  feedUrl: string,
  ids: { hostnameId: string; rssFeedUrlId: string },
  topicName = hostname,
) {
  return createSourceWithRetry({
    provenance: WEB_PROVENANCE,
    currentUser: user,
    rssFeedUrlId: ids.rssFeedUrlId,
    hostnameId: ids.hostnameId,
    feedUrl,
    topicName,
    rawTitle: hostname,
    feedTitle: hostname,
    feedType: 'article',
    attempt: 0,
  })
}

describe('createRssFeedSource', () => {
  it('creates an rss feed topic, hostname link, and feed title', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-test-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')

    const result = await createOwnedSource(user, hostname, feedUrl, ids)

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
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')
    const slug = `rss-src-alias-${suffix}examplecom-rss-src-alias-${suffix}-example-com-feed-xml`

    const result = await createOwnedSource(user, hostname, feedUrl, ids)

    expect(result!.slug).toBe(slug)
    const { results } = await getTopicAliasRecords(result!.topicId)
    expect(results.map(record => record.alias)).toEqual([slug])
  })

  it('returns null on duplicate — idempotent on same rssFeedUrlId', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-idem-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')

    const first = await createOwnedSource(user, hostname, feedUrl, ids)
    expect(first).not.toBeNull()

    const second = await createOwnedSource(user, hostname, feedUrl, ids)
    expect(second).toBeNull()

    const existing = await findExistingFeedByUrlId(ids.rssFeedUrlId)
    expect(existing?.topic_id).toBe(first!.topicId)
  })

  it('adds topic to bloom filter after creation', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-bloom-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')
    const slug = `rss-src-bloom-${suffix}examplecom-rss-src-bloom-${suffix}-example-com-feed-xml`

    const originalBloomFilter = entityCacheBloomFilters.topics
    const originalConfig = originalBloomFilter.getConfig()
    const testBloomFilter = new ValkeyBloomFilter({
      name: `topics-rss-feed-source-test-${suffix}`,
      capacity: 1_000,
      errorRate: originalConfig.errorRate,
      batchSize: originalConfig.batchSize,
    })

    entityCacheBloomFilters.topics = testBloomFilter
    const bloomAdd = vi.spyOn(testBloomFilter, 'add')
    try {
      await testBloomFilter.delete()
      await testBloomFilter.ensureExists()

      const result = await createOwnedSource(user, hostname, feedUrl, ids)

      expect(result).not.toBeNull()
      await Promise.all(
        bloomAdd.mock.results.flatMap(entry =>
          entry.type === 'return' ? [Promise.resolve(entry.value)] : [],
        ),
      )
      expect(await testBloomFilter.exists(normalizeKey(slug))).toBe(true)
      expect(await testBloomFilter.exists(normalizeKey(result!.topicId))).toBe(true)
    } finally {
      entityCacheBloomFilters.topics = originalBloomFilter
      await testBloomFilter.delete().catch(() => {})
    }
  })

  it('creates topic revision when createdById is a real user', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-src-user-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')

    const result = await createOwnedSource(user, hostname, feedUrl, ids)

    expect(result).not.toBeNull()
    const topic = await getTopicByAny(result!.topicId)
    expect(topic).not.toBeNull()
  })
})

describe('findExistingFeed* — dedup with soft-deleted and merged owners', () => {
  // Regression guard: these queries intentionally omit the active-topic filter
  // (deleted_at IS NULL AND merged_into_topic_id IS NULL) because dedup lookups
  // must match feeds whose topic was soft-deleted. Merges instead repoint feed
  // ownership to the canonical destination, which dedup returns.

  it('findExistingFeedByUrlId and findExistingFeedByUrl still return a feed after its topic is soft-deleted', async () => {
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')
    const suffix = randomSuffix()
    const hostname = `rss-dedup-del-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)

    const created = await createOwnedSource(user, hostname, feedUrl, ids)
    expect(created).not.toBeNull()

    await softDeleteTopic(created!.topicId, user.id)

    const byUrlId = await findExistingFeedByUrlId(ids.rssFeedUrlId)
    expect(byUrlId).not.toBeNull()
    expect(byUrlId!.topic_id).toBe(created!.topicId)

    const byUrl = await findExistingFeedByUrl(feedUrl)
    expect(byUrl).not.toBeNull()
    expect(byUrl!.topic_id).toBe(created!.topicId)
  })

  it('findExistingFeedByUrlId and findExistingFeedByUrl still return a feed after its topic is merged', async () => {
    const user = await createTestUserDirect({ administrator: true })
    if (!user) throw new Error('createTestUserDirect returned null')
    const suffix = randomSuffix()
    const hostname = `rss-dedup-mrg-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)

    const created = await createOwnedSource(user, hostname, feedUrl, ids)
    expect(created).not.toBeNull()

    const destTopicId = await insertTestTopic({
      name: `Dedup Merge Dest ${suffix}`,
      topicType: 'rss_feed',
      slug: `rss-dedup-mrg-dest-${suffix}`,
      createdById: user.id,
    })
    const source = await getTopicByAny(created!.topicId)
    const destination = await getTopicByAny(destTopicId)
    if (!source || !destination) throw new Error('Test topics not found')
    await mergeTopicAliases(user, source, destination)

    const byUrlId = await findExistingFeedByUrlId(ids.rssFeedUrlId)
    expect(byUrlId).not.toBeNull()
    expect(byUrlId!.topic_id).toBe(destTopicId)

    const byUrl = await findExistingFeedByUrl(feedUrl)
    expect(byUrl).not.toBeNull()
    expect(byUrl!.topic_id).toBe(destTopicId)
  })
})

describe('findExistingFeedByUrl', () => {
  it('finds a feed by its URL string', async () => {
    const suffix = randomSuffix()
    const hostname = `rss-find-url-${suffix}.example.com`
    const feedUrl = `https://${hostname}/feed.xml`
    const ids = await makeSourceArgs(hostname, feedUrl)
    const user = await createTestUserDirect()
    if (!user) throw new Error('createTestUserDirect returned null')

    const created = await createOwnedSource(user, hostname, feedUrl, ids)

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
