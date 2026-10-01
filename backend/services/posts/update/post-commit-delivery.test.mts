import { describe, expect, it, vi } from 'vitest'
import { finalizePostUpdateAndDeliver } from './post-commit-delivery.mts'
import type { Post } from '../types.mts'
import type { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { invalidate } from '@services/entity-cache/invalidate'
import type onError from '@modules/on-error'

describe('finalizePostUpdateAndDeliver', () => {
  it('returns the transaction-captured post and sends one update event', async () => {
    const updatedPost = { id: 'post-id', post_related_topics: [] } as unknown as Post
    const enqueueUpdate = vi.fn<typeof enqueueOnPostUpdated>()
    const invalidatePosts = vi.fn<typeof invalidate.posts>().mockResolvedValue(undefined)

    await expect(
      finalizePostUpdateAndDeliver(
        {
          changes: { title: 'captured' },
          contentChanged: true,
          previousPost: updatedPost,
          shouldEnqueuePostUpdated: true,
          updatedPost,
        },
        { enqueueOnPostUpdated: enqueueUpdate, invalidatePosts },
      ),
    ).resolves.toBe(updatedPost)

    expect(invalidatePosts).toHaveBeenCalledOnce()
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    expect(enqueueUpdate).toHaveBeenCalledWith('post-id', { contentChanged: true })
  })

  it('reports cache failure without rejecting a committed post update', async () => {
    const updatedPost = { id: 'post-id' } as Post
    const enqueueUpdate = vi.fn<typeof enqueueOnPostUpdated>()
    const reportError = vi.fn<typeof onError>()
    const error = new Error('cache unavailable')
    await expect(
      finalizePostUpdateAndDeliver(
        {
          changes: {},
          contentChanged: false,
          previousPost: updatedPost,
          shouldEnqueuePostUpdated: true,
          updatedPost,
        },
        {
          enqueueOnPostUpdated: enqueueUpdate,
          invalidatePosts: vi.fn<typeof invalidate.posts>().mockRejectedValue(error),
          onError: reportError,
        },
      ),
    ).resolves.toBe(updatedPost)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(error)
  })
})
