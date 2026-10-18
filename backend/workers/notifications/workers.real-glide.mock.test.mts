import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from '@services/notifications/list'
import { background } from '@queues/background/queues'
import { NOTIFICATIONS_RECONCILE_POST_JOB } from '@queues/background/enqueues/notifications-jobs'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  createRandomString,
  createTestUser,
  insertTestPost,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { notificationsHandlers } from './workers.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('notification worker paged dispatch', () => {
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
    const root = await background.add(
      NOTIFICATIONS_RECONCILE_POST_JOB.name,
      { postId },
      {
        jobId: `test-notification-page-${randomUUID()}`,
      },
    )
    if (!root) throw new Error('Expected a root reconciliation job')
    const ownedJobs = [root]
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })

    const first = await handle(root as Job<{ postId: string; afterUserId?: string }>)
    expect(first).toMatchObject({ created: 1 })
    const firstReceipt = (
      (await background.getJob(root.id)) as Job<{
        dispatchReceipt?: { next?: { afterUserId: string } }
      }>
    ).data.dispatchReceipt
    expect(firstReceipt?.next?.afterUserId).toBe(recipients.map(user => user.id).toSorted()[0])
    await expect(handle(root as Job<{ postId: string; afterUserId?: string }>)).resolves.toEqual(
      first,
    )

    let current = root
    for (const afterUserId of recipients.map(user => user.id).toSorted()) {
      const next = (
        (await background.getJob(current.id)) as Job<{ dispatchReceipt: { next?: unknown } }>
      ).data.dispatchReceipt.next as { postId: string; afterUserId: string } | undefined
      expect(next?.afterUserId).toBe(afterUserId)
      const pageId = createHash('sha256')
        .update(`${current.id}:${JSON.stringify(next)}`)
        .digest('hex')
      const continuation = await background.getJob(`${current.name}__page__${pageId}`)
      if (!continuation) throw new Error(`Expected continuation after ${afterUserId}`)
      ownedJobs.push(continuation)
      await handle(continuation as Job<{ postId: string; afterUserId?: string }>)
      current = continuation
    }
    const counts = await Promise.all(
      recipients.map(async user => (await listNotifications(user.id)).results.length),
    )
    expect(counts).toEqual([1, 1])
  })
})
