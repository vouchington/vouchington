import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { processDelivery } from '@workers/activitypub/processors/inbox'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'
import { startBackgroundHarness } from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('ActivityPub signed envelope through the production background processor', () => {
  it('processes an accepted envelope from job data and clears the sensitive receipt', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, {
      activityId: `${actor.actorUri}/activities/${randomUUID()}`,
    })
    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: (job: Job) =>
          processDelivery(job.data, {
            moveToDelayed: timestamp => job.moveToDelayed(timestamp),
            updateData: data => job.updateData(data),
          }),
      },
    })
    try {
      const added = await harness.add(ACTIVITYPUB_PROCESS_DELIVERY_JOB, delivery)
      expect(await harness.settled(added)).toBe('completed')
      expect(await harness.queue.getJob(added.id)).toBeNull()
    } finally {
      await harness.close()
    }
  })

  it('completes a terminally rejected signature without retaining its signed body', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })
    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: (job: Job) =>
          processDelivery(job.data, {
            moveToDelayed: timestamp => job.moveToDelayed(timestamp),
            updateData: data => job.updateData(data),
          }),
      },
    })
    try {
      const added = await harness.add(ACTIVITYPUB_PROCESS_DELIVERY_JOB, delivery)
      expect(await harness.settled(added)).toBe('completed')
      expect(await harness.queue.getJob(added.id)).toBeNull()
    } finally {
      await harness.close()
    }
  })
})
