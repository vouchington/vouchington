import { afterEach, describe, expect, it, vi } from 'vitest'
import webpush from 'web-push'

import {
  processReconcilePostNotifications,
  processReconcileRssFeedItemNotifications,
  processDeliverNotificationPushIntent,
  processReconcileNotificationPushIntents,
  processFollowNotification,
} from './processors.mts'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { upsertRssFeedItems } from '../../services/rss-feed-items/upsert.mts'
import {
  createRandomString,
  createTestUser,
  createTestUserDirect,
  insertTestBlock,
  insertTestPost,
  insertTestRssFeedDirect,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { listAvailableNotificationPushIntents } from '@services/notifications-push'
import { withTestNotificationPushRecoveryBacklog } from '@voucha/test-helpers/notification-push-recovery'
import { createFollowNotification } from '@services/notifications/create-follow-notification'
import { listNotifications } from '@services/notifications/list'
import { readAllQueueJobs } from '@voucha/test-helpers/queue-jobs'
import { background } from '@queues/background/queues'
import {
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { ReconcileNotificationPushIntentsData } from '@queues/notifications/enqueues'

async function queuedPushes(userIds: string[]) {
  const jobs = await readAllQueueJobs(background)
  return jobs
    .filter(job => job.name === NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB.name)
    .map(job => job.data as { userId: string; notificationId: string })
    .filter(data => userIds.includes(data.userId))
}

describe('processFollowNotification', () => {
  it('does not notify a user blocked by the follower', async () => {
    const followee = await createTestUser()
    const follower = await createTestUser()
    await insertTestBlock(follower.id, followee.id)

    await processFollowNotification({ followeeId: followee.id, followerId: follower.id })

    expect((await listNotifications(followee.id)).results).toHaveLength(0)
  })
})

function scopedTo(notificationIds: readonly string[]) {
  return {
    listAvailableNotificationPushIntents: (
      limit: number,
      page: Parameters<typeof listAvailableNotificationPushIntents>[1],
    ) => listAvailableNotificationPushIntents(limit, { ...page, notificationIds }),
  }
}

async function notificationIdsFor(userIds: string[]) {
  const pages = await Promise.all(userIds.map(userId => listNotifications(userId)))
  return pages.map(page => page.results.map(row => row.id))
}

describe('notification reconcile processors', () => {
  it('enqueues post push delivery for each created notification', async () => {
    const author = await createTestUser()
    const recipients = await Promise.all([createTestUser(), createTestUser()])
    await Promise.all(
      recipients.map(async user => {
        await bookmarkEntity(user, 'user', { id: author.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__user',
          user.id,
          author.id,
          new Date(Date.now() - 2_000),
        )
      }),
    )
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `push ${suffix}`,
      slug: `push-${suffix}`,
      markdown: 'Push delivery per created notification',
    })

    await expect(processReconcilePostNotifications({ postId })).resolves.toMatchObject({
      created: 2,
    })

    const userIds = recipients.map(user => user.id)
    const notificationIds = await notificationIdsFor(userIds)
    expect(notificationIds.map(ids => ids.length)).toEqual([1, 1])
    const pushes = await queuedPushes(userIds)
    expect(pushes).toHaveLength(2)
    expect(pushes).toEqual(
      expect.arrayContaining(
        userIds.map((userId, index) => ({ userId, notificationId: notificationIds[index]![0] })),
      ),
    )
  })

  it('enqueues RSS push delivery for each created notification', async () => {
    const recipients = await Promise.all([createTestUser(), createTestUser()])
    const feed = await insertTestRssFeedDirect({})
    await Promise.all(
      recipients.map(async user => {
        await bookmarkEntity(user, 'rss_feed', { id: feed.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__rss_feed',
          user.id,
          feed.id,
          new Date(Date.now() - 2_000),
        )
      }),
    )
    const suffix = createRandomString(10)
    const [item] = await upsertRssFeedItems(feed.id, [
      {
        guid: `guid-${suffix}`,
        title: 'Push RSS Item',
        link: `https://example.com/items/${suffix}`,
        content: 'Body',
        contentSnippet: 'Body',
        categories: [],
        creator: 'Tester',
      },
    ])

    await expect(
      processReconcileRssFeedItemNotifications({ rssFeedItemId: item!.id }),
    ).resolves.toMatchObject({ created: 2 })

    const userIds = recipients.map(user => user.id)
    const notificationIds = await notificationIdsFor(userIds)
    expect(notificationIds.map(ids => ids.length)).toEqual([1, 1])
    const pushes = await queuedPushes(userIds)
    expect(pushes).toHaveLength(2)
    expect(pushes).toEqual(
      expect.arrayContaining(
        userIds.map((userId, index) => ({ userId, notificationId: notificationIds[index]![0] })),
      ),
    )
  })
})

describe('notification push intent processors', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('makes a no-op when a delivery intent is absent', async () => {
    await expect(
      processDeliverNotificationPushIntent({
        userId: crypto.randomUUID(),
        notificationId: crypto.randomUUID(),
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
  })

  it('hands a claimed intent to the delivery service', async () => {
    // generateVAPIDKeys zero-pads the private key; raw ECDH keys are sometimes shorter than 32 bytes.
    const vapidKeys = webpush.generateVAPIDKeys()
    vi.stubEnv('WEB_PUSH_PUBLIC_KEY', vapidKeys.publicKey)
    vi.stubEnv('WEB_PUSH_PRIVATE_KEY', vapidKeys.privateKey)
    vi.stubEnv('WEB_PUSH_SUBJECT', 'mailto:tests+push-processor@voucha.ai')
    const recipient = await createTestUserDirect()
    const follower = await createTestUserDirect()
    const [notification] = await createFollowNotification(
      recipient.id,
      follower.id,
      follower.username,
    )
    await expect(
      processDeliverNotificationPushIntent({
        userId: recipient.id,
        notificationId: notification!.id,
      }),
    ).resolves.toEqual({ delivered: 0, suppressed: false })
  })

  it('reports a nonempty durable-intent reconciliation batch', async () => {
    const recipient = await createTestUserDirect()
    await withTestNotificationPushRecoveryBacklog(
      { userId: recipient.id, count: 1 },
      async fixture => {
        await expect(
          processReconcileNotificationPushIntents(
            { scanBefore: fixture.scanBefore, after: fixture.after },
            scopedTo(fixture.notificationIds),
          ),
        ).resolves.toEqual({ enqueued: 1 })
        await expect(queuedPushes([recipient.id])).resolves.toEqual([
          { userId: recipient.id, notificationId: fixture.notificationIds[0] },
        ])
      },
    )
  })
})

describe('notification push-intent recovery', () => {
  it('chains another bounded page when at least 100 intents are available', async () => {
    const recipient = await createTestUserDirect()
    await withTestNotificationPushRecoveryBacklog(
      { userId: recipient.id, count: 100 },
      async fixture => {
        await expect(
          processReconcileNotificationPushIntents(
            { scanBefore: fixture.scanBefore, after: fixture.after },
            scopedTo(fixture.notificationIds),
          ),
        ).resolves.toEqual({ enqueued: 100 })

        const pushes = await queuedPushes([recipient.id])
        expect(pushes.map(push => push.notificationId).toSorted()).toEqual(fixture.notificationIds)
        const continuations = (await readAllQueueJobs(background))
          .filter(job => job.name === NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB.name)
          .map(job => job.data as ReconcileNotificationPushIntentsData)
          .filter(data => data.after?.userId === recipient.id)
        expect(continuations).toEqual([
          {
            scanBefore: fixture.scanBefore,
            after: {
              updatedAt: fixture.scanBefore,
              userId: recipient.id,
              notificationId: fixture.notificationIds[99],
            },
          },
        ])
      },
    )
  })
})
