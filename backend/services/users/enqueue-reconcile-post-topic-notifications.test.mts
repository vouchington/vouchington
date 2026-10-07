import { describe, expect, it } from 'vitest'
import { notifications } from '@queues/notifications/queues'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  getEntityRelation,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { enqueueReconcileNotificationsForPostCategoryVotes } from './enqueue-reconcile-post-topic-notifications.mts'

describe('enqueueReconcileNotificationsForPostCategoryVotes', () => {
  it('enqueues a post reconciliation for an affected linked hashtag relation', async () => {
    const author = await createTestUser()
    const topic = await createTestTopic({ user: author })
    const post = await createTestPost({ user: author, title: 'Deleted alias vote' })
    const aliasId = await createTopHashtagAliasForTest(topic.id, `delete-${post.id}`)
    await createTopHashtagPostSourceForTest({
      postId: post.id,
      topicAliasId: aliasId,
      userId: author.id,
      authoredToken: `#delete-${post.id}`,
    })
    const [relation] = await getEntityRelation(
      'relation__post__category__topic_alias',
      post.id,
      aliasId,
    )
    const relationId = (relation as { id: string }).id

    await enqueueReconcileNotificationsForPostCategoryVotes([
      {
        relationTable: 'relation__post__category__topic_alias',
        subjectId: post.id,
        entityRelationId: relationId,
      },
    ])

    const jobs = await readAllQueueJobs(notifications)
    expect(
      jobs.filter(
        job =>
          job.name === 'processReconcilePostNotifications' &&
          (job.data as { postId?: string }).postId === post.id,
      ),
    ).toHaveLength(1)
  })
})
