import { describe, expect, it } from 'vitest'
import { createPostRemovedNotification } from './create-post-removed-notification.mts'
import { listNotifications } from './list.mts'
import { deleteNotification, markNotificationRead } from './mutations.mts'
import { reconcileNotificationsForPost } from './reconcile-post.mts'
import { reconcileNotificationsForRssFeedItem } from './reconcile-rss-feed-item.mts'
import {
  createTestManualPostNotification,
  createTestManualRssFeedItemNotification,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  getNotificationById,
  hardDeleteTestPost,
  markTestNotificationPushed,
  restoreRssFeedItemsForTest,
  setPostModerationFlaggedForTest,
  softDeleteRssFeedItemsForTest,
} from '@voucha/test-helpers'

describe('content notification visibility reconciliation', () => {
  it('prunes and restores manual post sends while preserving delivery state', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })
    await markNotificationRead(recipient.id, notificationId)
    await markTestNotificationPushed(notificationId)

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({ pruned: 1 })
    expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      delete_reason: 'system_pruned',
      read_at: expect.any(Date),
      pushed_at: expect.any(Date),
    })

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: false })
    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })
    expect((await listNotifications(recipient.id)).results).toHaveLength(1)
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      deleted_at: null,
      delete_reason: null,
      read_at: expect.any(Date),
      pushed_at: expect.any(Date),
    })
  })

  it('does not restore a user-dismissed manual post send', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })

    await expect(deleteNotification(recipient.id, notificationId)).resolves.toBe(true)
    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
    await reconcileNotificationsForPost(post.id)
    await setPostModerationFlaggedForTest({ postId: post.id, flagged: false })
    await reconcileNotificationsForPost(post.id)

    expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      delete_reason: 'user_deleted',
      deleted_at: expect.any(Date),
    })
  })

  it('keeps manual sends visible for registered-audience posts', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public', broadcast: 'users' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })

    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({ pruned: 0 })
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      deleted_at: null,
      delete_reason: null,
    })
  })

  it('prunes a hard-deleted post through its retained publication target', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public' })
    const notificationId = await createTestManualPostNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      postId: post.id,
    })

    await hardDeleteTestPost(post.id)
    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({ pruned: 1 })
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      post_id: null,
      publication_post_id: post.id,
      delete_reason: 'system_pruned',
    })
  })

  it('keeps post removal notifications visible during content reconciliation', async () => {
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public' })
    await createPostRemovedNotification(author.id, post.id)

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
    await reconcileNotificationsForPost(post.id)

    const notifications = await listNotifications(author.id)
    expect(notifications.results).toHaveLength(1)
    expect(notifications.notifications[notifications.results[0]!.id]?.title).toBe(
      'Your post has been removed',
    )
  })

  it('prunes and restores manual RSS sends while preserving delivery state', async () => {
    const sender = await createTestUser()
    const recipient = await createTestUser()
    const topic = await createTestTopic()
    const feedId = await createTestRssFeedWithTiming(topic.id)
    const item = await createTestRssFeedItemWithUrl(feedId)
    const notificationId = await createTestManualRssFeedItemNotification({
      userId: recipient.id,
      sentByUserId: sender.id,
      rssFeedItemId: item.id,
    })
    await markNotificationRead(recipient.id, notificationId)
    await markTestNotificationPushed(notificationId)

    await softDeleteRssFeedItemsForTest([item.id])
    await expect(reconcileNotificationsForRssFeedItem(item.id)).resolves.toMatchObject({
      pruned: 1,
    })
    expect((await listNotifications(recipient.id)).results).toHaveLength(0)
    await restoreRssFeedItemsForTest([item.id])
    await expect(reconcileNotificationsForRssFeedItem(item.id)).resolves.toMatchObject({
      created: 0,
      pruned: 0,
    })

    expect((await listNotifications(recipient.id)).results).toHaveLength(1)
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      deleted_at: null,
      delete_reason: null,
      read_at: expect.any(Date),
      pushed_at: expect.any(Date),
    })
  })
})
