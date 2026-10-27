import { describe, expect, it, onTestFinished } from 'vitest'
import { bookmarkEntity, unbookmarkEntity } from '@services/bookmarks/upsert'
import {
  createRandomString,
  createTestUser,
  getNotificationById,
  insertTestPost,
  insertTestRssFeedDirect,
  setEntityRelationCreatedAt,
  setEntityRelationDeletedAt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { insertNotificationTestRssFeedItem } from '../../test-helpers/services/notifications/rss-feed-items.mts'
import { listNotifications } from './list.mts'
import {
  reconcileNotificationsForPost,
  reconcilePostMembershipVisibility,
} from './reconcile-post.mts'
import {
  reconcileNotificationsForRssFeedItem,
  reconcileRssFeedItemMembershipVisibility,
} from './reconcile-rss-feed-item.mts'
import { notificationsWorkConfig } from './work-limits.mts'

describe('bounded subscription membership visibility pages', () => {
  it('advances through a no-op post page and prunes stale subscribers at the lowered recipient cap', async () => {
    const author = await createTestUser()
    const createdAt = new Date(Date.now() + 2_000)
    const recipients = (
      await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
    ).toSorted((a, b) => a.id.localeCompare(b.id))
    for (const recipient of recipients) {
      await bookmarkEntity(recipient, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__user',
        recipient.id,
        author.id,
        new Date(createdAt.getTime() - 1_000),
      )
    }
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `membership page ${suffix}`,
      slug: `membership-page-${suffix}`,
      markdown: 'Membership page test',
      createdAt,
    })
    await reconcileNotificationsForPost(postId)
    const ids = await Promise.all(
      recipients.map(async recipient => (await listNotifications(recipient.id)).results[0]!.id),
    )
    for (const recipient of recipients.slice(1)) {
      await unbookmarkEntity(recipient, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationDeletedAt(
        'relation__user__subscribe__user',
        recipient.id,
        author.id,
        new Date(createdAt.getTime() - 500),
      )
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        reconcile_recipient_page_size: 1,
        content_visibility_page_size: 3,
      }),
    )

    const first = await reconcilePostMembershipVisibility(postId)
    expect(first).toEqual({
      updated: 0,
      pruned: 0,
      nextCursor: { userId: recipients[0]!.id, notificationId: ids[0] },
    })
    const second = await reconcilePostMembershipVisibility(postId, first.nextCursor)
    const third = await reconcilePostMembershipVisibility(postId, second.nextCursor)
    expect([second.updated, third.updated]).toEqual([1, 1])
    expect(await getNotificationById(ids[0]!)).toMatchObject({ deleted_at: null })
    for (const id of ids.slice(1))
      expect(await getNotificationById(id)).toMatchObject({ delete_reason: 'system_pruned' })
  })

  it('prunes stale RSS subscribers over separate target pages', async () => {
    const feed = await insertTestRssFeedDirect({})
    const createdAt = new Date(Date.now() + 2_000)
    const recipients = (
      await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
    ).toSorted((a, b) => a.id.localeCompare(b.id))
    for (const recipient of recipients) {
      await bookmarkEntity(recipient, 'rss_feed', { id: feed.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__rss_feed',
        recipient.id,
        feed.id,
        new Date(createdAt.getTime() - 1_000),
      )
    }
    const itemId = await insertNotificationTestRssFeedItem(
      feed.id,
      'Membership RSS page',
      createdAt,
    )
    await reconcileNotificationsForRssFeedItem(itemId)
    const ids = await Promise.all(
      recipients.map(async recipient => (await listNotifications(recipient.id)).results[0]!.id),
    )
    for (const recipient of recipients) {
      await unbookmarkEntity(recipient, 'rss_feed', { id: feed.id }, 'subscribe')
      await setEntityRelationDeletedAt(
        'relation__user__subscribe__rss_feed',
        recipient.id,
        feed.id,
        new Date(createdAt.getTime() - 500),
      )
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        content_visibility_page_size: 1,
      }),
    )
    const first = await reconcileRssFeedItemMembershipVisibility(itemId)
    const second = await reconcileRssFeedItemMembershipVisibility(itemId, first.nextCursor)
    const third = await reconcileRssFeedItemMembershipVisibility(itemId, second.nextCursor)
    expect([first.updated, second.updated, third.updated]).toEqual([1, 1, 1])
    for (const id of ids)
      expect(await getNotificationById(id)).toMatchObject({ delete_reason: 'system_pruned' })
  })

  it('rechecks a post subscriber who becomes eligible again while the older page waits', async () => {
    const author = await createTestUser()
    const createdAt = new Date(Date.now() + 2_000)
    const recipients = (await Promise.all([createTestUser(), createTestUser()])).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    )
    for (const recipient of recipients) {
      await bookmarkEntity(recipient, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationCreatedAt(
        'relation__user__subscribe__user',
        recipient.id,
        author.id,
        new Date(createdAt.getTime() - 1_000),
      )
    }
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `membership edit ${suffix}`,
      slug: `membership-edit-${suffix}`,
      markdown: 'Membership edit test',
      createdAt,
    })
    await reconcileNotificationsForPost(postId)
    const firstId = (await listNotifications(recipients[0]!.id)).results[0]!.id
    for (const recipient of recipients) {
      await unbookmarkEntity(recipient, 'user', { id: author.id }, 'subscribe')
      await setEntityRelationDeletedAt(
        'relation__user__subscribe__user',
        recipient.id,
        author.id,
        new Date(createdAt.getTime() - 500),
      )
    }
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        content_visibility_page_size: 1,
      }),
    )
    const oldFirst = await reconcilePostMembershipVisibility(postId)
    expect(oldFirst.pruned).toBe(1)
    await bookmarkEntity(recipients[0]!, 'user', { id: author.id }, 'subscribe')
    await setEntityRelationCreatedAt(
      'relation__user__subscribe__user',
      recipients[0]!.id,
      author.id,
      new Date(createdAt.getTime() - 1_000),
    )
    await reconcileNotificationsForPost(postId)
    expect(await getNotificationById(firstId)).toMatchObject({ deleted_at: null })
    const newFirst = await reconcilePostMembershipVisibility(postId)
    expect(newFirst).toMatchObject({ updated: 0, nextCursor: oldFirst.nextCursor })
    const oldSecond = await reconcilePostMembershipVisibility(postId, oldFirst.nextCursor)
    expect(oldSecond.pruned).toBe(1)
    expect(await getNotificationById(firstId)).toMatchObject({ deleted_at: null })
  })
})
