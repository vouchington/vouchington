import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueCopyrightEmailIntakeAndWait,
  enqueueOrRetryCopyrightEmailIntake,
} from './copyright-email-intake.mts'
import { ai_agents } from '../queues.mts'

describe('copyright email intake enqueue recovery', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an ordered, deduplicated extraction job', async () => {
    const intakeId = crypto.randomUUID()
    const add = vi.spyOn(ai_agents, 'add').mockResolvedValue({} as never)

    await enqueueCopyrightEmailIntakeAndWait(intakeId)

    expect(add).toHaveBeenCalledWith(
      'copyright-email-intake',
      { intake_id: intakeId },
      expect.objectContaining({
        jobId: `copyright_email_intake_${intakeId}`,
        deduplication: { id: `copyright_email_intake_${intakeId}`, mode: 'simple' },
        ordering: { key: `copyright_email_intake_${intakeId}`, concurrency: 1 },
      }),
    )
  })

  it('retries a retained failed extraction job', async () => {
    const retry = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightEmailIntake('intake-id', {
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
          name: 'copyright-email-intake',
          getState: async () => 'failed',
          retry,
          remove: async () => undefined,
        }),
      enqueue,
    })

    expect(retry).toHaveBeenCalledOnce()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('removes a completed extraction job before enqueuing recovery', async () => {
    const remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined)

    await enqueueOrRetryCopyrightEmailIntake('intake-id', {
      getJob: async () => ({
        name: 'copyright-email-intake',
        getState: async () => 'completed',
        retry: async () => undefined,
        remove,
      }),
      enqueue,
    })

    expect(remove).toHaveBeenCalledOnce()
    expect(enqueue).toHaveBeenCalledWith('intake-id')
  })
})
