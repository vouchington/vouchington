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

describe('searchRssFeedItems read filter', () => {
  it('returns only read items when read: true', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)

    const topicId = await insertTestTopic({
      name: `Read Filter Topic ${random}`,
      slug: `read-filter-topic-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Read Filter Feed ${random}` })

    const urlId1 = await createTestUrlWithHostname()
    const urlId2 = await createTestUrlWithHostname()

    const readItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlId1,
      guid: `read-filter-read-${random}`,
      itemData: { title: `Read Item ${random}` },
      contentSha256: createHash('sha256').update(`read-${random}`).digest(),
    })
    const unreadItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlId2,
      guid: `read-filter-unread-${random}`,
      itemData: { title: `Unread Item ${random}` },
      contentSha256: createHash('sha256').update(`unread-${random}`).digest(),
    })

    await markRead(user!.id, 'rss_feed_item', readItemId)

    const { results } = await searchRssFeedItems({ read: true, currentUserId: user!.id })
    const ids = results.map(r => r.id)

    expect(ids).toContain(readItemId)
    expect(ids).not.toContain(unreadItemId)
  })

  it('returns only unread items when read: false', async () => {
    const user = await createTestUser()
    const random = Math.random().toString(36).slice(2, 8)

    const topicId = await insertTestTopic({
      name: `Unread Filter Topic ${random}`,
      slug: `unread-filter-topic-${random}`,
      createdById: user!.id,
    })
    const feedId = await insertTestRssFeed({ topicId, title: `Unread Filter Feed ${random}` })

    const urlId1 = await createTestUrlWithHostname()
    const urlId2 = await createTestUrlWithHostname()

    const readItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlId1,
      guid: `unread-filter-read-${random}`,
      itemData: { title: `Read Item ${random}` },
      contentSha256: createHash('sha256').update(`unread-read-${random}`).digest(),
    })
    const unreadItemId = await insertTestRssFeedItem({
      rssFeedId: feedId,
      urlId: urlId2,
      guid: `unread-filter-unread-${random}`,
      itemData: { title: `Unread Item ${random}` },
      contentSha256: createHash('sha256').update(`unread-unread-${random}`).digest(),
    })

    await markRead(user!.id, 'rss_feed_item', readItemId)

    const { results } = await searchRssFeedItems({ read: false, currentUserId: user!.id })
    const ids = results.map(r => r.id)

    expect(ids).toContain(unreadItemId)
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
