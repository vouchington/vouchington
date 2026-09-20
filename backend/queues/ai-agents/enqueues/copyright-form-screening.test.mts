import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightFormScreeningAndWait,
  enqueueOrRetryCopyrightFormScreening,
} from './copyright-form-screening.mts'
import { ai_agents } from '../queues.mts'

describe('copyright form screening enqueue recovery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an ordered, deduplicated anti-spam screening job', async () => {
    const submissionId = crypto.randomUUID()
    const add = vi.spyOn(ai_agents, 'add').mockResolvedValue({} as never)

    await enqueueCopyrightFormScreeningAndWait(submissionId)

    expect(add).toHaveBeenCalledWith(
      'copyright-form-screening',
      { submission_id: submissionId },
      expect.objectContaining({
        jobId: `copyright_form_screening_${submissionId}`,
        deduplication: { id: `copyright_form_screening_${submissionId}`, mode: 'simple' },
        ordering: { key: `copyright_form_screening_${submissionId}`, concurrency: 1 },
      }),
    )
  })

  it('removes a completed job before recovering its missing result', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightFormScreening('submission-id', {
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
          name: 'copyright-form-screening',
          getState: async () => 'completed',
          remove,
          retry: async () => undefined,
        }),
      enqueue,
    })

    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('submission-id')
  })
})
