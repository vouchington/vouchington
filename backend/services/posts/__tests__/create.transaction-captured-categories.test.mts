import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestUser,
  insertTestTopic,
  updatePostTitleMarkdown,
  waitForQueueJobs,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { preparePostWithCommunityReviews } from '../create.mts'

function categoryNotificationCount(
  jobs: Awaited<ReturnType<typeof notifications.getJobs>>,
  postId: string,
): number {
  return jobs.filter(
    job =>
      job.name === 'processReconcilePostNotifications' &&
      (job.data as { postId: string }).postId === postId,
  ).length
}

describe('create transaction-captured categories', () => {
  it('returns the transaction-captured response after a later edit commits first', async () => {
    const user = await createTestUser()
    const suffix = Math.random().toString(36).slice(2, 12)
    const originalTitle = `Captured create response ${suffix}`
    const topicId = await insertTestTopic({
      name: `Captured category ${suffix}`,
      slug: `captured-category-${suffix}`,
      createdById: user.id,
    })

    await using query = await beginTransaction()
    const prepared = await preparePostWithCommunityReviews(
      user,
      WEB_PROVENANCE,
      {
        title: originalTitle,
        markdown: `Original body ${suffix}`,
        categories: [{ type: 'topic', topic_id: topicId }],
      },
      null,
      { query },
    )
    const postId = prepared.response.post.id
    await query.commit()

    const jobs = await waitForQueueJobs(notifications, currentJobs =>
      currentJobs.some(
        job =>
          job.name === 'processReconcilePostNotifications' &&
          (job.data as { postId: string }).postId === postId,
      ),
    )
    expect(categoryNotificationCount(jobs, postId)).toBe(1)

    await updatePostTitleMarkdown(postId, `Later title ${suffix}`, `Later body ${suffix}`)
    const finalized = await prepared.finalize()

    expect(finalized.post.title).toBe(originalTitle)
    expect(finalized.post.post_related_topics).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: topicId })]),
    )
  })
})
