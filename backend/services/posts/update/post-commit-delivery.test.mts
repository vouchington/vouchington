import { describe, expect, it, vi } from 'vitest'
import { finalizePostUpdateAndDeliver } from './post-commit-delivery.mts'
import type { Post } from '../types.mts'
import type { PostCategoryFinalization } from '../post-category-finalizations.mts'

describe('finalizePostUpdateAndDeliver', () => {
  it('returns a committed edit when immediate category finalization fails', async () => {
    const error = new Error('transient finalization failure')
    const onError = vi.fn<(error: Error) => void>()
    const updatedPost = { id: 'post-id' } as Post

    await expect(
      finalizePostUpdateAndDeliver(
        {
          changes: {},
          contentChanged: false,
          previousPost: updatedPost,
          shouldEnqueuePostUpdated: false,
          syncHashtagCategories: true,
          postCategoryFinalization: {} as PostCategoryFinalization,
          updatedPost,
        },
        {
          enqueuePostCategoryFinalizationReconciliationBestEffort: vi.fn<() => Promise<void>>(),
          onError,
          reconcilePostCategoryFinalization: vi
            .fn<
              (
                finalization: PostCategoryFinalization,
              ) => Promise<Post['post_related_topics'] | undefined>
            >()
            .mockRejectedValue(error),
        },
      ),
    ).resolves.toBe(updatedPost)

    expect(onError).toHaveBeenCalledWith(error)
  })
})
