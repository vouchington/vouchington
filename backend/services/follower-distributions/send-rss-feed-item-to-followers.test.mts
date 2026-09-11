import { describe, expect, it } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications, reconcileNotificationsForRssFeedItem } from '@services/notifications'
import {
  followUser,
  getNotificationById,
  createTestUser,
  createTestTopic,
  createTestRssFeedWithTiming,
  createTestRssFeedItemWithUrl,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { sendRssFeedItemToFollowers } from './create.mts'
import { processFollowerDistributionChunk } from './process.mts'

describe('sendRssFeedItemToFollowers', () => {
  it('creates manual-send notifications for RSS feed items', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await followUser(follower, sender)
    const result = await sendRssFeedItemToFollowers(sender, item.id, {
      audience: 'all_followers',
    })

    expect(result.status).toBe('accepted')

    const chunk = await processFollowerDistributionChunk(result.distribution_id)
    expect(chunk.processed).toBe(1)
    expect(chunk.notificationsToDeliver[0]?.userId).toBe(follower.id)

    const notification = await getNotificationById(chunk.notificationsToDeliver[0]!.notificationId)

    expect(notification?.delivery_type).toBe('manual_send')
    expect(notification?.sent_by_user_id).toBe(sender.id)
    expect(notification?.rss_feed_item_id).toBe(item.id)
  })

  it('keeps subscription and manual-send notifications for the same RSS feed item', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    await followUser(follower, sender)
    await bookmarkEntity(follower, 'rss_feed', { id: feedId }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__rss_feed',
      follower.id,
      feedId,
      new Date(Date.now() - 1_000),
    )

    const item = await createTestRssFeedItemWithUrl(feedId)
    await reconcileNotificationsForRssFeedItem(item.id)

    const beforeSend = await listNotifications(follower.id)
    expect(beforeSend.results).toHaveLength(1)
    await expect(getNotificationById(beforeSend.results[0]!.id)).resolves.toMatchObject({
      delivery_type: 'subscription',
      rss_feed_item_id: item.id,
    })

    const result = await sendRssFeedItemToFollowers(sender, item.id, {
      audience: 'all_followers',
    })

    expect(result.status).toBe('accepted')
    const chunk = await processFollowerDistributionChunk(result.distribution_id)
    expect(chunk.notificationsToDeliver).toHaveLength(1)

    const notifications = await listNotifications(follower.id)
    const rows = await Promise.all(
      notifications.results.map(notification => getNotificationById(notification.id)),
    )
    expect(
      rows
        .flatMap(notification =>
          notification && notification.rss_feed_item_id === item.id
            ? [notification.delivery_type]
            : [],
        )
        .sort(),
    ).toEqual(['manual_send', 'subscription'])
  })

  it('rejects sending the same RSS feed item twice within 24 hours', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    await followUser(follower, sender)

    await sendRssFeedItemToFollowers(sender, item.id, {
      audience: 'all_followers',
    })

    await expect(
      sendRssFeedItemToFollowers(sender, item.id, {
        audience: 'all_followers',
      }),
    ).rejects.toThrow('You can only send this once per day')
  })
})
