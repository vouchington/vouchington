import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { enqueueContinueStoryPostRelatedUrlProjectionReconciliation } from '@queues/story-post-related-url-projections/enqueues'
import type { reconcileStoryPostRelatedUrlProjection } from '@services/stories/story-post-related-url-projection'
import { processReconcileStoryPostRelatedUrlProjections } from './processors.mts'

const reconcile = vi.fn<typeof reconcileStoryPostRelatedUrlProjection>()
const enqueueContinuation =
  vi.fn<typeof enqueueContinueStoryPostRelatedUrlProjectionReconciliation>()
const dependencies = {
  reconcileStoryPostRelatedUrlProjection: reconcile,
  enqueueContinueStoryPostRelatedUrlProjectionReconciliation: enqueueContinuation,
}

describe('story post related URL projection processor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the reconciled count without scheduling idle work', async () => {
    reconcile.mockResolvedValue({ processed: 0, continue: false })

    await expect(processReconcileStoryPostRelatedUrlProjections(dependencies)).resolves.toEqual({
      processed: 0,
    })
    expect(enqueueContinuation).not.toHaveBeenCalled()
  })

  it('durably schedules a continuation when more work remains', async () => {
    reconcile.mockResolvedValue({ processed: 2, continue: true })
    enqueueContinuation.mockResolvedValue(undefined)

    await expect(processReconcileStoryPostRelatedUrlProjections(dependencies)).resolves.toEqual({
      processed: 2,
    })
    expect(enqueueContinuation).toHaveBeenCalledOnce()
  })
})
