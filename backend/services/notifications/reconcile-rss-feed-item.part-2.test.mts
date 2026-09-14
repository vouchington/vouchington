import { describe, expect, it } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from './list.mts'
import { markNotificationRead } from './mutations.mts'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'
import { insertNotificationTestRssFeedItem } from '../../test-helpers/services/notifications/rss-feed-items.mts'
import {
  createTestUser,
  insertTestRssFeedDirect,
  setEntityRelationCreatedAt,
  softDeleteRssFeedItemsForTest,
} from '@voucha/test-helpers'

describe('reconcile-rss-feed-item deletion cleanup', () => {
  it('prunes unread RSS notifications for deleted items while preserving read rows', async () => {
    const unreadSubscriber = await createTestUser()
    const readSubscriber = await createTestUser()
    const feed = await insertTestRssFeedDirect({})
    if (!unreadSubscriber || !readSubscriber || !feed) throw new Error('Failed to create fixtures')

    await bookmarkEntity(unreadSubscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    await bookmarkEntity(readSubscriber, 'rss_feed', { id: feed.id }, 'subscribe')
    const subscribedAt = new Date(Date.now() - 60_000)
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      unreadSubscriber.id,
      feed.id,
      subscribedAt,
    )
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      readSubscriber.id,
      feed.id,
      subscribedAt,
    )

    const itemId = await insertNotificationTestRssFeedItem(feed.id, 'Deleted RSS item')
    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 2,
      pruned: 0,
    })

    const readNotificationsBeforeDelete = await listNotifications(readSubscriber.id)
    await markNotificationRead(readSubscriber.id, readNotificationsBeforeDelete.results[0]!.id)
    await softDeleteRssFeedItemsForTest([itemId])

    await expect(reconcileNotificationsForRssFeedItem(itemId)).resolves.toMatchObject({
      created: 0,
      pruned: 2,
    })

    expect((await listNotifications(unreadSubscriber.id)).results).toHaveLength(0)
    expect((await listNotifications(readSubscriber.id)).results).toHaveLength(0)
  })
})
