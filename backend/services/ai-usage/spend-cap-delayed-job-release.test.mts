import { describe, expect, it } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  cleanUpSpendCapDay,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import {
  beginSpendCapDelayedJobRelease,
  completeSpendCapDelayedJobRelease,
} from './spend-cap-delayed-job-release.mts'
import {
  registerSpendCapDelayedJob,
  spendCapDelayedRegistryKey,
} from './spend-cap-delayed-jobs.mts'

async function drainedReleasingRegistry() {
  const day = uniqueSpendCapDay()
  cleanUpSpendCapDay(day)
  const job = spendCapDelayableJob('report-judgement', {})
  const registration = await registerSpendCapDelayedJob(job, day)
  const lease = await beginSpendCapDelayedJobRelease(day, registration.generation)
  if (!lease) throw new Error('Expected the registry to begin releasing')
  const key = spendCapDelayedRegistryKey(day)
  await workerQueueCommandClient.hdel(key, [`job:${job.id}`])
  return { day, generation: registration.generation, lease, key }
}

describe('completeSpendCapDelayedJobRelease', () => {
  it('deletes the drained registry for the owning lease', async () => {
    const { day, generation, lease, key } = await drainedReleasingRegistry()

    await expect(completeSpendCapDelayedJobRelease(day, generation, lease)).resolves.toBe(true)

    await expect(workerQueueCommandClient.exists([key])).resolves.toBe(0)
  })

  it('keeps the registry for a lease that does not own the release', async () => {
    const { day, generation, key } = await drainedReleasingRegistry()

    await expect(completeSpendCapDelayedJobRelease(day, generation, 'lease-a')).resolves.toBe(false)

    await expect(workerQueueCommandClient.hget(key, '__mode')).resolves.toBe('releasing')
  })
})
