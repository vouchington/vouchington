import { expect, it, describe } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from './list.mts'
import { deleteNotification } from './mutations.mts'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { addUrl } from '@services/urls'
import {
  insertNotificationTestRssFeedItem,
  rssFeedItemContentSha256,
} from './test-helpers/rss-feed-items.mts'
import {
  addCategoryToRssFeedItem,
  createTestTopic,
  createTestUser,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
} from '@voucha/test-helpers'

describe('reconcile-rss-feed-item', () => {
  function closedSubscriptionWindow() {
    const entityCreatedAt = new Date(Date.now() - 2_000)
    return {
      subscribedAt: new Date(entityCreatedAt.getTime() - 1_000),
      entityCreatedAt,
      unsubscribedAt: new Date(entityCreatedAt.getTime() + 1_000),
    }
  }

  async function createFeedSubscribers(feedId: string, count: number, createdAt: Date) {
    const subscribers = await Promise.all(
      Array.from({ length: count }, async () => await createTestUser()),
    )
    await Promise.all(
      subscribers.map(async subscriber => {
        await bookmarkEntity(subscriber, 'rss_feed', { id: feedId }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__rss_feed',
          subscriber.id,
          feedId,
          createdAt,
        )
      }),
    )
    return subscribers
  }

  it('does not recreate an RSS notification after the user deletes it', async () => {
    const subscriber = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    if (!subscriber || !feed) throw new Error('Failed to create test entities')

    await bookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      new Date(Date.now() - 1_000),
    )

    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: `guid-${Date.now()}`,
        title: 'New RSS Item',
        link: `https://example.com/items/${Date.now()}`,
        content: 'Body',
        contentSnippet: 'Body',
        categories: [],
        creator: 'Tester',
      },
    ])

    await reconcileNotificationsForRssFeedItem(item!.id)

    const initialNotifications = await listNotifications(subscriber.id)
    const notificationId = initialNotifications.results[0]?.id
    expect(notificationId).toBeTruthy()

    await deleteNotification(subscriber.id, notificationId!)
    await reconcileNotificationsForRssFeedItem(item!.id)

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(0)
  })

  it('creates a delayed RSS notification for an item created before unsubscribing from a feed', async () => {
    const subscriber = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    if (!subscriber || !feed) throw new Error('Failed to create test entities')
    const { subscribedAt, entityCreatedAt, unsubscribedAt } = closedSubscriptionWindow()

    await bookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      subscribedAt,
    )
    const itemId = await insertNotificationTestRssFeedItem(
      feed.id,
      'Delayed RSS item',
      entityCreatedAt,
    )

    await unbookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      unsubscribedAt,
    )
    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })
    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.rss_feed_item_id).toBe(itemId)
  })

  it('creates a delayed RSS notification for an item matching a topic before unsubscribing', async () => {
    const subscriber = await createTestUser()
    const topic = await createTestTopic()
    const feed = await insertTestRssFeedDirect({})
    if (!subscriber || !feed) throw new Error('Failed to create test entities')
    const { subscribedAt, entityCreatedAt, unsubscribedAt } = closedSubscriptionWindow()

    await bookmarkEntity(subscriber, 'topic', { id: topic.id }, 'subscribe_rss_feed_items')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe_rss_feed_items__topic',
      subscriber.id,
      topic.id,
      subscribedAt,
    )
    const itemId = await insertNotificationTestRssFeedItem(
      feed.id,
      'Delayed topic RSS item',
      entityCreatedAt,
    )
    await addCategoryToRssFeedItem(itemId, topic.id)

    await unbookmarkEntity(subscriber, 'topic', { id: topic.id }, 'subscribe_rss_feed_items')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe_rss_feed_items__topic',
      subscriber.id,
      topic.id,
      unsubscribedAt,
    )
    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 1,
      pruned: 0,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.rss_feed_item_id).toBe(itemId)
  })

  it('does not notify feed subscribers for items created after unsubscribing', async () => {
    const subscriber = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    if (!subscriber || !feed) throw new Error('Failed to create test entities')

    await bookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      new Date(Date.now() - 2_000),
    )
    await unbookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationDeletedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      new Date(Date.now() - 1_000),
    )

    const itemId = await insertNotificationTestRssFeedItem(feed.id, 'RSS item after unsubscribe')
    await reconcileNotificationsForRssFeedItem(itemId)

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(0)
  })

  it('reconciles existing RSS items with pre-1970 publisher dates using fetch time', async () => {
    const subscriber = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    if (!subscriber || !feed) throw new Error('Failed to create test entities')

    await bookmarkEntity(subscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      subscriber.id,
      feed.id,
      new Date(Date.now() - 1_000),
    )

    const random = Math.random().toString(36).slice(2, 15)
    const url = await addUrl(null, `https://example.com/legacy-year-one-${random}`, {
      content_type: 'text/html',
    })
    const itemData = {
      guid: `legacy-year-one-${random}`,
      title: 'Legacy RSS Item',
      link: url!.url,
      pubDate: 'Mon, 01 Jan 0001 00:00:00 +0000',
    }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url!.id,
      guid: itemData.guid,
      itemData,
      contentSha256: rssFeedItemContentSha256(itemData),
    })

    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 1,
    })

    const notifications = await listNotifications(subscriber.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.rss_feed_item_id).toBe(itemId)
  })

  it('creates RSS feed item notifications in bounded recipient batches', async () => {
    const feed = await insertTestRssFeedDirect({})
    if (!feed) throw new Error('Failed to create RSS feed')
    const itemCreatedAt = new Date(Date.now() + 2_000)
    const subscribers = await createFeedSubscribers(
      feed.id,
      5,
      new Date(itemCreatedAt.getTime() - 1_000),
    )
    const itemId = await insertNotificationTestRssFeedItem(
      feed.id,
      'Batched RSS item',
      itemCreatedAt,
    )
    const pushedBatches: number[] = []

    const result = await reconcileNotificationsForRssFeedItem(itemId, {
      batchSize: 2,
      onCreatedNotifications: batch => {
        pushedBatches.push(batch.length)
      },
    })

    expect(result).toMatchObject({ created: 5, pruned: 0 })
    expect('createdNotifications' in result).toBe(false)
    expect(pushedBatches).toEqual([2, 2, 1])
    await expect(
      reconcileNotificationsForRssFeedItem(itemId, { batchSize: 2 }),
    ).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })
    await Promise.all(
      subscribers.map(async subscriber => {
        const notifications = await listNotifications(subscriber.id)
        expect(notifications.results).toHaveLength(1)
      }),
    )
  })
})
