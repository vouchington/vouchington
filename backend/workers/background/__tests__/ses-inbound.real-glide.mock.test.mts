import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('a worker that serves only SES inbound', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('parks a registered job of a domain it does not serve', async () => {
    // The harness queue is private to this test, so no worker of the shared fleet can take the job.
    // The worker applies a deferral after its processor returns and runs one job at a time, so a
    // sentinel job that has completed proves the deferral was applied before the state is read.
    harness = await startBackgroundHarness({
      connection,
      createProcessor: handlers =>
        createBackgroundProcessor(
          new Map([...handlers].filter(([, handler]) => handler.job.domain === 'ses-inbound')),
        ),
    })
    const unserved = await harness.add(OPENAI_MODERATION_POST_JOB, { id: crypto.randomUUID() })
    await harness.activated(unserved, 1)
    const sentinel = await harness.add(SES_INBOUND_PROCESS_JOB, {
      sesMessageId: 'sentinel',
      objectKey: 'copyright-incoming/sentinel',
    })
    await expect(harness.settled(sentinel)).resolves.toBe('completed')

    const parked = await harness.queue.getJob(unserved.id)
    expect(await parked?.getState()).toBe('delayed')
    expect(parked?.attemptsMade).toBe(0)
  })
})
