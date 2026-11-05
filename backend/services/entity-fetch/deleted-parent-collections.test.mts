import { describe, expect, it } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestUser,
  followRssFeed,
  insertTestRssFeedDirect,
  insertUserSavedRssFeedItem,
  softDeleteRssFeedItemsForTest,
  updateRssFeedFollowCreatedAt,
} from '@voucha/test-helpers'
import { softDeleteLocalRssFeeds } from '../../test-helpers/data-stores/psql/rss-feeds.mts'
import { getUserRssFeedsCollection } from './get-rss-feeds-collection.mts'
import { getUserRssFeedItemsCollection } from './profile-collections-rss-feed-items.mts'

describe('profile collections past deleted parents', () => {
  it('keeps the next followed feed when a deleted feed sits between follows', async () => {
    const user = await createTestUser()
    const feeds = []
    for (const title of ['newest', 'deleted', 'oldest']) {
      const feed = await insertTestRssFeedDirect({
        title: `${title}-${crypto.randomUUID()}`,
      })
      await followRssFeed(user, feed.id)
      feeds.push(feed.id)
    }
    await updateRssFeedFollowCreatedAt(user.id, feeds[0]!, new Date('2026-03-03T00:00:00Z'))
    await updateRssFeedFollowCreatedAt(user.id, feeds[1]!, new Date('2026-03-02T00:00:00Z'))
    await updateRssFeedFollowCreatedAt(user.id, feeds[2]!, new Date('2026-03-01T00:00:00Z'))
    await softDeleteLocalRssFeeds([feeds[1]!])

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await getUserRssFeedsCollection(user.id, 'following', { limit: 1, after })
      seen.push(...page.results.map(feed => feed.id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([feeds[0]!, feeds[2]!])
    expect(emptyContinuation).toBe(true)
  })

  it('keeps the next saved item when a deleted item sits between saves', async () => {
    const user = await createTestUser()
    const feed = await insertTestRssFeedDirect({
      title: `saved-${crypto.randomUUID()}`,
    })
    const items = []
    for (let itemNumber = 0; itemNumber < 3; itemNumber++) {
      const item = await createTestRssFeedItemWithUrl(feed.id)
      await insertUserSavedRssFeedItem(user.id, item.id)
      items.push(item.id)
    }
    await softDeleteRssFeedItemsForTest([items[1]!])

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await getUserRssFeedItemsCollection(user.id, 'saved', { limit: 1, after })
      seen.push(...page.results.map(item => item.id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([items[2]!, items[0]!])
    expect(emptyContinuation).toBe(true)
  })
})
