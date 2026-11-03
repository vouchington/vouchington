import { describe, expect, it } from 'vitest'
import { workerQueueCommandClient } from '@data-stores/valkey-glide-mq'
import {
  cleanUpSpendCapDay,
  spendCapDelayableJob,
  uniqueSpendCapDay,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { beginSpendCapDelayedJobRelease } from './spend-cap-delayed-job-release.mts'
import {
  spendCapDelayedRegistryKey,
  registerSpendCapDelayedJob,
  reopenSpendCapDelayedJobRegistration,
} from './spend-cap-delayed-jobs.mts'

async function releasingRegistry() {
  const day = uniqueSpendCapDay()
  cleanUpSpendCapDay(day)
  const registration = await registerSpendCapDelayedJob(
    spendCapDelayableJob('report-judgement', {}),
    day,
  )
  const lease = await beginSpendCapDelayedJobRelease(day, registration.generation)
  if (!lease) throw new Error('Expected the registry to begin releasing')
  return { day, generation: registration.generation, key: spendCapDelayedRegistryKey(day) }
}

describe('reopenSpendCapDelayedJobRegistration', () => {
  it('reopens the releasing registry of the same generation', async () => {
    const { day, generation, key } = await releasingRegistry()

    await expect(reopenSpendCapDelayedJobRegistration(day, generation)).resolves.toBe(true)

    await expect(workerQueueCommandClient.hget(key, '__mode')).resolves.toBe('collecting')
    await expect(workerQueueCommandClient.hget(key, '__release_lease')).resolves.toBeNull()
  })

  it('leaves the registry releasing for a different generation', async () => {
    const { day, key } = await releasingRegistry()

    await expect(
      reopenSpendCapDelayedJobRegistration(day, 'a-generation-the-registry-never-issued'),
    ).resolves.toBe(false)

    await expect(workerQueueCommandClient.hget(key, '__mode')).resolves.toBe('releasing')
  })
})
