import { describe, expect, it, vi } from 'vitest'
import { completeClusteredStory } from './cluster-completion.mts'
import type { StoryPostRefreshResult } from './refresh-story-post.mts'

describe('completeClusteredStory', () => {
  it('reports a post-commit dispatch failure and completes the remaining delivery', async () => {
    const dispatchError = new Error('relation delivery failed')
    const effects: string[] = []
    const refreshResult: StoryPostRefreshResult = {
      postId: 'post-id',
      impactedTopicIds: [],
      dispatchPostCommitEffects: async () => {
        throw dispatchError
      },
    }
    const reportError = vi.fn<(error: Error) => void>()

    await expect(
      completeClusteredStory('story-id', refreshResult, {
        onError: reportError,
        enqueueStoryPostAgent: async postId => {
          effects.push(`agent:${postId}`)
        },
        invalidateStories: async storyId => {
          effects.push(`invalidate:${storyId}`)
        },
      }),
    ).resolves.toBeUndefined()

    expect(reportError).toHaveBeenCalledWith(dispatchError)
    expect(effects).toEqual(['agent:post-id', 'invalidate:story-id'])
  })
})
