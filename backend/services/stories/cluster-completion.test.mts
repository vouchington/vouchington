import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { insertTestStory } from '@voucha/test-helpers'
import { trackAgentQueueAdds } from '../../test-helpers/services/stories/story-post-agent-adds.mts'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import * as cacheInvalidation from './cache-invalidation.mts'
import { completeClusteredStory } from './cluster-completion.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'

describe('completeClusteredStory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reports a post-commit dispatch failure and completes the remaining delivery', async () => {
    const story = await insertTestStory()
    const postId = randomUUID()
    const dispatchError = new Error('relation delivery failed')
    const refreshResult: StoryPostRefreshResult = {
      postId,
      impactedTopicIds: [],
      dispatchPostCommitEffects: async () => {
        throw dispatchError
      },
    }
    const invalidateSpy = vi.spyOn(cacheInvalidation, 'invalidateStories')
    const agent = trackAgentQueueAdds()

    await expect(completeClusteredStory(story.id, refreshResult)).resolves.toBeUndefined()
    await Promise.all(agent.admissions)

    expect(
      sentryCaptureExceptionMock.mock.calls.filter(([captured]) => captured === dispatchError),
    ).toHaveLength(1)
    expect(agent.calls).toEqual([{ name: 'story-post', data: { post_id: postId, force: true } }])
    expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith(story.id)
  })

  it('dispatches relation effects, enqueues the forced agent run and invalidates', async () => {
    const story = await insertTestStory()
    const postId = randomUUID()
    const dispatched: string[] = []
    const refreshResult: StoryPostRefreshResult = {
      postId,
      impactedTopicIds: [],
      dispatchPostCommitEffects: async () => {
        dispatched.push(postId)
      },
    }
    const invalidateSpy = vi.spyOn(cacheInvalidation, 'invalidateStories')
    const agent = trackAgentQueueAdds()

    await completeClusteredStory(story.id, refreshResult)
    await Promise.all(agent.admissions)

    expect(dispatched).toEqual([postId])
    expect(agent.calls).toEqual([{ name: 'story-post', data: { post_id: postId, force: true } }])
    expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith(story.id)
  })

  it('only invalidates when the story has no post to refresh', async () => {
    const story = await insertTestStory()
    const invalidateSpy = vi.spyOn(cacheInvalidation, 'invalidateStories')
    const agent = trackAgentQueueAdds()

    await completeClusteredStory(story.id, null)

    expect(agent.calls).toEqual([])
    expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith(story.id)
  })
})
