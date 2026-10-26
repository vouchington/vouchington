import { describe, expect, it } from 'vitest'
import {
  reconcilePostContentNotificationVisibility,
  reconcileRssFeedItemContentNotificationVisibility,
} from './content-visibility-writes.mts'
import { deleteNotification } from './mutations.mts'
import { notificationsWorkConfig } from './work-limits.mts'
import { pagedDispatchConfig } from '@queues/notifications/enqueues/page-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestManualPostNotification,
  createTestManualRssFeedItemNotification,
  createTestPost,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  getNotificationById,
  restoreRssFeedItemsForTest,
  setPostModerationFlaggedForTest,
  softDeleteRssFeedItemsForTest,
} from '@voucha/test-helpers'

describe('bounded content visibility pages', () => {
  it('advances past an unchanged raw target page before changing the next post recipient', async () => {
    const restoreLimit = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      content_visibility_page_size: 3,
    })
    const restoreDispatcherLimit = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      notifications_page_size: 1,
    })
    try {
      const sender = await createTestUser()
      const author = await createTestUser()
      const post = await createTestPost({ user: author, privacy: 'public' })
      const recipients = (await Promise.all([createTestUser(), createTestUser()])).toSorted(
        (a, b) => a.id.localeCompare(b.id),
      )
      const firstId = await createTestManualPostNotification({
        userId: recipients[0]!.id,
        sentByUserId: sender.id,
        postId: post.id,
      })
      const secondId = await createTestManualPostNotification({
        userId: recipients[1]!.id,
        sentByUserId: sender.id,
        postId: post.id,
      })
      await deleteNotification(recipients[0]!.id, firstId)
      await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })

      const unchanged = await reconcilePostContentNotificationVisibility(post.id)
      expect(unchanged).toEqual({
        updated: 0,
        pruned: 0,
        nextCursor: { userId: recipients[0]!.id, notificationId: firstId },
      })
      const changed = await reconcilePostContentNotificationVisibility(
        post.id,
        unchanged.nextCursor,
      )
      expect(changed).toMatchObject({ updated: 1, pruned: 1 })
      expect(await getNotificationById(secondId)).toMatchObject({
        delete_reason: 'system_pruned',
      })
    } finally {
      restoreDispatcherLimit()
      restoreLimit()
    }
  })

  it('bounds post pages and restarts at the first recipient after a mid-run edit', async () => {
    const restoreLimit = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      content_visibility_page_size: 1,
    })
    try {
      const sender = await createTestUser()
      const author = await createTestUser()
      const post = await createTestPost({ user: author, privacy: 'public' })
      const recipients = await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
      const ids = await Promise.all(
        recipients.map(recipient =>
          createTestManualPostNotification({
            userId: recipient.id,
            sentByUserId: sender.id,
            postId: post.id,
          }),
        ),
      )

      await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
      const first = await reconcilePostContentNotificationVisibility(post.id)
      expect(first).toMatchObject({ updated: 1, pruned: 1, nextCursor: expect.any(Object) })
      const second = await reconcilePostContentNotificationVisibility(post.id, first.nextCursor)
      expect(second).toMatchObject({ updated: 1, pruned: 1, nextCursor: expect.any(Object) })
      const third = await reconcilePostContentNotificationVisibility(post.id, second.nextCursor)
      expect(third).toMatchObject({ updated: 1, pruned: 1, nextCursor: expect.any(Object) })

      await setPostModerationFlaggedForTest({ postId: post.id, flagged: false })
      const restoredFirst = await reconcilePostContentNotificationVisibility(post.id)
      expect(restoredFirst).toMatchObject({ updated: 1, pruned: 0, nextCursor: expect.any(Object) })
      expect(await getNotificationById(restoredFirst.nextCursor!.notificationId)).toMatchObject({
        deleted_at: null,
      })

      await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
      const restarted = await reconcilePostContentNotificationVisibility(post.id)
      expect(restarted).toMatchObject({ updated: 1, pruned: 1 })
      expect(restarted.nextCursor).toEqual(restoredFirst.nextCursor)
      const replayedOldPage = await reconcilePostContentNotificationVisibility(
        post.id,
        restoredFirst.nextCursor,
      )
      expect(replayedOldPage.updated).toBe(0)

      await setPostModerationFlaggedForTest({ postId: post.id, flagged: false })
      const restoreAgain = await reconcilePostContentNotificationVisibility(post.id)
      const restoreSecond = await reconcilePostContentNotificationVisibility(
        post.id,
        restoreAgain.nextCursor,
      )
      const restoreThird = await reconcilePostContentNotificationVisibility(
        post.id,
        restoreSecond.nextCursor,
      )
      expect(restoreThird.updated).toBe(1)
      for (const id of ids)
        expect(await getNotificationById(id)).toMatchObject({ deleted_at: null })
    } finally {
      restoreLimit()
    }
  })

  it('bounds RSS prune and restore across notification pages', async () => {
    const restoreLimit = overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
      content_visibility_page_size: 1,
    })
    try {
      const sender = await createTestUser()
      const topic = await createTestTopic()
      const feedId = await createTestRssFeedWithTiming(topic.id)
      const item = await createTestRssFeedItemWithUrl(feedId)
      const recipients = await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
      const ids = await Promise.all(
        recipients.map(recipient =>
          createTestManualRssFeedItemNotification({
            userId: recipient.id,
            sentByUserId: sender.id,
            rssFeedItemId: item.id,
          }),
        ),
      )

      await softDeleteRssFeedItemsForTest([item.id])
      const first = await reconcileRssFeedItemContentNotificationVisibility(item.id)
      const second = await reconcileRssFeedItemContentNotificationVisibility(
        item.id,
        first.nextCursor,
      )
      const third = await reconcileRssFeedItemContentNotificationVisibility(
        item.id,
        second.nextCursor,
      )
      expect([first.updated, second.updated, third.updated]).toEqual([1, 1, 1])
      expect([first.pruned, second.pruned, third.pruned]).toEqual([1, 1, 1])

      await restoreRssFeedItemsForTest([item.id])
      const restoredFirst = await reconcileRssFeedItemContentNotificationVisibility(item.id)
      const restoredSecond = await reconcileRssFeedItemContentNotificationVisibility(
        item.id,
        restoredFirst.nextCursor,
      )
      const restoredThird = await reconcileRssFeedItemContentNotificationVisibility(
        item.id,
        restoredSecond.nextCursor,
      )
      expect([restoredFirst.updated, restoredSecond.updated, restoredThird.updated]).toEqual([
        1, 1, 1,
      ])
      for (const id of ids)
        expect(await getNotificationById(id)).toMatchObject({ deleted_at: null })
    } finally {
      restoreLimit()
    }
  })
})
