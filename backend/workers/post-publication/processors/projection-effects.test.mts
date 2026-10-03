import { describe, expect, it } from 'vitest'
import {
  makeDependencies,
  makeResult,
  post,
} from '@voucha/test-helpers/workers/post-publication/processors/fixtures'
import { processReconcilePostPublication } from '../processors.mts'

describe('post-publication landing-pages sitemap repair', () => {
  it.each([true, false])('refreshes once for a review with is_public=%s', async isPublic => {
    const review = { ...post, post_type: 'review', is_public: isPublic }
    const dependencies = makeDependencies(
      makeResult({
        processed: 1,
        posts: [review],
        sitemapTargets: [{ postType: 'review', day: '2026-09-01' }],
      }),
    )

    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 1,
    })
    expect(dependencies.enqueueUpdateLandingPagesSitemapForReconciliation).toHaveBeenCalledOnce()
    expect(dependencies.acknowledgePostPublicationDirtyWork).toHaveBeenCalledOnce()
  })

  it('refreshes once for retained review targets after the review is deleted', async () => {
    const dependencies = makeDependencies(
      makeResult({
        processed: 0,
        posts: [],
        sitemapTargets: [
          { postType: 'review', day: '2026-09-01' },
          { postType: 'review', day: '2026-09-02' },
        ],
      }),
    )

    await processReconcilePostPublication({}, dependencies)
    expect(dependencies.enqueueUpdateLandingPagesSitemapForReconciliation).toHaveBeenCalledOnce()
  })

  it('leaves the page retryable when the landing-pages enqueue fails', async () => {
    const dependencies = makeDependencies(
      makeResult({
        processed: 1,
        posts: [{ ...post, post_type: 'review' }],
        sitemapTargets: [{ postType: 'review', day: '2026-09-01' }],
      }),
    )
    const error = new Error('landing-pages queue unavailable')
    dependencies.enqueueUpdateLandingPagesSitemapForReconciliation.mockRejectedValueOnce(error)

    await expect(processReconcilePostPublication({}, dependencies)).rejects.toBe(error)
    expect(dependencies.acknowledgePostPublicationProjectionReceipts).not.toHaveBeenCalled()
    expect(dependencies.acknowledgePostPublicationDirtyWork).not.toHaveBeenCalled()
    expect(dependencies.releasePostPublicationDirtyWorkLease).toHaveBeenCalledOnce()
  })

  it('accepts another landing-pages rebuild when acknowledgement fails after enqueue', async () => {
    const dependencies = makeDependencies(
      makeResult({
        processed: 1,
        posts: [{ ...post, post_type: 'review' }],
        sitemapTargets: [{ postType: 'review', day: '2026-09-01' }],
      }),
    )
    dependencies.acknowledgePostPublicationDirtyWork.mockRejectedValueOnce(
      new Error('acknowledgement unavailable'),
    )

    await expect(processReconcilePostPublication({}, dependencies)).rejects.toThrow(
      'acknowledgement unavailable',
    )
    await expect(processReconcilePostPublication({}, dependencies)).resolves.toEqual({
      reconciled: 1,
    })
    expect(dependencies.enqueueUpdateLandingPagesSitemapForReconciliation).toHaveBeenCalledTimes(2)
  })

  it('does not refresh landing pages for a non-review page', async () => {
    const dependencies = makeDependencies()
    await processReconcilePostPublication({}, dependencies)
    expect(dependencies.enqueueUpdateLandingPagesSitemapForReconciliation).not.toHaveBeenCalled()
  })
})
