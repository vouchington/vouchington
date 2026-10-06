import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { enqueueSpendCapRecheck } from '@queues/ai-agents/enqueues/spend-cap-recheck'
import { registerSpendCapDelayedJob } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from './core.mts'
import { registerSpendCapRecheck as registerRecheck } from '../processors/spend-cap-recheck.mts'

function delayedJob<T>(data: T): Job<T> {
  return {
    data,
    name: 'report-judgement',
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    updateData: vi.fn<(nextData: T) => Promise<void>>(),
    moveToDelayed: vi
      .fn<(timestamp: number) => Promise<void>>()
      .mockRejectedValue(new Error('delayed')),
  } as unknown as Job<T>
}

function mockWorker(): Worker {
  return { rateLimit: vi.fn<(ms: number) => Promise<void>>() } as unknown as Worker
}

describe('AI spend-cap registration timing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('registers the current UTC generation before moving the job to its day end', async () => {
    const day = '2026-08-16'
    vi.setSystemTime(new Date('2026-08-16T23:59:30.000Z'))
    const job = delayedJob({} as AIAgentJobData)
    const register = vi
      .fn<typeof registerSpendCapDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueue = vi.fn<typeof enqueueSpendCapRecheck>().mockResolvedValue(null)

    await expect(
      processAIAgentWorkerJob(job, mockWorker(), {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerSpendCapRecheck: (registeredJob, registeredDay) =>
          registerRecheck(registeredJob, registeredDay, Date.now(), {
            registerSpendCapDelayedJob: register,
            enqueueSpendCapRecheck: enqueue,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(register).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 30_000)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('queues an expired UTC-day generation for immediate recheck', async () => {
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
    const day = '2026-08-15'
    const job = delayedJob({} as AIAgentJobData)
    const register = vi
      .fn<typeof registerSpendCapDelayedJob>()
      .mockResolvedValue({ accepted: true, generation: 'generation-a' })
    const enqueue = vi.fn<typeof enqueueSpendCapRecheck>().mockResolvedValue(null)

    await expect(
      registerRecheck(job, day, Date.now(), {
        registerSpendCapDelayedJob: register,
        enqueueSpendCapRecheck: enqueue,
      }),
    ).resolves.toBe(true)

    expect(register).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 0)
  })
})
