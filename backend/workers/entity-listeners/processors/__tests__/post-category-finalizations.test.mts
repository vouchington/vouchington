import { beforeEach, describe, expect, it, vi } from 'vitest'
import { processReconcilePostCategoryFinalizations } from '../post-category-finalizations.mts'
import type { enqueueContinuePostCategoryFinalizations } from '@queues/entity-listeners/enqueues'
import type { reconcilePostCategoryFinalizations } from '@services/posts/post-category-finalizations'

const mockEnqueueContinuation = vi.fn<typeof enqueueContinuePostCategoryFinalizations>()
const mockReconcile = vi.fn<typeof reconcilePostCategoryFinalizations>()

describe('post category finalization recovery processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('enqueues one serialized continuation after a full batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 25 })
    mockEnqueueContinuation.mockResolvedValue(undefined)

    await expect(
      processReconcilePostCategoryFinalizations(
        {},
        {
          enqueueContinuePostCategoryFinalizations: mockEnqueueContinuation,
          reconcilePostCategoryFinalizations: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 25 })

    expect(mockEnqueueContinuation).toHaveBeenCalledOnce()
  })

  it('does not enqueue a continuation after a partial batch', async () => {
    mockReconcile.mockResolvedValue({ reconciled: 24 })

    await expect(
      processReconcilePostCategoryFinalizations(
        {},
        {
          enqueueContinuePostCategoryFinalizations: mockEnqueueContinuation,
          reconcilePostCategoryFinalizations: mockReconcile,
        },
      ),
    ).resolves.toEqual({ reconciled: 24 })

    expect(mockEnqueueContinuation).not.toHaveBeenCalled()
  })

  it('rejects for queue retry when continuation dispatch fails', async () => {
    const enqueueError = new Error('continuation unavailable')
    mockReconcile.mockResolvedValue({ reconciled: 25 })
    mockEnqueueContinuation.mockRejectedValue(enqueueError)

    await expect(
      processReconcilePostCategoryFinalizations(
        {},
        {
          enqueueContinuePostCategoryFinalizations: mockEnqueueContinuation,
          reconcilePostCategoryFinalizations: mockReconcile,
        },
      ),
    ).rejects.toBe(enqueueError)
  })
})
