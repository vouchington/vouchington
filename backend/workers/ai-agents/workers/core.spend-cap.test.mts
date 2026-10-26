import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job } from 'glide-mq'
import type { DailyAiCostTotal } from '@services/ai-usage'
import type { SpendCapBreachContext } from '@modules/on-error/spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

function mockJob(
  overrides: { name?: string; data?: Partial<AIAgentJobData> } = {},
): Job<AIAgentJobData> {
  return {
    data: (overrides.data ?? {}) as AIAgentJobData,
    name: overrides.name ?? 'report-judgement',
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    // Mirrors the real glide-mq job.moveToDelayed(): always throws DelayedError, caught by the
    // Worker's own processing loop to re-park just this job (base-worker.js's handleMoveToDelayed).
    moveToDelayed: vi
      .fn<(timestamp: number, nextStep?: string) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      }),
  } as unknown as Job<AIAgentJobData>
}

function createDailyTotalLoader(
  totalMicrounits: number,
  hasUnpricedRows = false,
  day = '2026-08-16',
): () => Promise<DailyAiCostTotal> {
  return () => Promise.resolve({ totalMicrounits, hasUnpricedRows, day })
}

describe('processAIAgentWorkerJob -- daily AI spend cap', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    {
      boundary: 'UTC midnight',
      now: '2026-08-16T23:59:59.999Z',
      day: '2026-08-16',
      nextMidnight: '2026-08-17T00:00:00.000Z',
    },
    {
      boundary: 'UTC month end',
      now: '2026-08-31T23:59:59.999Z',
      day: '2026-08-31',
      nextMidnight: '2026-09-01T00:00:00.000Z',
    },
    {
      boundary: 'just after UTC month end',
      now: '2026-09-01T00:00:00.000Z',
      day: '2026-09-01',
      nextMidnight: '2026-09-02T00:00:00.000Z',
    },
  ])(
    'defers a capped job until the next UTC midnight at $boundary',
    async ({ now, day, nextMidnight }) => {
      vi.setSystemTime(new Date(now))
      const job = mockJob()
      const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      const recordSpendCapBreach = vi.fn<(context: SpendCapBreachContext) => void>()
      const registerSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
      const getDailyAiCostTotalMicrounits = vi.fn<(day?: string) => Promise<DailyAiCostTotal>>(
        createDailyTotalLoader(1_000_000, false, day),
      )

      await expect(
        processAIAgentWorkerJob(job, {
          waitForSpendCapConfig: () => Promise.resolve(),
          getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
          getAccountingUncertaintySource: async () => null,
          getDailyAiCostTotalMicrounits,
          recordSpendCapBreach,
          registerSpendCapRecheck,
          processAIAgent,
        }),
      ).rejects.toThrow(DelayedError)

      expect(processAIAgent).not.toHaveBeenCalled()
      expect(getDailyAiCostTotalMicrounits).toHaveBeenCalledExactlyOnceWith(day)
      expect(registerSpendCapRecheck).toHaveBeenCalledExactlyOnceWith(job, day)
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.parse(nextMidnight))
      expect(recordSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
        agentJobName: 'report-judgement',
        dailyTotalMicrounits: 1_000_000,
        dailyCapMicrounits: 1_000_000,
        reason: 'cap_exceeded',
      })
    },
  )

  it('dispatches normally when the daily total is below the cap', async () => {
    const job = mockJob()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, {
      waitForSpendCapConfig: () => Promise.resolve(),
      getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getAccountingUncertaintySource: async () => null,
      getDailyAiCostTotalMicrounits: createDailyTotalLoader(100),
      handleOpenAIRateLimit:
        vi.fn<(error: unknown, job: Job<AIAgentJobData>) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('bypasses the check entirely when disabled, even with a total over the cap', async () => {
    const job = mockJob()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const result = await processAIAgentWorkerJob(job, {
      waitForSpendCapConfig: () => Promise.resolve(),
      getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit:
        vi.fn<(error: unknown, job: Job<AIAgentJobData>) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('skips the check entirely for a reconcile job, even with a total over the cap', async () => {
    const job = mockJob({ name: 'reconcile-background-responses' })
    const getSpendCapFields = vi.fn<() => { enabled: boolean; daily_cap_microunits: number }>()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, {
      waitForSpendCapConfig: () => Promise.resolve(),
      getSpendCapFields,
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit:
        vi.fn<(error: unknown, job: Job<AIAgentJobData>) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(getSpendCapFields).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('fails closed with reason unpriced_rows when an unpriced row exists in the window, even though the priced total alone is under the cap', async () => {
    const job = mockJob()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
    const recordSpendCapBreach = vi.fn<(context: SpendCapBreachContext) => void>()
    const registerSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, {
        waitForSpendCapConfig: () => Promise.resolve(),
        getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: async () => null,
        getDailyAiCostTotalMicrounits: createDailyTotalLoader(100, true),
        recordSpendCapBreach,
        registerSpendCapRecheck,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(processAIAgent).not.toHaveBeenCalled()
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
    expect(recordSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'report-judgement',
      dailyTotalMicrounits: 100,
      dailyCapMicrounits: 1_000_000,
      reason: 'unpriced_rows',
    })
  })

  it('skips the check entirely for an auto-dispatch-judgement job, even with a total over the cap', async () => {
    const job = mockJob({ name: 'auto-dispatch-judgement' })
    const getSpendCapFields = vi.fn<() => { enabled: boolean; daily_cap_microunits: number }>()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, {
      waitForSpendCapConfig: () => Promise.resolve(),
      getSpendCapFields,
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit:
        vi.fn<(error: unknown, job: Job<AIAgentJobData>) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(getSpendCapFields).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it.each([
    {
      boundary: 'UTC midnight',
      before: '2026-03-01T23:59:59.999Z',
      beforeDay: '2026-03-01',
      after: '2026-03-02T00:00:00.000Z',
      afterDay: '2026-03-02',
    },
    {
      boundary: 'UTC month end',
      before: '2026-08-31T23:59:59.999Z',
      beforeDay: '2026-08-31',
      after: '2026-09-01T00:00:00.000Z',
      afterDay: '2026-09-01',
    },
  ])(
    'restarts the cap check when $boundary crosses during the daily-total read',
    async ({ before, beforeDay, after, afterDay }) => {
      vi.setSystemTime(new Date(before))
      const queriedDays: string[] = []
      const job = mockJob()
      const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      processAIAgent.mockResolvedValue('ok')
      const recordSpendCapBreach = vi.fn<(context: SpendCapBreachContext) => void>()
      const registerSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

      await expect(
        processAIAgentWorkerJob(job, {
          waitForSpendCapConfig: () => Promise.resolve(),
          getSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
          getAccountingUncertaintySource: async () => null,
          getDailyAiCostTotalMicrounits: async (day = afterDay) => {
            queriedDays.push(day)
            if (day === beforeDay) vi.setSystemTime(new Date(after))
            return {
              totalMicrounits: day === beforeDay ? 2_000_000 : 100,
              hasUnpricedRows: false,
              day,
            }
          },
          recordSpendCapBreach,
          registerSpendCapRecheck,
          processAIAgent,
        }),
      ).resolves.toBe('ok')
      expect(queriedDays).toEqual([beforeDay, afterDay])
      expect(processAIAgent).toHaveBeenCalledOnce()
      expect(job.moveToDelayed).not.toHaveBeenCalled()
    },
  )
})
