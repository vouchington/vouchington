import type { Job } from 'glide-mq'
import { describe, expect, it } from 'vitest'
import { STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB } from '@queues/background/enqueues/story-post-related-url-projections-jobs'
import { storyPostRelatedUrlProjectionsHandlers } from './workers.mts'

describe('story post related URL projections handler', () => {
  it('reconciles one bounded batch and reports how many it processed', async () => {
    const [handler] = storyPostRelatedUrlProjectionsHandlers

    await expect(
      handler!.handle({ name: STORY_POST_RELATED_URL_PROJECTIONS_RECONCILE_JOB.name } as Job),
    ).resolves.toEqual({ processed: expect.any(Number) })
  })
})
