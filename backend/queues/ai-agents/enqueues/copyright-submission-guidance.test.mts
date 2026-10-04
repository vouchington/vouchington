import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightSubmissionGuidanceAndWait,
  enqueueOrRetryCopyrightSubmissionGuidance,
} from './copyright-submission-guidance.mts'
import { ai_agents } from '../queues.mts'

describe('copyright submission guidance enqueue recovery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an ordered, deduplicated guidance job', async () => {
    const submissionId = crypto.randomUUID()
    const add = vi.spyOn(ai_agents, 'add').mockResolvedValue({} as never)

    await enqueueCopyrightSubmissionGuidanceAndWait(submissionId)

    expect(add).toHaveBeenCalledWith(
      'copyright-submission-guidance',
      { submission_id: submissionId },
      expect.objectContaining({
        jobId: `copyright_submission_guidance_${submissionId}`,
        deduplication: { id: `copyright_submission_guidance_${submissionId}`, mode: 'simple' },
        ordering: { key: `copyright_submission_guidance_${submissionId}`, concurrency: 1 },
      }),
    )
  })

  it('removes a completed job before recovering its missing advisory result', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightSubmissionGuidance('submission-id', {
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
          name: 'copyright-submission-guidance',
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

    await enqueueOrRetryCopyrightSubmissionGuidance('submission-id', {
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

    await enqueueOrRetryCopyrightSubmissionGuidance('submission-id', {
      getJob: async () => ({
        name: 'copyright-submission-guidance',
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
