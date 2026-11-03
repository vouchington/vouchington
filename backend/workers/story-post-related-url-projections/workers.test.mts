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
})
