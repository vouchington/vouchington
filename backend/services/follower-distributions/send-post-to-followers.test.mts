import { describe, expect, it } from 'vitest'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications, reconcileNotificationsForPost } from '@services/notifications'
import {
  followUser,
  getNotificationById,
  createTestUser,
  createTestPost,
  deleteTestNotificationPushIntent,
  getTestNotificationPushIntent,
  setPostModerationFlaggedForTest,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { processFollowerDistributionChunk } from './process.mts'
import { sendPostToFollowers } from './create.mts'
import { parseSendFollowersInput } from './send-followers-input.mts'
import { MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS } from './types.mts'

describe('sendPostToFollowers', () => {
  it('creates manual-send notifications for the selected followers of a post', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, post_type: 'discussion', privacy: 'public' })
    const result = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
    })

    expect(result.status).toBe('accepted')

    const chunk = await processFollowerDistributionChunk(result.distribution_id, {
      deferCursorUpdate: true,
    })
    expect(chunk.processed).toBe(1)
    expect(chunk.notificationsToDeliver).toHaveLength(1)
    expect(chunk.notificationsToDeliver[0]?.userId).toBe(follower.id)

    const notificationId = chunk.notificationsToDeliver[0]!.notificationId
    const notification = await getNotificationById(notificationId)

    expect(notification?.delivery_type).toBe('manual_send')
    expect(notification?.sent_by_user_id).toBe(sender.id)
    expect(notification?.post_id).toBe(post.id)

    await deleteTestNotificationPushIntent(follower.id, notificationId)
    await expect(
      getTestNotificationPushIntent(follower.id, notificationId),
    ).resolves.toBeUndefined()
    const replay = await processFollowerDistributionChunk(result.distribution_id, {
      deferCursorUpdate: true,
    })
    expect(replay.notificationsToDeliver).toEqual(chunk.notificationsToDeliver)
    await expect(getTestNotificationPushIntent(follower.id, notificationId)).resolves.toMatchObject(
      { status: 'pending' },
    )
  })

  it('hides a manual send created through the follower route when its post is no longer eligible', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })
    const result = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
    })
    const chunk = await processFollowerDistributionChunk(result.distribution_id)
    const notificationId = chunk.notificationsToDeliver[0]!.notificationId

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
    await expect(reconcileNotificationsForPost(post.id)).resolves.toMatchObject({ pruned: 1 })
    await expect(getNotificationById(notificationId)).resolves.toMatchObject({
      delete_reason: 'system_pruned',
      deleted_at: expect.any(Date),
    })
    expect((await listNotifications(follower.id)).results).toHaveLength(0)
  })

  it('keeps subscription and manual-send notifications for the same post', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sender)
    await bookmarkEntity(follower, 'user', { id: creator.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      follower.id,
      creator.id,
      new Date(Date.now() - 1_000),
    )

    const post = await createTestPost({ user: creator, post_type: 'discussion', privacy: 'public' })
    await reconcileNotificationsForPost(post.id)

    const beforeSend = await listNotifications(follower.id)
    expect(beforeSend.results).toHaveLength(1)
    await expect(getNotificationById(beforeSend.results[0]!.id)).resolves.toMatchObject({
      delivery_type: 'subscription',
      post_id: post.id,
    })

    const result = await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
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
          notification && notification.post_id === post.id ? [notification.delivery_type] : [],
        )
        .sort(),
    ).toEqual(['manual_send', 'subscription'])
  })

  it('accepts selected recipients at the configured maximum', () => {
    const recipientIds = Array.from(
      { length: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )

    expect(
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: recipientIds,
      }),
    ).toEqual({
      audience: 'selected_followers',
      recipient_user_ids: recipientIds,
    })
  })

  it('rejects selected recipients over the configured maximum', () => {
    const recipientIds = Array.from(
      { length: MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )

    expect(() =>
      parseSendFollowersInput({
        audience: 'selected_followers',
        recipient_user_ids: recipientIds,
      }),
    ).toThrow(`at most ${MAX_SELECTED_FOLLOWER_DISTRIBUTION_RECIPIENTS}`)
  })

  it('rejects selected recipients who are not current followers', async () => {
    const sender = await createTestUser()
    const nonFollower = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: [nonFollower.id],
      }),
    ).rejects.toThrow('Selected users must be current followers')
  })

  it('rejects invalid selected recipient UUIDs before querying followers', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: ['not-a-uuid'],
      }),
    ).rejects.toThrow('recipient_user_ids must contain valid UUIDs')
  })

  it('rejects duplicate selected recipients at the service boundary', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sender)
    const post = await createTestPost({ user: creator, privacy: 'public' })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: [follower.id, follower.id],
      }),
    ).rejects.toThrow('recipient_user_ids must not contain duplicates')
  })

  it('rejects empty selected recipients at the service boundary', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator, privacy: 'public' })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: [],
      }),
    ).rejects.toThrow('recipient_user_ids must include at least one follower')
  })

  it('rejects sending posts that are not broadly visible', async () => {
    const sender = await createTestUser()
    const creator = await createTestUser()
    const post = await createTestPost({
      user: creator,
      privacy: 'public',
      broadcast: 'mutual_followers',
    })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'all_followers',
      }),
    ).rejects.toThrow('Only broadly visible posts can be sent')
  })

  it('rejects sending the same post twice within 24 hours', async () => {
    const sender = await createTestUser()
    const follower = await createTestUser()
    const creator = await createTestUser()
    await followUser(follower, sender)

    const post = await createTestPost({ user: creator, post_type: 'discussion', privacy: 'public' })
    await sendPostToFollowers(sender, post.id, {
      audience: 'selected_followers',
      recipient_user_ids: [follower.id],
    })

    await expect(
      sendPostToFollowers(sender, post.id, {
        audience: 'selected_followers',
        recipient_user_ids: [follower.id],
      }),
    ).rejects.toThrow('You can only send this once per day')
  })
})
