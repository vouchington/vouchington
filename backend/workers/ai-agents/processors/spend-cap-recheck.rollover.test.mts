import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData, SpendCapRecheckJobData } from '@queues/ai-agents/types'
import {
  registerSpendCapDelayedJob,
  spendCapConfig,
  spendCapDelayedRegistryKey,
} from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import {
  cleanUpSpendCapDay,
  disableSpendCapForTest,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { processSpendCapRecheckJob } from './spend-cap-recheck.mts'

describe('AI spend-cap recheck rollover', () => {
  it('uses the completion-time UTC boundary when beginning a release drain', async () => {
    const day = uniqueSpendCapDay()
    const { endMs } = getDayBounds(day)
    cleanUpSpendCapDay(day)
    disableSpendCapForTest()
    // A waiting job is retained by a drain begun before the boundary and removed by one begun after it.
    const waiting = await ai_agents.add('report-judgement', {
      spendCapDelayedDay: day,
    } as AIAgentJobData)
    if (!waiting) throw new Error('Expected the waiting spend-cap job')
    onTestFinished(() => waiting.remove())
    const registration = await registerSpendCapDelayedJob(waiting, day)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(endMs - 1))
    // The boundary is crossed while the recheck reads its configuration, before the drain begins.
    const spy = vi.spyOn(spendCapConfig, 'waitForInitialization').mockImplementation(async () => {
      vi.setSystemTime(new Date(endMs + 1))
    })
    const job = spendCapDelayableJob<SpendCapRecheckJobData>('ai-spend-cap.recheck', {
      day,
      generation: registration.generation,
    })

    try {
      await expect(processSpendCapRecheckJob(job)).resolves.toBeUndefined()
    } finally {
      spy.mockRestore()
      vi.useRealTimers()
    }

    expect(job.moveToDelayed).not.toHaveBeenCalled()
    await expect(workerQueueCommandClient.hlen(spendCapDelayedRegistryKey(day))).resolves.toBe(0)
  })
})
