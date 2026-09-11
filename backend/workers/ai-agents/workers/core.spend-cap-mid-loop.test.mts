import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import { OpenAiSpendCapBreachError, type OpenAiSpendCapBreach } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// Round-16 regression (#9348): a tool loop's per-iteration recheck (run-tool-loop.mts /
// run-tool-loop-streaming.mts) can find a breach mid-job, after this job's own pre-dispatch check
// already passed -- see core.spend-cap.test.mts for that pre-dispatch path. This exercises the
// catch block that converts the resulting OpenAiSpendCapBreachError into the same
// job.moveToDelayed() defer, without double-recording the breach telemetry.

function mockJob(): Job<AIAgentJobData> {
  return {
    data: {} as AIAgentJobData,
    name: 'chat',
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

describe('processAIAgentWorkerJob -- mid-loop spend cap breach', () => {
  afterEach(() => vi.useRealTimers())

  it('defers the job via moveToDelayed when the tool loop throws OpenAiSpendCapBreachError after dispatch, without re-recording the breach or calling handleOpenAIRateLimit', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'))
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 12_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-08-16',
    }
    const job = mockJob()
    const worker = mockWorker()
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const handleOpenAIRateLimit = vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>()
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockRejectedValue(new OpenAiSpendCapBreachError(breach))
    const registerOpenAiSpendCapRecheck = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)

    await expect(
      processAIAgentWorkerJob(job, worker, {
        // Below the cap so the pre-dispatch check passes and processAIAgent actually runs.
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 10_000_000 }),
        getDailyAiCostTotalMicrounits: () =>
          Promise.resolve({ totalMicrounits: 0, hasUnpricedRows: false, day: '2026-08-16' }),
        recordOpenAiSpendCapBreach,
        handleOpenAIRateLimit,
        registerOpenAiSpendCapRecheck,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(registerOpenAiSpendCapRecheck).toHaveBeenCalledExactlyOnceWith(job, breach.day)
    expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(breach.day).endMs)
    // assertOpenAiSpendCapNotBreached already recorded the breach from inside the tool loop --
    // the catch block must not record it a second time.
    expect(recordOpenAiSpendCapBreach).not.toHaveBeenCalled()
    expect(handleOpenAIRateLimit).not.toHaveBeenCalled()
  })

  it('falls through to handleOpenAIRateLimit for a plain rate-limit error, not the spend-cap defer path', async () => {
    const job = mockJob()
    const worker = mockWorker()
    const rateLimitError = new Error('rate limited')
    const handleOpenAIRateLimit = vi
      .fn<(error: unknown, worker: Worker) => Promise<unknown>>()
      .mockResolvedValue('handled')
    const processAIAgent = vi
      .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      .mockRejectedValue(rateLimitError)

    const result = await processAIAgentWorkerJob(job, worker, {
      waitForOpenAiSpendCapConfig: () => Promise.resolve(),
      getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 10_000_000 }),
      getDailyAiCostTotalMicrounits: () =>
        Promise.resolve({ totalMicrounits: 0, hasUnpricedRows: false, day: '2026-08-16' }),
      handleOpenAIRateLimit,
      processAIAgent,
    })

    expect(result).toBe('handled')
    expect(job.moveToDelayed).not.toHaveBeenCalled()
    expect(handleOpenAIRateLimit).toHaveBeenCalledExactlyOnceWith(rateLimitError, worker)
  })
})
