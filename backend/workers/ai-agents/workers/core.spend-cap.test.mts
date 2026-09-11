import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import type { DailyAiCostTotal } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

function mockJob(
  overrides: { name?: string; data?: Partial<AIAgentJobData> } = {},
): Job<AIAgentJobData> {
  return {
    data: (overrides.data ?? {}) as AIAgentJobData,
    name: overrides.name ?? 'chat',
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

function mockWorker(): Worker {
  return { rateLimit: vi.fn<(ms: number) => Promise<void>>() } as unknown as Worker
}

function createDailyTotalLoader(
  totalMicrounits: number,
  hasUnpricedRows = false,
): () => Promise<DailyAiCostTotal> {
  return () => Promise.resolve({ totalMicrounits, hasUnpricedRows, day: '2026-08-16' })
}

describe('processAIAgentWorkerJob -- daily OpenAI spend cap', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defers the job via moveToDelayed and throws before dispatch once the daily total reaches the cap, without invoking processAIAgent', async () => {
    const job = mockJob()
    const worker = mockWorker()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, worker, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getDailyAiCostTotalMicrounits: createDailyTotalLoader(1_000_000),
        recordOpenAiSpendCapBreach,
        registerOpenAiSpendCapRecheck,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(processAIAgent).not.toHaveBeenCalled()
    expect(worker.rateLimit).not.toHaveBeenCalled()
    expect(registerOpenAiSpendCapRecheck).toHaveBeenCalledExactlyOnceWith(
      job,
      new Date().toISOString().slice(0, 10),
    )
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(
      getDayBounds(new Date().toISOString().slice(0, 10)).endMs,
    )
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'chat',
      dailyTotalMicrounits: 1_000_000,
      dailyCapMicrounits: 1_000_000,
      reason: 'cap_exceeded',
    })
  })

  it('dispatches normally when the daily total is below the cap', async () => {
    const job = mockJob()
    const worker = mockWorker()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits: createDailyTotalLoader(100),
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(worker.rateLimit).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('bypasses the check entirely when disabled, even with a total over the cap', async () => {
    const job = mockJob()
    const worker = mockWorker()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 1_000_000 }),
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(worker.rateLimit).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('skips the check entirely for a reconcile job, even with a total over the cap', async () => {
    const job = mockJob({ name: 'reconcile-background-responses' })
    const worker = mockWorker()
    const getOpenAiSpendCapFields =
      vi.fn<() => { enabled: boolean; daily_cap_microunits: number }>()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields,
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(getOpenAiSpendCapFields).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('fails closed with reason unpriced_rows when an unpriced row exists in the window, even though the priced total alone is under the cap', async () => {
    const job = mockJob()
    const worker = mockWorker()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, worker, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getDailyAiCostTotalMicrounits: createDailyTotalLoader(100, true),
        recordOpenAiSpendCapBreach,
        registerOpenAiSpendCapRecheck,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(processAIAgent).not.toHaveBeenCalled()
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'chat',
      dailyTotalMicrounits: 100,
      dailyCapMicrounits: 1_000_000,
      reason: 'unpriced_rows',
    })
  })

  it('skips the check entirely for a chat job explicitly routed to Anthropic, even with a total over the cap', async () => {
    const job = mockJob({ data: { modelProvider: 'anthropic' } })
    const worker = mockWorker()
    const getOpenAiSpendCapFields =
      vi.fn<() => { enabled: boolean; daily_cap_microunits: number }>()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields,
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(getOpenAiSpendCapFields).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('skips the check entirely for an auto-dispatch-judgement job, even with a total over the cap', async () => {
    const job = mockJob({ name: 'auto-dispatch-judgement' })
    const worker = mockWorker()
    const getOpenAiSpendCapFields =
      vi.fn<() => { enabled: boolean; daily_cap_microunits: number }>()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<DailyAiCostTotal>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockResolvedValue('ok')

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields,
      getDailyAiCostTotalMicrounits,
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent,
    })

    expect(result).toBe('ok')
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(getOpenAiSpendCapFields).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
  })

  it('restarts the cap check when midnight crosses during the daily-total read', async () => {
    vi.setSystemTime(new Date('2026-03-01T23:59:59.000Z'))
    const queriedDays: string[] = []
    const job = mockJob()
    const worker = mockWorker()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
    processAIAgent.mockResolvedValue('ok')
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, worker, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource: async () => null,
        getDailyAiCostTotalMicrounits: async (day = '2026-03-02') => {
          queriedDays.push(day)
          if (day === '2026-03-01') vi.setSystemTime(new Date('2026-03-02T00:00:05.000Z'))
          return {
            totalMicrounits: day === '2026-03-01' ? 2_000_000 : 100,
            hasUnpricedRows: false,
            day,
          }
        },
        recordOpenAiSpendCapBreach,
        registerOpenAiSpendCapRecheck,
        processAIAgent,
      }),
    ).resolves.toBe('ok')
    expect(queriedDays).toEqual(['2026-03-01', '2026-03-02'])
    expect(processAIAgent).toHaveBeenCalledOnce()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })
})
