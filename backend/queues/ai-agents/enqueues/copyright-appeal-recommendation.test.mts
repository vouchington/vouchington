import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightAppealRecommendationAndWait,
  enqueueOrRetryCopyrightAppealRecommendation,
} from './copyright-appeal-recommendation.mts'
import { ai_agents } from '../queues.mts'

describe('copyright appeal recommendation enqueue recovery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an ordered, deduplicated recommendation job', async () => {
    const submissionId = crypto.randomUUID()
    const add = vi.spyOn(ai_agents, 'add').mockResolvedValue({} as never)

    await enqueueCopyrightAppealRecommendationAndWait(submissionId)

    expect(add).toHaveBeenCalledWith(
      'copyright-appeal-recommendation',
      { submission_id: submissionId },
      expect.objectContaining({
        jobId: `copyright_appeal_recommendation_${submissionId}`,
        deduplication: { id: `copyright_appeal_recommendation_${submissionId}`, mode: 'simple' },
        ordering: { key: `copyright_appeal_recommendation_${submissionId}`, concurrency: 1 },
      }),
    )
  })

  it('removes a completed job before recovering its missing advisory result', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightAppealRecommendation('submission-id', {
      getJob: vi
        .fn<
          () => Promise<{
            name: string
            getState(): Promise<string>
            retry(): Promise<void>
            remove(): Promise<void>
          }>
        >()
        .mockResolvedValue({
          name: 'copyright-appeal-recommendation',
          getState: async () => 'completed',
          remove,
          retry: async () => undefined,
        }),
      enqueue,
    })

    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('submission-id')
  })

  it('does not replace a retained job owned by another queue route', async () => {
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightAppealRecommendation('submission-id', {
      getJob: async () => ({
        name: 'another-job',
        getState: async () => 'waiting',
        retry: async () => undefined,
        remove: async () => undefined,
      }),
      enqueue,
    })

    expect(enqueue).not.toHaveBeenCalled()
  })

  it('retries a retained failed advisory job without adding another job', async () => {
    const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightAppealRecommendation('submission-id', {
      getJob: async () => ({
        name: 'copyright-appeal-recommendation',
        getState: async () => 'failed',
        retry,
        remove: async () => undefined,
      }),
      enqueue,
    })

    expect(retry).toHaveBeenCalledOnce()
    expect(enqueue).not.toHaveBeenCalled()
  })
})
