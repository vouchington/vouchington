import { it, expect, describe, beforeAll } from 'vitest'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import {
  blockUrlHostname,
  muteUrlHostname,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  followRssFeed,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestUrlHostname,
  insertTestUrl,
  insertTestRssFeedItem,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createHash } from 'node:crypto'

describe('getRssFeedItemFeedIds hostname filtering', () => {
  let viewer: PrivateUser
  let feedId: string

  beforeAll(async () => {
    viewer = await createTestUser()
    const topic = await createTestTopic()
    feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
  }, 60_000)

  async function insertItemWithHostname(hostname: string, blocked?: boolean) {
    const random = Math.random().toString(36).slice(2, 10)
    const hostnameId = await insertTestUrlHostname({ hostname, blocked })
    const urlId = await insertTestUrl({
      url: `https://${hostname}/article-${random}`,
      hostnameId,
    })
    const guid = `guid-hostname-filter-${random}`
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid,
      itemData: { title: `Test Item ${random}` },
      contentSha256: createHash('sha256').update(random).digest(),
    })
    return { itemId, hostnameId }
  }

  it('excludes items from blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const { itemId, hostnameId } = await insertItemWithHostname(`blocked-${random}.example.com`)

    await blockUrlHostname(viewer, hostnameId)

    const result = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })
    const found = result.results.find(r => r.id === itemId)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes items from muted hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const { itemId, hostnameId } = await insertItemWithHostname(`muted-${random}.example.com`)

    await muteUrlHostname(viewer, hostnameId)

    const result = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })
    const found = result.results.find(r => r.id === itemId)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes items from site-wide blocked hostname', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const { itemId } = await insertItemWithHostname(`siteblocked-${random}.example.com`, true)

    const result = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })
    const found = result.results.find(r => r.id === itemId)
    expect(found).toBeUndefined()
  }, 60_000)

  it('excludes site-wide blocked hostnames from anonymous community feeds', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    const random = Math.random().toString(36).slice(2, 10)
    const { itemId } = await insertItemWithHostname(`anon-siteblocked-${random}.example.com`, true)

    const result = await getRssFeedItemFeedIds(null, {
      community_id: community.id,
      feed_type: 'any',
      limit: 100,
    })
    const found = result.results.find(r => r.id === itemId)
    expect(found).toBeUndefined()
  }, 60_000)

  it('subdomain matching: blocking parent domain also blocks subdomain items', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    // Create parent hostname
    const parentHostnameId = await insertTestUrlHostname({
      hostname: `parent-rss-${random}.com`,
    })
    // Create subdomain hostname
    const subHostname = `api.parent-rss-${random}.com`
    const subHostnameId = await insertTestUrlHostname({ hostname: subHostname })
    const urlId = await insertTestUrl({
      url: `https://${subHostname}/resource`,
      hostnameId: subHostnameId,
    })
    const guid = `guid-subdomain-rss-${random}`
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId,
      guid,
      itemData: { title: `Subdomain Item ${random}` },
      contentSha256: createHash('sha256').update(`sub-${random}`).digest(),
    })

    // Block only the parent hostname
    await blockUrlHostname(viewer, parentHostnameId)

    const result = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })
    const found = result.results.find(r => r.id === itemId)
    expect(found).toBeUndefined()
  }, 60_000)
})
