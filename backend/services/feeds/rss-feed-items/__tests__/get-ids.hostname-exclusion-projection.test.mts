import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  blockUrlHostname,
  muteUrlHostname,
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

async function addItem(feedId: string, hostname: string, isBlocked = false) {
  const hostnameId = await insertTestUrlHostname({ hostname, is_blocked: isBlocked })
  const guid = randomUUID()
  const urlId = await insertTestUrl({ url: `https://${hostname}/${guid}`, hostnameId })
  const itemId = await insertTestRssFeedItem({
    rssFeedId: feedId,
    urlId,
    guid,
    itemData: { title: hostname },
    contentSha256: createHash('sha256').update(hostname).digest(),
  })
  return { hostnameId, itemId }
}

describe('RSS hostname exclusions', () => {
  it('keeps viewer subdomain exclusions and global blocks independent', async () => {
    const viewer = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followRssFeed(viewer, feedId)
    const suffix = randomUUID()

    const visible = await addItem(feedId, `visible-${suffix}.example.com`)
    const globallyBlocked = await addItem(feedId, `global-${suffix}.example.com`, true)
    const parent = await insertTestUrlHostname({ hostname: `parent-${suffix}.example.com` })
    const viewerBlocked = await addItem(feedId, `sub.parent-${suffix}.example.com`)
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

  it.each([
    { operation: 'mute', exclude: muteUrlHostname },
    { operation: 'block', exclude: blockUrlHostname },
  ])('matches underscores literally for hostname $operation', async ({ exclude }) => {
    const viewer = await createTestUser()
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feedId)
    const suffix = randomUUID()
    const parent = `foo_bar-${suffix}.example.com`
    const [exact, descendant, different] = await Promise.all([
      addItem(feedId, parent),
      addItem(feedId, `sub.${parent}`),
      addItem(feedId, `sub.fooxbar-${suffix}.example.com`),
    ])
    await exclude(viewer, exact.hostnameId)

    const page = await getRssFeedItemFeedIds(viewer, { feed_type: 'follow_rss_feeds' })
    expect(page.results.map(row => row.entity_id)).toEqual([different.itemId])
    expect(page.results.map(row => row.entity_id)).not.toContain(descendant.itemId)
  })
})
