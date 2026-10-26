import type { Job } from 'glide-mq'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { NOTIFICATIONS_RECONCILE_POST_JOB } from '@queues/background/enqueues/notifications-jobs'
import { enqueueReconcilePostNotifications } from '@queues/notifications/enqueues'
import { bookmarkEntity } from '@services/bookmarks/upsert'
import { listNotifications } from '@services/notifications/list'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'
import {
  createRandomString,
  createTestUser,
  insertTestPost,
  setEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { BACKGROUND_HANDLERS } from '../processors/handlers.mts'
import { createBackgroundWorker } from '../workers/create-worker.mts'

const worker = createBackgroundWorker({ handlers: BACKGROUND_HANDLERS, domains: ['notifications'] })

describe('notifications background handler', () => {
  afterAll(async () => {
    await closeAndUnregisterGlideMQInstance(worker)
  })

  it('reconciles a post one recipient page per job and chains the pages through the queue', async () => {
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      notifications_page_size: 2,
    })
    try {
      const author = await createTestUser()
      const postCreatedAt = new Date(Date.now() + 2_000)
      const subscribers = await Promise.all(Array.from({ length: 3 }, async () => createTestUser()))
      await Promise.all(
        subscribers.map(async subscriber => {
          await bookmarkEntity(subscriber, 'user', { id: author.id }, 'subscribe')
          await setEntityRelationCreatedAt(
            'relation__user__subscribe__user',
            subscriber.id,
            author.id,
            new Date(postCreatedAt.getTime() - 1_000),
          )
        }),
      )
      const random = createRandomString(10)
      const postId = await insertTestPost({
        createdById: author.id,
        title: `Chained pages ${random}`,
        slug: `notification-chained-pages-${random}`,
        markdown: `Chained pages body ${random}`,
        createdAt: postCreatedAt,
      })
      const completedPages: Array<string | undefined> = []
      const finished = Promise.withResolvers<void>()
      worker.on('completed', job => {
        if (job.name !== NOTIFICATIONS_RECONCILE_POST_JOB.name || job.data.postId !== postId) return
        completedPages.push(job.data.afterUserId)
        // Three recipients at two per page: the root page and one continuation.
        if (completedPages.length === 2) finished.resolve()
      })
      worker.on('failed', (job, error) => {
        if (job?.data?.postId === postId) finished.reject(error)
      })

      const [root] = (await enqueueReconcilePostNotifications(postId, randomUUID())) as Job[]
      expect(root!.opts.priority).toBe(NOTIFICATIONS_RECONCILE_POST_JOB.options.priority)
      await finished.promise

      const sortedIds = subscribers.map(subscriber => subscriber.id).toSorted()
      expect(completedPages).toEqual([undefined, sortedIds[1]])
      await Promise.all(
        subscribers.map(async subscriber =>
          expect((await listNotifications(subscriber.id)).results).toHaveLength(1),
        ),
      )
    } finally {
      restore()
    }
  })
})
