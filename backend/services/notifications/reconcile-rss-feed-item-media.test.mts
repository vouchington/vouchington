import { createHash } from 'node:crypto'
import { expect, it, describe } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from './list.mts'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'
import { addUrl } from '@services/urls'
import {
  createRandomString,
  createTestUser,
  insertTestRssFeedDirect,
  insertTestRssFeedItem,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'

describe('reconcile-rss-feed-item media descriptions', () => {
  it('uses media descriptions for RSS notification bodies when item titles are missing', async () => {
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

    const random = createRandomString(10)
    const url = await addUrl(null, `https://example.com/rss-notification-media-${random}`, {
      content_type: 'text/html',
    })
    const itemData = {
      guid: `rss-notification-media-${random}`,
      link: url!.url,
      description: '<p>&nbsp;</p>',
      'media:description': 'Notification body from YouTube media description.',
    }
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url!.id,
      guid: itemData.guid,
      itemData,
      contentSha256: createHash('sha256').update(JSON.stringify(itemData)).digest(),
    })

    await reconcileNotificationsForRssFeedItem(itemId)

    const notifications = await listNotifications(subscriber.id)
    const notification = notifications.notifications[notifications.results[0]!.id]!
    expect(notification.body).toBe('Notification body from YouTube media description.')
  })
})
