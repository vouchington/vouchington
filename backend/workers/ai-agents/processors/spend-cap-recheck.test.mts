import { describe, expect, it, vi } from 'vitest'
import { DelayedError } from 'glide-mq'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import { getDailyAiCostTotalMicrounits, spendCapDelayedRegistryKey } from '@services/ai-usage'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { insertTestAiUsageRecord } from '@voucha/test-helpers/entities/ai-usage'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'
import { getDayBounds } from '@ts-shared/utils/dates'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  cleanUpSpendCapDay,
  findSpendCapRechecks,
  rejectRegistryScriptsForTest,
  seedReleasingSpendCapRegistry,
  spendCapDelayableJob,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { delayForSpendCap } from './spend-cap-delay.mts'
import { registerSpendCapRecheck } from './spend-cap-recheck.mts'

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

describe('AI spend-cap registration after a rejected first attempt', () => {
  it('re-registers on a fresh total read even when a cached total is still under the cap', async () => {
    await withReservedAiUsageDay(100, async day => {
      cleanUpSpendCapDay(day)
      const generation = await seedReleasingSpendCapRegistry(day)
      // Prime the cache while the day is still under the cap, then push it over the cap.
      await expect(getDailyAiCostTotalMicrounits(day)).resolves.toEqual({
        totalMicrounits: 0,
        day,
      })
      await insertTestAiUsageRecord({
        id: timestampToUuidv7LowerBound(Date.now()),
        costMicrounits: 101,
      })
      const job = aiAgentJob()

      await expect(registerSpendCapRecheck(job, day)).resolves.toBe(true)

      await expect(
        workerQueueCommandClient.hget(spendCapDelayedRegistryKey(day), `job:${job.id}`),
      ).resolves.toBe('marked')
      await expect(recheckGenerations(day)).resolves.toEqual([generation])
    })
  })

  it('fails closed without enqueueing when a fresh breach cannot re-register the delayed job', async () => {
    await withReservedAiUsageDay(0, async day => {
      cleanUpSpendCapDay(day)
      const add = vi.spyOn(backgroundCpu, 'add')
      const invokeScript = rejectRegistryScriptsForTest()
      const job = aiAgentJob()

      await expect(registerSpendCapRecheck(job, day)).rejects.toThrow(
        'Fresh AI spend-cap breach did not reopen delayed-job registration',
      )

      expect(invokeScript).toHaveBeenCalledTimes(2)
      expect(add).not.toHaveBeenCalled()
      await expect(findSpendCapRechecks(day)).resolves.toHaveLength(0)
    })
  })
})
