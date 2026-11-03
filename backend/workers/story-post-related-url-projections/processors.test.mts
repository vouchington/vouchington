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
import { processReconcileStoryPostRelatedUrlProjections } from './processors.mts'

describe('story post related URL projection processor', () => {
  it('durably schedules a continuation when more work remains', async () => {
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

    await expect(processReconcileStoryPostRelatedUrlProjections()).resolves.toEqual({
      processed: expect.any(Number),
    })

    expect(add).toHaveBeenCalledWith(
      STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name,
      {},
      expect.anything(),
    )
  })
})
