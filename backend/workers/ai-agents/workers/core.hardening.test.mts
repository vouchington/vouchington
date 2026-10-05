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

  it.each([
    { day: '2026-08-16', now: '2026-08-16T23:59:30.000Z', expectedDelayMs: 30_000 },
    { day: '2026-08-15', now: '2026-08-16T12:00:00.000Z', expectedDelayMs: 0 },
  ])(
    'registers the $day generation before moving the job to its UTC day end',
    async ({ day, now, expectedDelayMs }) => {
      vi.setSystemTime(new Date(now))
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
      expect(enqueue).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', expectedDelayMs)
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
    },
  )
})
