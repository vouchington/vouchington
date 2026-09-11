import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { enqueueOpenAiSpendCapRecheck } from '@queues/ai-agents/enqueues/spend-cap-recheck'
import {
  refreshDailyAiCostTotalMicrounits,
  registerOpenAiSpendCapDelayedJob,
  registerOpenAiSpendCapDelayedJobAfterFreshBreach,
} from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from '../workers/core.mts'
import { registerOpenAiSpendCapRecheck } from './spend-cap-recheck.mts'

function delayedJob(): Job<AIAgentJobData> {
  return {
    id: randomUUID(),
    name: 'chat',
    data: {} as AIAgentJobData,
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    moveToDelayed: vi
      .fn<(timestamp: number) => Promise<void>>()
      .mockRejectedValue(new Error('delayed')),
  } as unknown as Job<AIAgentJobData>
}

function worker(): Worker {
  return { rateLimit: vi.fn<(ms: number) => Promise<void>>() } as unknown as Worker
}

describe('OpenAI spend-cap registration freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('keeps a persistent same-day breach parked until midnight after a stale registry rejection', async () => {
    const day = '2026-08-16'
    const job = delayedJob()
    const register = vi
      .fn<typeof registerOpenAiSpendCapDelayedJob>()
      .mockResolvedValue({ accepted: false, generation: 'generation-a' })
    const registerAfterFreshBreach = vi
      .fn<typeof registerOpenAiSpendCapDelayedJobAfterFreshBreach>()
      .mockResolvedValue({ accepted: true, generation: 'generation-b' })
    const enqueue = vi.fn<typeof enqueueOpenAiSpendCapRecheck>().mockResolvedValue(null)
    const evaluateOpenAiSpendCapBreach = vi
      .fn<
        () => Promise<{
          day: string
          reason: 'cap_exceeded'
          totalMicrounits: number
          dailyCapMicrounits: number
        }>
      >()
      .mockResolvedValue({ reason: 'cap_exceeded', totalMicrounits: 1, dailyCapMicrounits: 1, day })
    const refresh = vi.fn<typeof refreshDailyAiCostTotalMicrounits>()

    await expect(
      processAIAgentWorkerJob(job, worker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck: (registeredJob, registeredDay) =>
          registerOpenAiSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerOpenAiSpendCapDelayedJob: register,
            registerOpenAiSpendCapDelayedJobAfterFreshBreach: registerAfterFreshBreach,
            enqueueOpenAiSpendCapRecheck: enqueue,
            evaluateOpenAiSpendCapBreach,
            refreshDailyAiCostTotalMicrounits: refresh,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(registerAfterFreshBreach).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(day, 'generation-b', 0)
    expect(evaluateOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      getDailyAiCostTotalMicrounits: refresh,
    })
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
  })

  it('uses the short retry only when a stale registry rejection has cleared', async () => {
    const day = '2026-08-16'
    const job = delayedJob()
    const register = vi
      .fn<typeof registerOpenAiSpendCapDelayedJob>()
      .mockResolvedValue({ accepted: false, generation: 'generation-a' })
    const registerAfterFreshBreach =
      vi.fn<typeof registerOpenAiSpendCapDelayedJobAfterFreshBreach>()
    const enqueue = vi.fn<typeof enqueueOpenAiSpendCapRecheck>().mockResolvedValue(null)
    const evaluateOpenAiSpendCapBreach = vi.fn<() => Promise<null>>().mockResolvedValue(null)
    const refresh = vi.fn<typeof refreshDailyAiCostTotalMicrounits>()

    await expect(
      processAIAgentWorkerJob(job, worker(), {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 1, hasUnpricedRows: false, day }),
        registerOpenAiSpendCapRecheck: (registeredJob, registeredDay) =>
          registerOpenAiSpendCapRecheck(registeredJob, registeredDay, Date.now(), {
            registerOpenAiSpendCapDelayedJob: register,
            registerOpenAiSpendCapDelayedJobAfterFreshBreach: registerAfterFreshBreach,
            enqueueOpenAiSpendCapRecheck: enqueue,
            evaluateOpenAiSpendCapBreach,
            refreshDailyAiCostTotalMicrounits: refresh,
          }),
      }),
    ).rejects.toThrow('delayed')

    expect(enqueue).toHaveBeenCalledExactlyOnceWith(day, 'generation-a', 0)
    expect(registerAfterFreshBreach).not.toHaveBeenCalled()
    expect(evaluateOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      getDailyAiCostTotalMicrounits: refresh,
    })
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
  })

  it('fails closed without enqueueing when a fresh breach cannot re-register the delayed job', async () => {
    const day = '2026-08-16'
    const job = delayedJob()
    const register = vi
      .fn<typeof registerOpenAiSpendCapDelayedJob>()
      .mockResolvedValue({ accepted: false, generation: 'generation-a' })
    const registerAfterFreshBreach = vi
      .fn<typeof registerOpenAiSpendCapDelayedJobAfterFreshBreach>()
      .mockResolvedValue({ accepted: false, generation: 'generation-b' })
    const enqueue = vi.fn<typeof enqueueOpenAiSpendCapRecheck>().mockResolvedValue(null)

    await expect(
      registerOpenAiSpendCapRecheck(job, day, Date.now(), {
        registerOpenAiSpendCapDelayedJob: register,
        registerOpenAiSpendCapDelayedJobAfterFreshBreach: registerAfterFreshBreach,
        enqueueOpenAiSpendCapRecheck: enqueue,
        evaluateOpenAiSpendCapBreach: () =>
          Promise.resolve({
            reason: 'cap_exceeded',
            totalMicrounits: 1,
            dailyCapMicrounits: 1,
            day,
          }),
        refreshDailyAiCostTotalMicrounits: vi.fn<typeof refreshDailyAiCostTotalMicrounits>(),
      }),
    ).rejects.toThrow('Fresh OpenAI spend-cap breach did not reopen delayed-job registration')

    expect(registerAfterFreshBreach).toHaveBeenCalledExactlyOnceWith(job, day)
    expect(enqueue).not.toHaveBeenCalled()
  })
})
