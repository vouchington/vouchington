import { runEntityRelationNotificationTestTransaction } from '@voucha/test-helpers/data-stores/psql/entity-relation-notification-transactions'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'
import { SYSTEM_ENTITY_RELATION_VIEWER } from './viewer.mts'
import { getEntityRelations } from './query.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { describe, expect, it, vi } from 'vitest'

function hasPostNotification(
  jobs: Awaited<ReturnType<typeof notifications.getJobs>>,
  postId: string,
): boolean {
  return jobs.some(
    job =>
      job.name === 'processReconcilePostNotifications' &&
      (job.data as { postId: string }).postId === postId,
  )
}

describe('entity-relation notification transaction ownership', () => {
  it('defers post category notifications to the borrowed owner commit and drops them on rollback', async () => {
    const creator = await createTestUser()
    const post = await createTestPost({ user: creator })
    const topic = await createTestTopic()
    const relation = getEntityRelationMetadataOrThrow({
      subjectType: 'post',
      objectType: 'topic',
      predicate: 'category',
    })

    const pendingEnqueues: Promise<unknown>[] = []
    trackBulkEnqueue(notifications, pendingEnqueues)
    try {
      await runEntityRelationNotificationTestTransaction(async rollback => {
        await upsertEntityRelation(creator, relation, post, [topic], {
          query: rollback,
          deferNotificationReconcile: true,
        })
        await settleEnqueues(pendingEnqueues)
        expect(hasPostNotification(await readAllQueueJobs(notifications), post.id)).toBe(false)
      })
      await settleEnqueues(pendingEnqueues)
      expect(hasPostNotification(await readAllQueueJobs(notifications), post.id)).toBe(false)
      expect(
        await getEntityRelations('post', post.id, 'category', 'topic', {
          viewer: SYSTEM_ENTITY_RELATION_VIEWER,
          readOnly: false,
        }),
      ).toEqual([])

      await runEntityRelationNotificationTestTransaction(
        async commit => {
          await upsertEntityRelation(creator, relation, post, [topic], {
            query: commit,
            deferNotificationReconcile: true,
          })
        },
        { commit: true },
      )
      await settleEnqueues(pendingEnqueues)
      expect(hasPostNotification(await readAllQueueJobs(notifications), post.id)).toBe(true)
    } finally {
      vi.restoreAllMocks()
    }
  })
})

function trackBulkEnqueue(
  queue: { addBulk: (jobs: ReadonlyArray<{ name: string; data: unknown }>) => Promise<unknown> },
  pending: Promise<unknown>[],
): void {
  const addBulk = queue.addBulk
  vi.spyOn(queue, 'addBulk').mockImplementation(jobs => {
    const enqueued = addBulk.call(queue, jobs)
    pending.push(enqueued)
    return enqueued
  })
}

async function settleEnqueues(pending: Promise<unknown>[]): Promise<void> {
  await Promise.all(pending)
}
