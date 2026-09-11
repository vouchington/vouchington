import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import type { DailyAiCostTotal } from '@services/ai-usage'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// Baseline-moderation spend-cap exemptions (#8773 review round 11): `moderation-dispatcher` never
// calls OpenAI itself, and the `ai-generated` moderator routes to a local, spend-free detector --
// see core.spend-cap.test.mts for the general cap-enforcement suite.

function mockJob(
  overrides: { name?: string; data?: Partial<AIAgentJobData> } = {},
): Job<AIAgentJobData> {
  return {
    data: (overrides.data ?? {}) as AIAgentJobData,
    name: overrides.name ?? 'chat',
    id: randomUUID(),
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
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

function createDailyTotalLoader(totalMicrounits: number): () => Promise<DailyAiCostTotal> {
  return () => Promise.resolve({ totalMicrounits, hasUnpricedRows: false, day: '2026-08-16' })
}

describe('processAIAgentWorkerJob -- baseline moderation spend-cap exemptions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skips the check entirely for a moderation-dispatcher job, even with a total over the cap', async () => {
    const job = mockJob({ name: 'moderation-dispatcher', data: { id: 'post-1' } })
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

  it('skips the check entirely for a moderation-prompt job on the spend-free ai-generated moderator, even with a total over the cap', async () => {
    const job = mockJob({
      name: 'moderation-prompt',
      data: { id: 'post-1', moderatorSlug: 'ai-generated' },
    })
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

  it('still enforces the cap for a moderation-prompt job on a non-exempt moderator', async () => {
    const job = mockJob({
      name: 'moderation-prompt',
      data: { id: 'post-1', moderatorSlug: 'nsfw' },
    })
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
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(expect.any(Number))
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'moderation-prompt',
      dailyTotalMicrounits: 1_000_000,
      dailyCapMicrounits: 1_000_000,
      reason: 'cap_exceeded',
    })
  })
})
