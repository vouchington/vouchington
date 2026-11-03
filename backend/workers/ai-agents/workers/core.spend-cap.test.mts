import { describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job } from 'glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { spendCapDelayedRegistryKey } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { recordSpendCapBreach as RecordSpendCapBreach } from '@modules/on-error/spend-cap-breach'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  cleanUpSpendCapDay,
  findSpendCapRechecks,
  spendCapDelayableJob,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { processAIAgentWorkerJob } from './core.mts'

function aiAgentJob(name = 'report-judgement') {
  return spendCapDelayableJob(name, {} as AIAgentJobData)
}

describe('processAIAgentWorkerJob -- daily AI spend cap', () => {
  it('defers a capped job until the next UTC midnight and registers it for the coordinator', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const job = aiAgentJob()
      const processAIAgent = vi.fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
      const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()

      await expect(
        processAIAgentWorkerJob(job, { processAIAgent, recordSpendCapBreach }),
      ).rejects.toThrow(DelayedError)

      expect(processAIAgent).not.toHaveBeenCalled()
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      expect(recordSpendCapBreach).toHaveBeenCalledExactlyOnceWith({
        agentJobName: 'report-judgement',
        dailyTotalMicrounits: 1,
        dailyCapMicrounits: 0,
        reason: 'cap_exceeded',
      })
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBe('marked')
      await expect(findSpendCapRechecks(day)).resolves.toHaveLength(1)
    })
  })

  it('dispatches normally when the daily total is below the cap', async () => {
    await withReservedAiUsageDay(1_000_000, async () => {
      const job = aiAgentJob()
      const processAIAgent = vi
        .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
        .mockResolvedValue('ok')

      await expect(processAIAgentWorkerJob(job, { processAIAgent })).resolves.toBe('ok')

      expect(processAIAgent).toHaveBeenCalledOnce()
      expect(job.moveToDelayed).not.toHaveBeenCalled()
    })
  })

  it.each(['reconcile-auto-dispatch-judgements', 'auto-dispatch-judgement'])(
    'skips the check for a %s job, even during a breach',
    async name => {
      await withReservedAiUsageDay(0, async () => {
        const job = aiAgentJob(name)
        const processAIAgent = vi
          .fn<(job: Job<AIAgentJobData>) => Promise<unknown>>()
          .mockResolvedValue('ok')
        const recordSpendCapBreach = vi.fn<typeof RecordSpendCapBreach>()

        await expect(
          processAIAgentWorkerJob(job, { processAIAgent, recordSpendCapBreach }),
        ).resolves.toBe('ok')

        expect(processAIAgent).toHaveBeenCalledOnce()
        expect(job.moveToDelayed).not.toHaveBeenCalled()
        expect(recordSpendCapBreach).not.toHaveBeenCalled()
      })
    },
  )
})
