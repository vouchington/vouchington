import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from '@services/notifications/list'
import { notificationsWorkConfig } from '@services/notifications/work-limits'
import { background } from '@queues/background/queues'
import {
  NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
  NOTIFICATIONS_MEMBERSHIP_VISIBILITY_JOB,
  NOTIFICATIONS_RECONCILE_POST_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  createRandomString,
  createTestManualPostNotification,
  createTestPost,
  createTestUser,
  getNotificationById,
  insertTestPost,
  setEntityRelationCreatedAt,
  setPostModerationFlaggedForTest,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { startRealGlideBackgroundLifecycle } from '@voucha/test-helpers/real-glide-background-lifecycle'
import { notificationsHandlers } from './workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('notification worker paged dispatch', () => {
  it('restarts the first visibility page for a new change while the old page chain is pending', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(notificationsWorkConfig, {
        content_visibility_page_size: 1,
      }),
    )
    const sender = await createTestUser()
    const author = await createTestUser()
    const post = await createTestPost({ user: author, privacy: 'public' })
    const recipients = await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
    const notificationIds = await Promise.all(
      recipients.map(recipient =>
        createTestManualPostNotification({
          userId: recipient.id,
          sentByUserId: sender.id,
          postId: post.id,
        }),
      ),
    )
    const changeA = randomUUID()
    const changeB = randomUUID()
    const rootId = (changeId: string) =>
      `notifications__reconcile-post__${post.id}__${changeId}__root`
    const pageId = (changeId: string, after: { userId: string; notificationId: string }) =>
      `notifications__content-visibility__post__${post.id}__${changeId}__${after.userId}__${after.notificationId}`
    const membershipPageId = (
      changeId: string,
      after: { userId: string; notificationId: string },
    ) =>
      `notifications__membership-visibility__post__${post.id}__${changeId}__${after.userId}__${after.notificationId}`
    const rootHandler = notificationsHandlers.find(
      candidate => candidate.job.name === NOTIFICATIONS_RECONCILE_POST_JOB.name,
    )!
    const pageHandler = notificationsHandlers.find(
      candidate => candidate.job.name === NOTIFICATIONS_CONTENT_VISIBILITY_JOB.name,
    )!
    const ownedJobs: Array<Job> = []
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })
    const getJob = async (id: string) => {
      const job = await background.getJob(id)
      if (!job) throw new Error(`Expected notification job ${id}`)
      ownedJobs.push(job)
      return job
    }

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: true })
    await enqueueReconcilePostNotifications(post.id, changeA)
    // A replay of the same accepted change uses the same pending root.
    await enqueueReconcilePostNotifications(post.id, changeA)
    const rootA = await getJob(rootId(changeA))
    await (rootHandler.handle as (job: Job) => Promise<unknown>)(rootA)
    const firstPageA = (
      (await background.getJob(rootA.id)) as Job<{
        dispatchReceipt: {
          result: { nextVisibilityCursor?: { userId: string; notificationId: string } }
        }
      }>
    ).data.dispatchReceipt.result.nextVisibilityCursor
    if (!firstPageA) throw new Error('Expected change A to enqueue a visibility continuation')
    expect(await getNotificationById(firstPageA.notificationId)).toMatchObject({
      delete_reason: 'system_pruned',
    })
    const pendingPageA = await getJob(pageId(changeA, firstPageA))

    await setPostModerationFlaggedForTest({ postId: post.id, flagged: false })
    await enqueueReconcilePostNotifications(post.id, changeB)
    const rootB = await getJob(rootId(changeB))
    expect(rootB.id).not.toBe(rootA.id)
    expect(rootB.opts.ordering).toEqual(rootA.opts.ordering)
    await (rootHandler.handle as (job: Job) => Promise<unknown>)(rootB)
    expect(await getNotificationById(firstPageA.notificationId)).toMatchObject({ deleted_at: null })
    const resultB = (
      (await background.getJob(rootB.id)) as Job<{
        dispatchReceipt: {
          result: {
            nextVisibilityCursor?: { userId: string; notificationId: string }
            nextMembershipCursor?: { userId: string; notificationId: string }
          }
        }
      }>
    ).data.dispatchReceipt.result
    const firstPageB = resultB.nextVisibilityCursor
    if (!firstPageB) throw new Error('Expected change B to enqueue a visibility continuation')
    expect(firstPageB).toEqual(firstPageA)

    const handlePage = pageHandler.handle as (job: Job) => Promise<{
      nextCursor?: typeof firstPageA
    }>
    let nextA: typeof firstPageA | undefined = firstPageA
    let nextB: typeof firstPageA | undefined = firstPageB
    for (let page = 0; page <= notificationIds.length; page += 1) {
      if (nextA) {
        const job: Job = page === 0 ? pendingPageA : await getJob(pageId(changeA, nextA))
        nextA = (await handlePage(job)).nextCursor
      }
      if (nextB) nextB = (await handlePage(await getJob(pageId(changeB, nextB)))).nextCursor
    }
    expect(nextA).toBeUndefined()
    expect(nextB).toBeUndefined()
    const membershipHandler = notificationsHandlers.find(
      candidate => candidate.job.name === NOTIFICATIONS_MEMBERSHIP_VISIBILITY_JOB.name,
    )!
    const handleMembership = membershipHandler.handle as (job: Job) => Promise<{
      nextCursor?: typeof firstPageA
    }>
    let nextMembership = resultB.nextMembershipCursor
    expect(nextMembership).toBeDefined()
    for (let page = 0; page <= notificationIds.length && nextMembership; page += 1) {
      nextMembership = (
        await handleMembership(await getJob(membershipPageId(changeB, nextMembership)))
      ).nextCursor
    }
    expect(nextMembership).toBeUndefined()
    for (const id of notificationIds)
      expect(await getNotificationById(id)).toMatchObject({ deleted_at: null })
  })

  it('persists a page receipt and admits each recipient continuation through GlideMQ', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(pagedDispatchConfig, { notifications_page_size: 1 }),
    )
    const author = await createTestUser()
    const recipients = await Promise.all([createTestUser(), createTestUser()])
    const createdAt = new Date('2040-01-01T00:00:00Z')
    await Promise.all(
      recipients.map(async user => {
        await bookmarkEntity(user, 'user', { id: author.id }, 'subscribe')
        await setEntityRelationCreatedAt(
          'relation__user__subscribe__user',
          user.id,
          author.id,
          new Date(createdAt.getTime() - 1000),
        )
      }),
    )
    const suffix = createRandomString(10)
    const postId = await insertTestPost({
      createdById: author.id,
      title: `dispatch ${suffix}`,
      slug: `dispatch-${suffix}`,
      markdown: 'Worker page boundary',
      createdAt,
    })
    const handler = notificationsHandlers.find(
      candidate => candidate.job.name === NOTIFICATIONS_RECONCILE_POST_JOB.name,
    )!
    const handle = handler.handle as (
      job: Job<{ postId: string; afterUserId?: string }>,
    ) => Promise<{ created: number }>
    const results = new Map<string, { created: number }>()
    const harness = await startRealGlideBackgroundLifecycle({
      queueNamePrefix: 'notification_dispatch_page',
      connection: { connection: workerQueueConnection, prefix: workerQueuePrefix },
      workerOptions: { blockTimeout: 100 },
      processor: async job => {
        const result = await handle(job as Job<{ postId: string; afterUserId?: string }>)
        results.set(job.id, result)
        return result
      },
    })
    const execute = async (admitted: Job) => {
      // Keep the real production admission for inspection; execute its immutable payload with
      // the same identity on an isolated active worker so retained fence cleanup can yield.
      const active = await harness.add(NOTIFICATIONS_RECONCILE_POST_JOB, admitted.data, {
        ...admitted.opts,
        jobId: admitted.id,
        removeOnComplete: false,
        removeOnFail: false,
      })
      expect(await harness.settled(active)).toBe('completed')
      const retained = await harness.queue.getJob(active.id)
      if (!retained) throw new Error('Expected the executed page receipt to remain')
      return retained
    }
    const changeId = randomUUID()
    const root = await background.add(
      NOTIFICATIONS_RECONCILE_POST_JOB.name,
      { postId, changeId },
      {
        ...NOTIFICATIONS_RECONCILE_POST_JOB.options,
        jobId: `test-notification-page-${randomUUID()}`,
      },
    )
    if (!root) throw new Error('Expected a root reconciliation job')
    const ownedJobs = [root]
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })

    const executedRoot = await execute(root)
    const first = results.get(root.id)
    expect(first).toMatchObject({ created: 1 })
    const firstReceipt = (
      executedRoot as Job<{
        dispatchReceipt?: { next?: { afterUserId: string } }
      }>
    ).data.dispatchReceipt
    expect(firstReceipt?.next?.afterUserId).toBe(recipients.map(user => user.id).toSorted()[0])
    await expect(
      handle(executedRoot as Job<{ postId: string; afterUserId?: string }>),
    ).resolves.toEqual(first)

    let current = executedRoot
    for (const afterUserId of recipients.map(user => user.id).toSorted()) {
      const next = (current as Job<{ dispatchReceipt: { next?: unknown } }>).data.dispatchReceipt
        .next as { postId: string; afterUserId: string } | undefined
      expect(next?.afterUserId).toBe(afterUserId)
      const continuation = await background.getJob(
        `notifications__reconcile-post__${postId}__${changeId}__${afterUserId}`,
      )
      if (!continuation) throw new Error(`Expected continuation after ${afterUserId}`)
      ownedJobs.push(continuation)
      current = await execute(continuation)
    }
    const counts = await Promise.all(
      recipients.map(async user => (await listNotifications(user.id)).results.length),
    )
    expect(counts).toEqual([1, 1])
  })
})
