import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import type { OpenAiSpendCapBreachContext } from '@modules/on-error/openai-spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { getDayBounds } from '@ts-shared/utils/dates'
import { processAIAgentWorkerJob } from '../core.mts'

function job(): Job<AIAgentJobData> {
  return {
    data: {} as AIAgentJobData,
    id: randomUUID(),
    name: 'chat',
    reportTokens: vi.fn<(count: number) => Promise<void>>(),
    moveToDelayed: vi
      .fn<(timestamp: number, nextStep?: string) => Promise<never>>()
      .mockImplementation(async timestamp => {
        throw new DelayedError(timestamp)
      }),
  } as unknown as Job<AIAgentJobData>
}

describe('processAIAgentWorkerJob accounting uncertainty', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defers before dispatch without querying the daily total when the ledger latch is set', async () => {
    const day = '2026-08-16'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(`${day}T12:00:00.000Z`))
    const worker = {} as Worker
    const delayedJob = job()
    const getDailyAiCostTotalMicrounits = vi.fn<() => Promise<never>>()
    const getAccountingUncertaintySource = vi
      .fn<(requestDay: string) => Promise<'ledger_write_failed' | null>>()
      .mockResolvedValue('ledger_write_failed')
    const recordOpenAiSpendCapBreach = vi.fn<(context: OpenAiSpendCapBreachContext) => void>()
    const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()

    await expect(
      processAIAgentWorkerJob(delayedJob, worker, {
        waitForOpenAiSpendCapConfig: () => Promise.resolve(),
        getOpenAiSpendCapFields: () => ({ enabled: true, daily_cap_microunits: 1_000_000 }),
        getAccountingUncertaintySource,
        getDailyAiCostTotalMicrounits,
        recordOpenAiSpendCapBreach,
        processAIAgent,
      }),
    ).rejects.toThrow(DelayedError)

    expect(delayedJob.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
    expect(processAIAgent).not.toHaveBeenCalled()
    expect(getDailyAiCostTotalMicrounits).not.toHaveBeenCalled()
    expect(recordOpenAiSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
      agentJobName: 'chat',
      dailyTotalMicrounits: null,
      dailyCapMicrounits: 1_000_000,
      reason: 'accounting_uncertain',
      uncertaintySource: 'ledger_write_failed',
    })
  })
})
