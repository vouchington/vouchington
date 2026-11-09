import type { Job } from 'glide-mq'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { background } from '@queues/background/queues'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import {
  createTestPost,
  createTestUser,
  deleteTestStoryPostProjectionJob,
  insertTestStory,
  insertTestStoryPostProjectionJob,
} from '@voucha/test-helpers'
import { storyPostRelatedUrlProjectionsHandlers } from './workers.mts'
import { processReconcileStoryPostRelatedUrlProjections } from './processors.mts'
import {
  markTestStoryCategoryWork,
  deleteTestStoryCategoryWork,
  countTestStoryCategoryWork,
} from '@voucha/test-helpers/story-category-projection-fixtures'

const reconcileJob = { name: STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name } as Job

describe('story post related URL projections handler', () => {
  it('reconciles one bounded batch and reports how many it processed', async () => {
    const [handler] = storyPostRelatedUrlProjectionsHandlers

    await expect(handler!.handle(reconcileJob)).resolves.toEqual({ processed: expect.any(Number) })
  })

  it('durably schedules a continuation when more work remains', async () => {
    const [handler] = storyPostRelatedUrlProjectionsHandlers
    const user = await createTestUser()
    // Two owned jobs: whichever one is claimed, the other keeps work claimable.
    for (const label of ['first', 'second']) {
      const story = await insertTestStory({ title: `Projection ${label} ${crypto.randomUUID()}` })
      const post = await createTestPost({ user })
      await insertTestStoryPostProjectionJob(post.id, story.id)
      onTestFinished(() => deleteTestStoryPostProjectionJob(post.id))
    }
    const add = vi.spyOn(background, 'add')
    onTestFinished(() => add.mockRestore())

    await expect(handler!.handle(reconcileJob)).resolves.toEqual({ processed: expect.any(Number) })

    expect(add).toHaveBeenCalledWith(
      STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      {},
      expect.anything(),
    )
  })

  it('drains owned category repair through the shared worker and admits continuation', async () => {
    const stories = await Promise.all([
      insertTestStory({ title: `Category repair ${crypto.randomUUID()}` }),
      insertTestStory({ title: `Category repair ${crypto.randomUUID()}` }),
    ])
    const storyIds = stories.map(story => story.id)
    onTestFinished(() => deleteTestStoryCategoryWork(storyIds))
    await markTestStoryCategoryWork(storyIds)
    const add = vi.spyOn(background, 'add')
    onTestFinished(() => add.mockRestore())

    // Each absent-post job has no receipts, so one bounded page completes one owned job.
    await processReconcileStoryPostRelatedUrlProjections({
      categoryStoryIds: storyIds,
      urlPostIds: [],
    })
    await expect(countTestStoryCategoryWork(storyIds)).resolves.toBe(1)
    await processReconcileStoryPostRelatedUrlProjections({
      categoryStoryIds: storyIds,
      urlPostIds: [],
    })
    await expect(countTestStoryCategoryWork(storyIds)).resolves.toBe(0)
    expect(add).toHaveBeenCalledWith(
      STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      {},
      expect.anything(),
    )
  })
})
