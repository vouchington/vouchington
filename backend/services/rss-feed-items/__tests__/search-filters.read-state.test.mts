import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  createTestUrlWithHostname,
  insertTestRssFeed,
  insertTestRssFeedItem,
  insertTestStory,
  insertTestTopic,
  setTestItemStoryId,
} from '@voucha/test-helpers'
import { markRead } from '@services/read-states'
import { searchRssFeedItems } from '../search.mts'

const readStateFilterLabels = {
  read: {
    namePrefix: 'Read Filter',
    slugPrefix: 'read-filter',
    readContentKey: 'read',
    unreadContentKey: 'unread',
    peerTitlePrefix: 'Read Peer',
    peerContentKey: 'read-peer',
    markPeersRead: true,
  },
  unread: {
    namePrefix: 'Unread Filter',
    slugPrefix: 'unread-filter',
    readContentKey: 'unread-read',
    unreadContentKey: 'unread-unread',
    peerTitlePrefix: 'Unread Peer',
    peerContentKey: 'unread-peer',
    markPeersRead: false,
  },
} as const

async function insertReadStateFilterFixture(filterCase: keyof typeof readStateFilterLabels) {
  const labels = readStateFilterLabels[filterCase]
  const user = await createTestUser()
  const random = Math.random().toString(36).slice(2, 8)

  const topicId = await insertTestTopic({
    name: `${labels.namePrefix} Topic ${random}`,
    slug: `${labels.slugPrefix}-topic-${random}`,
    createdById: user.id,
  })
  const feedId = await insertTestRssFeed({ topicId, title: `${labels.namePrefix} Feed ${random}` })

  const urlId1 = await createTestUrlWithHostname()
  const urlId2 = await createTestUrlWithHostname()
  const ownedCreatedAt = new Date(Date.now() - 60_000)

  const readItemId = await insertTestRssFeedItem({
    createdAt: ownedCreatedAt,
    rssFeedId: feedId,
    urlId: urlId1,
    guid: `${labels.slugPrefix}-read-${random}`,
    itemData: { title: `Read Item ${random}` },
    contentSha256: createHash('sha256').update(`${labels.readContentKey}-${random}`).digest(),
  })
  const unreadItemId = await insertTestRssFeedItem({
    createdAt: ownedCreatedAt,
    rssFeedId: feedId,
    urlId: urlId2,
    guid: `${labels.slugPrefix}-unread-${random}`,
    itemData: { title: `Unread Item ${random}` },
    contentSha256: createHash('sha256').update(`${labels.unreadContentKey}-${random}`).digest(),
  })

  await markRead(user.id, 'rss_feed_item', readItemId)

  const peerTopicId = await insertTestTopic({
    name: `${labels.namePrefix} Peer Topic ${random}`,
    slug: `${labels.slugPrefix}-peer-topic-${random}`,
    createdById: user.id,
  })
  const peerFeedId = await insertTestRssFeed({
    topicId: peerTopicId,
    title: `${labels.namePrefix} Peer Feed ${random}`,
  })
  const peerUrlId = await createTestUrlWithHostname()
  const peerIds = await Promise.all(
    Array.from({ length: 11 }, (_, index) =>
      insertTestRssFeedItem({
        rssFeedId: peerFeedId,
        urlId: peerUrlId,
        guid: `${labels.slugPrefix}-peer-${random}-${index}`,
        itemData: { title: `${labels.peerTitlePrefix} ${random} ${index}` },
        contentSha256: createHash('sha256')
          .update(`${labels.peerContentKey}-${random}-${index}`)
          .digest(),
      }),
    ),
  )
  if (labels.markPeersRead) {
    await Promise.all(peerIds.map(peerId => markRead(user.id, 'rss_feed_item', peerId)))
  }

  return { userId: user.id, feedId, readItemId, unreadItemId }
}

describe('searchRssFeedItems read filter', () => {
  it('returns only read items when read: true', async () => {
    const { userId, feedId, readItemId, unreadItemId } = await insertReadStateFilterFixture('read')

    const unscoped = await searchRssFeedItems({ read: true, currentUserId: userId })
    expect(unscoped.results.map(result => result.id)).not.toContain(readItemId)

    const { results } = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      read: true,
      currentUserId: userId,
    })
    const ids = results.map(r => r.id)

    expect(ids).toEqual([readItemId])
    expect(ids).not.toContain(unreadItemId)
  })

  it('returns only unread items when read: false', async () => {
    const { userId, feedId, readItemId, unreadItemId } =
      await insertReadStateFilterFixture('unread')

    const unscoped = await searchRssFeedItems({ read: false, currentUserId: userId })
    expect(unscoped.results.map(result => result.id)).not.toContain(unreadItemId)

    const { results } = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      read: false,
      currentUserId: userId,
    })
    const ids = results.map(r => r.id)

    expect(ids).toEqual([unreadItemId])
    expect(ids).not.toContain(readItemId)
  })

  it('selects an eligible story sibling when the official item is filtered out', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)
    const topicId = await insertTestTopic({
      name: `Story Read Filter Topic ${random}`,
      slug: `story-read-filter-topic-${random}`,
      createdById: user.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Story Read Filter Feed ${random}` })
    const [officialUrlId, siblingUrlId] = await Promise.all([
      createTestUrlWithHostname(),
      createTestUrlWithHostname(),
    ])
    const [officialItemId, siblingItemId] = await Promise.all([
      insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: officialUrlId,
        guid: `official-filtered-${random}`,
        itemData: { title: `Official ${random}` },
        contentSha256: createHash('sha256').update(`official-${random}`).digest(),
      }),
      insertTestRssFeedItem({
        rssFeedId: feedId,
        urlId: siblingUrlId,
        guid: `sibling-eligible-${random}`,
        itemData: { title: `Sibling ${random}` },
        contentSha256: createHash('sha256').update(`sibling-${random}`).digest(),
      }),
    ])
    const story = await insertTestStory({ officialRssFeedItemId: officialItemId })
    await Promise.all([
      setTestItemStoryId(officialItemId, story.id),
      setTestItemStoryId(siblingItemId, story.id),
      markRead(user.id, 'rss_feed_item', siblingItemId),
    ])

    const { results } = await searchRssFeedItems({
      rss_feed_ids: [feedId],
      read: true,
      currentUserId: user.id,
    })
    expect(results.map(result => result.id)).toContain(siblingItemId)
    expect(results.map(result => result.id)).not.toContain(officialItemId)
  })
})
