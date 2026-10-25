import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'
import { OPENAI_MODERATION_IMAGE_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('per-job lock through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('does not reclaim a job as stalled while it heartbeats past several stall checks', async () => {
    // Stall checks run every second and a job's lock is one second; the wait below spans several.
    const handled: string[] = []
    const heartbeatWindowOver = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 2,
      workerOptions: { stalledInterval: 1_000 },
      bodies: {
        [SES_INBOUND_PROCESS_JOB.name]: async job => {
          handled.push(job.id)
          await heartbeatWindowOver.promise
        },
        [OPENAI_MODERATION_IMAGE_JOB.name]: () => heartbeatWindowOver.resolve(),
      },
    })
    harness.registerBeforeClose(() => heartbeatWindowOver.resolve())
    const sesMessageId = `ses-${randomUUID()}`
    const longJob = await harness.add(
      SES_INBOUND_PROCESS_JOB,
      { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}` },
      { lockDuration: 1_000 },
    )
    // GlideMQ's own delay is the clock: the long job runs until this delayed job fires.
    await harness.add(OPENAI_MODERATION_IMAGE_JOB, { id: randomUUID() }, { delay: 3_500 })

    await expect(harness.settled(longJob)).resolves.toBe('completed')

    expect(handled).toEqual([longJob.id])
    expect(harness.stalledJobIds).toEqual([])
  })
})
