import { it, expect, describe } from 'vitest'
import { createHash } from 'node:crypto'
import {
  createTestUser,
  insertTestRssFeedItem,
  createTestUrlWithHostname,
  setRssFeedOwningTopicVoteScore,
  checkItemUnsuppressedGlobal,
  checkItemClusterEligible,
  addRssFeedItemSource,
  addRssFeedTopicPublisherType,
  addRssFeedTopicPublisherTypeWithScore,
  createTestTopic,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { updateRssFeedById } from '@services/rss-feeds'
import { updateRssFeedByIdAsCurrentUser } from '@services/rss-feeds/update-current-user'
import { evaluateRssFeedDiscoverability } from '@services/rss-feeds/evaluate-discoverability'
import { getPublisherTypeTopicId } from '@services/topics/publisher-type-topics'

describe('suppression', () => {
  function sha256(data: unknown): Buffer {
    return createHash('sha256').update(JSON.stringify(data)).digest()
  }

  async function createItemWithFeed(feedId: string): Promise<string> {
    const random = Math.random().toString(36).slice(2, 10)
    const urlId = await createTestUrlWithHostname()
    return insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid: `suppression-test-${random}`,
      itemData: { title: `Test ${random}` },
      contentSha256: sha256({ title: `Test ${random}`, r: random }),
    })
  }

  async function markFeedDiscoverable(feedId: string): Promise<void> {
    await updateRssFeedById(feedId, { discoverable: true })
  }

  it('item with a discoverable source is globally unsuppressed', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)
    await markFeedDiscoverable(feed.id)

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(true)
  })

  it('item with a hidden source is globally suppressed', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await updateRssFeedById(feed.id, { discoverable: false })

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
  })

  it('item with multiple sources and one hidden source still appears', async () => {
    const feed1 = await createTestRssFeed({})
    const feed2 = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed1.id)
    await addRssFeedItemSource(feed2.id, itemId)
    await markFeedDiscoverable(feed2.id)

    await updateRssFeedById(feed1.id, { discoverable: false })

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(true)
  })

  it('item with all sources hidden is globally suppressed', async () => {
    const feed1 = await createTestRssFeed({})
    const feed2 = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed1.id)
    await addRssFeedItemSource(feed2.id, itemId)

    await updateRssFeedById(feed1.id, { discoverable: false })
    await updateRssFeedById(feed2.id, { discoverable: false })

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
  })

  it('restoring discoverability restores global visibility', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await updateRssFeedById(feed.id, { discoverable: false })
    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)

    await updateRssFeedById(feed.id, { discoverable: true })
    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(true)
  })

  it('item is globally suppressed when discoverability evaluation hides the owning feed', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    await evaluateRssFeedDiscoverability(feed.id)

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
  })

  it('item is globally visible when owning topic score meets discoverability threshold', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    // Set votes to net = 5 (at the default discoverability threshold).
    await setRssFeedOwningTopicVoteScore(feed.id, 5, 0)
    await evaluateRssFeedDiscoverability(feed.id)

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(true)
  })

  it('aggregator publisher type overrides manual discoverability', async () => {
    const admin = await createTestUser({ administrator: true })
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)
    const aggregatorTopicId = await getPublisherTypeTopicId('aggregator')
    expect(aggregatorTopicId).toBeTruthy()

    await updateRssFeedByIdAsCurrentUser(admin, feed.id, {
      discoverable: true,
    })
    await addRssFeedTopicPublisherType(feed.topic_id as string, aggregatorTopicId!)

    const result = await evaluateRssFeedDiscoverability(feed.id)

    expect(result).toBe('updated')
    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
  })

  it('aggregator publisher type ignores higher-scored noncanonical publisher relation', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)
    const aggregatorTopicId = await getPublisherTypeTopicId('aggregator')
    const noncanonicalPublisher = await createTestTopic({
      slug: `noncanonical-publisher-${random}`,
      hostname: `noncanonical-publisher-${random}.example.com`,
    })
    expect(aggregatorTopicId).toBeTruthy()

    await updateRssFeedByIdAsCurrentUser(admin, feed.id, {
      discoverable: true,
    })
    await addRssFeedTopicPublisherTypeWithScore(
      feed.topic_id as string,
      noncanonicalPublisher.id,
      10,
    )
    await addRssFeedTopicPublisherTypeWithScore(feed.topic_id as string, aggregatorTopicId!, 1)

    const result = await evaluateRssFeedDiscoverability(feed.id)

    expect(result).toBe('updated')
    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
  })

  it('item with a discoverable source is cluster-eligible', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)
    await markFeedDiscoverable(feed.id)

    expect(await checkItemClusterEligible(itemId)).toBe(true)
  })

  it('item with a hidden source is not cluster-eligible', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await updateRssFeedById(feed.id, { discoverable: false })

    expect(await checkItemClusterEligible(itemId)).toBe(false)
  })

  it('item is not cluster-eligible when discoverability evaluation hides the owning feed', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await setRssFeedOwningTopicVoteScore(feed.id, 0, 6)
    await evaluateRssFeedDiscoverability(feed.id)

    expect(await checkItemClusterEligible(itemId)).toBe(false)
  })

  it('item is cluster-eligible when owning topic score meets discoverability threshold', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    // Set votes to net = 5 (at the default discoverability threshold).
    await setRssFeedOwningTopicVoteScore(feed.id, 5, 0)
    await evaluateRssFeedDiscoverability(feed.id)

    expect(await checkItemClusterEligible(itemId)).toBe(true)
  })

  it('hidden feed is not cluster-eligible', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await updateRssFeedById(feed.id, { discoverable: false })

    expect(await checkItemClusterEligible(itemId)).toBe(false)
  })

  it('disabled feed does not count as unsuppressed source', async () => {
    const feed = await createTestRssFeed({})
    const itemId = await createItemWithFeed(feed.id)

    await updateRssFeedById(feed.id, { enabled: false })

    expect(await checkItemUnsuppressedGlobal(itemId)).toBe(false)
    expect(await checkItemClusterEligible(itemId)).toBe(false)
  })
})
