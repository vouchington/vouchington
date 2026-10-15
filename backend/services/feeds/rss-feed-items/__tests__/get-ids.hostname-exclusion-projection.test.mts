import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  blockUrlHostname,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestCommunity,
  insertTestCommunityListItem,
  insertTestRssFeedItem,
  insertTestUrl,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'

describe('RSS hostname exclusions', () => {
  it('keeps viewer subdomain exclusions and global blocks independent', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    const suffix = randomUUID()

    async function addItem(hostname: string, isBlocked = false) {
      const hostnameId = await insertTestUrlHostname({ hostname, is_blocked: isBlocked })
      const urlId = await insertTestUrl({ url: `https://${hostname}/${suffix}`, hostnameId })
      const itemId = await insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId,
        guid: `hostname-${randomUUID()}`,
        itemData: { title: hostname },
        contentSha256: createHash('sha256').update(hostname).digest(),
      })
      return { hostnameId, itemId }
    }

    const visible = await addItem(`visible-${suffix}.example.com`)
    const globallyBlocked = await addItem(`global-${suffix}.example.com`, true)
    const parent = await insertTestUrlHostname({ hostname: `parent-${suffix}.example.com` })
    const viewerBlocked = await addItem(`sub.parent-${suffix}.example.com`)
    await blockUrlHostname(viewer, parent)

    const viewerPage = await getRssFeedItemFeedIds(viewer, {
      feed_type: 'follow_rss_feeds',
      limit: 100,
    })
    const viewerIds = new Set(viewerPage.results.map(row => row.id))
    expect(viewerIds.has(visible.itemId)).toBe(true)
    expect(viewerIds.has(globallyBlocked.itemId)).toBe(false)
    expect(viewerIds.has(viewerBlocked.itemId)).toBe(false)

    const community = await insertTestCommunity({ createdById: viewer.id })
    await insertTestCommunityListItem({
      communityId: community.id,
      itemType: 'rss_feed',
      entityId: feedId,
    })
    const anonymousPage = await getRssFeedItemFeedIds(null, {
      community_id: community.id,
      feed_type: 'any',
      limit: 100,
    })
    const anonymousIds = new Set(anonymousPage.results.map(row => row.id))
    expect(anonymousIds.has(visible.itemId)).toBe(true)
    expect(anonymousIds.has(globallyBlocked.itemId)).toBe(false)
    expect(anonymousIds.has(viewerBlocked.itemId)).toBe(true)
  })
})
