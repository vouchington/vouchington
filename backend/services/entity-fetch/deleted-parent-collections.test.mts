import { describe, expect, it } from 'vitest'
import {
  createTestRssFeedItemWithUrl,
  createTestTopic,
  createTestUser,
  followRssFeed,
  insertTestRssFeedDirect,
  insertUserSavedRssFeedItem,
  setEntityRelationCreatedAt,
  softDeleteRssFeedItemsForTest,
  updateRssFeedFollowCreatedAt,
} from '@voucha/test-helpers'
import { softDeleteLocalRssFeeds } from '../../test-helpers/data-stores/psql/rss-feeds.mts'
import { softDeleteTopic } from '../../test-helpers/entities/topics/deletion.mts'
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
    let continuationWasFull = true
    for (let step = 0; step < 6; step++) {
      const page = await getUserRssFeedsCollection(user.id, 'following', { limit: 1, after })
      seen.push(...page.results.map(feed => feed.id))
      if (page.page_info.has_next_page && page.results.length !== 1) continuationWasFull = false
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([feeds[0]!, feeds[2]!])
    expect(continuationWasFull).toBe(true)
  })

  it('does not let a feed with a deleted topic consume a followed-feed page slot', async () => {
    const user = await createTestUser()
    const topics = await Promise.all(
      ['newest-deleted-topic', 'middle', 'oldest'].map(name =>
        createTestTopic({ user, name: `${name}-${crypto.randomUUID()}` }),
      ),
    )
    const feeds = []
    for (const [index, topic] of topics.entries()) {
      const feed = await insertTestRssFeedDirect({
        title: `topic-${index}-${crypto.randomUUID()}`,
        topicId: topic.id,
      })
      await followRssFeed(user, feed.id)
      feeds.push(feed.id)
    }
    for (const [index, feedId] of feeds.entries()) {
      await updateRssFeedFollowCreatedAt(
        user.id,
        feedId,
        new Date(`2026-03-04T00:00:0${3 - index}Z`),
      )
    }
    await softDeleteTopic(topics[0]!.id, user.id)

    const page = await getUserRssFeedsCollection(user.id, 'following', { limit: 2 })

    expect(page.results.map(feed => feed.id)).toEqual([feeds[1]!, feeds[2]!])
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
    let continuationWasFull = true
    for (let step = 0; step < 6; step++) {
      const page = await getUserRssFeedItemsCollection(user.id, 'saved', { limit: 1, after })
      seen.push(...page.results.map(item => item.id))
      if (page.page_info.has_next_page && page.results.length !== 1) continuationWasFull = false
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([items[2]!, items[0]!])
    expect(continuationWasFull).toBe(true)
  })

  it('fills a saved-item page after the ranked primary source topic is deleted', async () => {
    const user = await createTestUser()
    const topics = await Promise.all(
      ['deleted-source', 'visible-source-one', 'visible-source-two'].map(name =>
        createTestTopic({ user, name: `${name}-${crypto.randomUUID()}` }),
      ),
    )
    const feeds = []
    for (const [index, topic] of topics.entries()) {
      feeds.push(
        await insertTestRssFeedDirect({
          title: `saved-source-${index}-${crypto.randomUUID()}`,
          topicId: topic.id,
        }),
      )
    }
    const items = []
    for (const feed of feeds) {
      const item = await createTestRssFeedItemWithUrl(feed.id)
      await insertUserSavedRssFeedItem(user.id, item.id)
      items.push(item.id)
    }
    await setEntityRelationCreatedAt(
      'relation__user__save__rss_feed_item',
      user.id,
      items[0]!,
      new Date('2026-03-04T00:00:03Z'),
    )
    await setEntityRelationCreatedAt(
      'relation__user__save__rss_feed_item',
      user.id,
      items[1]!,
      new Date('2026-03-04T00:00:02Z'),
    )
    await setEntityRelationCreatedAt(
      'relation__user__save__rss_feed_item',
      user.id,
      items[2]!,
      new Date('2026-03-04T00:00:01Z'),
    )
    await softDeleteTopic(topics[0]!.id, user.id)

    const page = await getUserRssFeedItemsCollection(user.id, 'saved', { limit: 2 })

    expect(page.results.map(item => item.id)).toEqual([items[1]!, items[2]!])
  })
})
