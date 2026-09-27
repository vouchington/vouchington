import { runEntityRelationNotificationTestTransaction } from '@voucha/test-helpers/data-stores/psql/entity-relation-notification-transactions'
import { getEntityRelationMetadataOrThrow } from './metadata.mts'
import { upsertEntityRelation } from './upsert.mts'
import { SYSTEM_ENTITY_RELATION_VIEWER } from './viewer.mts'
import { getEntityRelations } from './query.mts'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { describe, expect, it } from 'vitest'

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

    await runEntityRelationNotificationTestTransaction(async rollback => {
      await upsertEntityRelation(creator, relation, post, [topic], {
        query: rollback,
        deferNotificationReconcile: true,
      })
      expect(
        hasPostNotification(
          await waitForQueueJobs(
            notifications,
            waiting => hasPostNotification(waiting, post.id),
            200,
          ),
          post.id,
        ),
      ).toBe(false)
    })
    expect(
      hasPostNotification(
        await waitForQueueJobs(
          notifications,
          waiting => hasPostNotification(waiting, post.id),
          200,
        ),
        post.id,
      ),
    ).toBe(false)
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
    const jobs = await waitForQueueJobs(notifications, waiting =>
      hasPostNotification(waiting, post.id),
    )
    expect(hasPostNotification(jobs, post.id)).toBe(true)
  })
})
