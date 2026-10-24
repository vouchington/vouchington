import { describe, expect, it, vi } from 'vitest'
import { finalizePostUpdateAndDeliver } from './post-commit-delivery.mts'
import type { enqueueOnPostUpdated } from '@queues/entity-listeners/enqueues'
import { startPostCacheInvalidation } from '@services/entity-cache/invalidate'
import type onError from '@modules/on-error'
import {
  createPostCompletionFixture,
  drainOwnedTestAction,
} from '../../../test-helpers/post-commit-completion.mts'

async function fixture() {
  const { post } = await createPostCompletionFixture()
  return {
    changes: { title: 'captured' },
    contentChanged: true,
    previousPost: post,
    shouldEnqueuePostUpdated: true,
    updatedPost: post,
  }
}

describe('finalizePostUpdateAndDeliver', () => {
  it('returns the transaction-captured post and sends one update event', async () => {
    const input = await fixture()
    const enqueueUpdate = vi.fn<typeof enqueueOnPostUpdated>(() => Promise.resolve())
    const invalidatePosts = vi.fn<typeof startPostCacheInvalidation>().mockReturnValue({
      completion: Promise.resolve(),
      rejectionReported: false,
    })
    await expect(
      finalizePostUpdateAndDeliver(input, { enqueueOnPostUpdated: enqueueUpdate, invalidatePosts }),
    ).resolves.toBe(input.updatedPost)
    expect(invalidatePosts).toHaveBeenCalledOnce()
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    expect(enqueueUpdate).toHaveBeenCalledWith(input.updatedPost.id, { contentChanged: true })
  })

  it('reports cache failure without rejecting a committed post update', async () => {
    const input = await fixture()
    const enqueueUpdate = vi.fn<typeof enqueueOnPostUpdated>(() => Promise.resolve())
    const reportError = vi.fn<typeof onError>()
    const error = new Error('cache unavailable')
    await expect(
      finalizePostUpdateAndDeliver(
        { ...input, changes: {}, contentChanged: false },
        {
          enqueueOnPostUpdated: enqueueUpdate,
          invalidatePosts: vi.fn<typeof startPostCacheInvalidation>().mockReturnValue({
            completion: Promise.reject(error),
            rejectionReported: false,
          }),
          onError: reportError,
        },
      ),
    ).resolves.toBe(input.updatedPost)
    expect(enqueueUpdate).toHaveBeenCalledOnce()
    expect(enqueueUpdate).toHaveBeenCalledWith(input.updatedPost.id, { contentChanged: false })
    expect(reportError).toHaveBeenCalledWith(error)
  })

  it('drains both cache and listener admissions before returning the captured response', async () => {
    const input = await fixture()
    const cache = Promise.withResolvers<void>()
    const queue = Promise.withResolvers<void>()
    const starts: string[] = []
    const operation = () =>
      finalizePostUpdateAndDeliver(input, {
        invalidatePosts: () => {
          starts.push('cache')
          return { completion: cache.promise, rejectionReported: false }
        },
        enqueueOnPostUpdated: () => {
          starts.push('queue')
          return queue.promise
        },
      })
    await expect(
      drainOwnedTestAction(
        operation,
        () => {
          cache.resolve()
          queue.resolve()
        },
        async () => {
          expect(starts).toEqual(['cache', 'queue'])
        },
      ),
    ).resolves.toBe(input.updatedPost)
  })

  it('preserves bloom work and suppresses update admission when the captured decision is false', async () => {
    const input = await fixture()
    const bloom = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const enqueueUpdate = vi.fn<typeof enqueueOnPostUpdated>(() => Promise.resolve())
    await finalizePostUpdateAndDeliver(
      { ...input, changes: { slug: input.updatedPost.slug! }, shouldEnqueuePostUpdated: false },
      { addEntityBloomKeys: bloom, enqueueOnPostUpdated: enqueueUpdate },
    )
    expect(bloom).toHaveBeenCalledOnce()
    expect(enqueueUpdate).not.toHaveBeenCalled()
  })
})
