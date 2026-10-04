import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightSubmissionGuidanceAndWait,
  enqueueOrRetryCopyrightSubmissionGuidance,
} from './copyright-submission-guidance.mts'
import {
  enqueueCopyrightAppealRecommendationAndWait,
  enqueueOrRetryCopyrightAppealRecommendation,
} from './copyright-appeal-recommendation.mts'
import { ai_agents } from '../queues.mts'

const enqueues = [
  {
    name: 'copyright-submission-guidance',
    prefix: 'copyright_submission_guidance_',
    enqueueAndWait: enqueueCopyrightSubmissionGuidanceAndWait,
    recover: enqueueOrRetryCopyrightSubmissionGuidance,
  },
  {
    name: 'copyright-appeal-recommendation',
    prefix: 'copyright_appeal_recommendation_',
    enqueueAndWait: enqueueCopyrightAppealRecommendationAndWait,
    recover: enqueueOrRetryCopyrightAppealRecommendation,
  },
]

describe.each(enqueues)('$name enqueue recovery', ({ name, prefix, enqueueAndWait, recover }) => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an ordered, deduplicated guidance job', async () => {
    const submissionId = crypto.randomUUID()
    const add = vi.spyOn(ai_agents, 'add').mockResolvedValue({} as never)

    await enqueueAndWait(submissionId)

    expect(add).toHaveBeenCalledWith(
      name,
      { submission_id: submissionId },
      expect.objectContaining({
        jobId: `${prefix}${submissionId}`,
        deduplication: { id: `${prefix}${submissionId}`, mode: 'simple' },
        ordering: { key: `${prefix}${submissionId}`, concurrency: 1 },
      }),
    )
  })

  it('removes a completed job before recovering its missing advisory result', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await recover('submission-id', {
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
          name,
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

    await recover('submission-id', {
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

    await recover('submission-id', {
      getJob: async () => ({
        name,
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
