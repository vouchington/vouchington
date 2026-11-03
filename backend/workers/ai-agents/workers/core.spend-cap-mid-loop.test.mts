import { describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job } from 'glide-mq'
import { RateLimitError } from 'openai'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { SpendCapBreachError, spendCapDelayedRegistryKey } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { recordSpendCapBreach as RecordSpendCapBreach } from '@modules/on-error/spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { cleanUpSpendCapDay, spendCapDelayableJob } from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { processAIAgentWorkerJob } from './core.mts'

// Round-16 regression (#9348): a tool loop's per-iteration recheck (run-tool-loop.mts)
// can find a breach mid-job, after this job's own pre-dispatch check
// already passed -- see core.spend-cap.test.mts for that pre-dispatch path. This exercises the
// catch block that converts the resulting SpendCapBreachError into the same
// job.moveToDelayed() defer, without double-recording the breach telemetry.

describe('processAIAgentWorkerJob -- mid-loop spend cap breach', () => {
  it('defers the job when the tool loop throws SpendCapBreachError after dispatch, without re-recording the breach', async () => {
    await withReservedAiUsageDay(10_000_000, async day => {
      cleanUpSpendCapDay(day)
      const job = spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
      const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()
      const processAIAgent = vi
        .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
        .mockRejectedValue(
          new SpendCapBreachError({
            reason: 'cap_exceeded',
            totalMicrounits: 12_000_000,
            dailyCapMicrounits: 10_000_000,
            day,
          }),
        )

      await expect(
        processAIAgentWorkerJob(job, { recordSpendCapBreach, processAIAgent }),
      ).rejects.toThrow(DelayedError)

      expect(processAIAgent).toHaveBeenCalledOnce()
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBe('marked')
      // assertDailySpendCapNotBreached already recorded the breach from inside the tool loop --
      // the catch block must not record it a second time.
      expect(recordSpendCapBreach).not.toHaveBeenCalled()
    })
  })

  it('parks a provider rate limit for its Retry-After, not at the spend-cap day boundary', async () => {
    await withReservedAiUsageDay(10_000_000, async day => {
      cleanUpSpendCapDay(day)
      const job = spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
      const rateLimit = new RateLimitError(
        429,
        {},
        'rate limited',
        new Headers({ 'retry-after': '30' }),
      )

      await expect(
        processAIAgentWorkerJob(job, { processAIAgent: () => Promise.reject(rateLimit) }),
      ).rejects.toThrow(DelayedError)

      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBeNull()
    })
  })
})
