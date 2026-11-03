import { describe, expect, it } from 'vitest'
import { DelayedError } from 'glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { spendCapDelayedRegistryKey } from '@services/ai-usage'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  cleanUpSpendCapDay,
  findSpendCapRechecks,
  seedReleasingSpendCapRegistry,
  spendCapDelayableJob,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { delayForSpendCap } from './spend-cap-delay.mts'

function aiAgentJob() {
  return spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
}

async function recheckGenerations(day: string): Promise<unknown[]> {
  return (await findSpendCapRechecks(day)).map(
    job => (job.data as { generation: unknown }).generation,
  )
}

describe('AI spend-cap registration freshness', () => {
  it('keeps a persistent same-day breach parked until midnight after a stale registry rejection', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const generation = await seedReleasingSpendCapRegistry(day)
      const job = aiAgentJob()

      await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)

      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(getDayBounds(day).endMs)
      const registryKey = spendCapDelayedRegistryKey(day)
      await expect(workerQueueCommandClient.hget(registryKey, `job:${job.id}`)).resolves.toBe(
        'marked',
      )
      await expect(workerQueueCommandClient.hget(registryKey, '__mode')).resolves.toBe('collecting')
      await expect(recheckGenerations(day)).resolves.toEqual([generation])
    })
  })

  it('uses the short retry only when a stale registry rejection has cleared', async () => {
    await withReservedAiUsageDay(1_000_000, async day => {
      cleanUpSpendCapDay(day)
      const generation = await seedReleasingSpendCapRegistry(day)
      const job = aiAgentJob()

      await expect(delayForSpendCap(job, day)).rejects.toThrow(DelayedError)

      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 1_000)
      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBeNull()
      await expect(recheckGenerations(day)).resolves.toEqual([generation])
    })
  })
})
