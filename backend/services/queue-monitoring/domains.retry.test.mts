import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, onTestFinished } from 'vitest'
import { closeAndUnregisterGlideMQInstance, createWorker } from '@data-stores/valkey-glide-mq'
import { createTestUser } from '@voucha/test-helpers'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  SES_INBOUND_PROCESS_JOB,
  SES_INBOUND_RECONCILE_JOB,
} from '@queues/background/enqueues/ses-inbound-jobs'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { background } from '@queues/background/queues'
import { retryManagedQueueDomainFailedJobs } from './domains.mts'
import { queueMonitoringWorkConfig } from './work-limits.mts'

// A worker that fails every job it is given, so the jobs below stay failed until retried.
const worker = createWorker(BACKGROUND_QUEUE_NAME, async () => {
  throw new Error('seeded failure')
})
const failedJobIds: string[] = []

async function seedFailedJob(
  definition: typeof SES_INBOUND_PROCESS_JOB | typeof SES_INBOUND_RECONCILE_JOB,
): Promise<void> {
  const jobId = `ses-domain-retry-${randomUUID()}`
  failedJobIds.push(jobId)
  await expect(
    background.add(
      definition.name,
      {},
      {
        ...definition.options,
        jobId,
        attempts: 1,
        removeOnFail: 1_000,
      },
    ),
  ).rejects.toThrow('seeded failure')
}

describe('retrying the failed jobs of a background domain', () => {
  afterEach(async () => {
    await Promise.all(
      failedJobIds.splice(0).map(async id => (await background.getJob(id))?.remove()),
    )
  })

  afterAll(() => closeAndUnregisterGlideMQInstance(worker))

  it('replays a failed job of the domain and counts it as retried', async () => {
    const admin = await createTestUser({ administrator: true })
    await seedFailedJob(SES_INBOUND_PROCESS_JOB)

    const result = await retryManagedQueueDomainFailedJobs(admin, 'background', 'ses-inbound')

    expect(result).toEqual({ success: true, retried: 1 })
  })

  it('shares the configured retry budget across different job names', async () => {
    const admin = await createTestUser({ administrator: true })
    await Promise.all([
      seedFailedJob(SES_INBOUND_PROCESS_JOB),
      seedFailedJob(SES_INBOUND_RECONCILE_JOB),
    ])
    await queueMonitoringWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(queueMonitoringWorkConfig, { retry_failed_limit: 1 }),
    )

    const result = await retryManagedQueueDomainFailedJobs(admin, 'background', 'ses-inbound')

    expect(result).toEqual({ success: true, retried: 1 })
  })
})
