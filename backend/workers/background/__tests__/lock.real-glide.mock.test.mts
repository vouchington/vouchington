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

const STALL_INTERVAL_MS = 1_000
// GlideMQ refuses a shorter per-job lock, so several checks cannot fit the five-second default.
const HEARTBEAT_WINDOW_MS = STALL_INTERVAL_MS * 3 + 500
// Above the heartbeat window, below this test's timeout.
const HEARTBEAT_DEADLINE_MS = 12_000

describe('per-job lock through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  // no-mistakes-timeout-reason: one-second per-job lock spans several stall checks past the 5s default
  it('does not reclaim a job as stalled while it heartbeats past several stall checks', async () => {
    const handled: string[] = []
    const heartbeatWindowOver = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      concurrency: 2,
      workerOptions: { stalledInterval: STALL_INTERVAL_MS },
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
      { lockDuration: STALL_INTERVAL_MS },
    )
    // GlideMQ's own delay is the clock: the long job runs until this delayed job fires.
    await harness.add(
      OPENAI_MODERATION_IMAGE_JOB,
      { id: randomUUID() },
      { delay: HEARTBEAT_WINDOW_MS },
    )

    await expect(harness.settled(longJob, HEARTBEAT_DEADLINE_MS)).resolves.toBe('completed')

    expect(handled).toEqual([longJob.id])
    expect(harness.stalledJobIds).toEqual([])
  }, 15_000)
})
