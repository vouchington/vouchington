import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { background } from '@queues/background/queues'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import { processDelivery } from '@workers/activitypub/processors/inbox'
import {
  activityPubInboxDeliveryExistsOnPrimaryForTest,
  expireActivityPubInboxDeliveryForTest,
  makeActivityPubInboxDeliveryRecoverableForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { scopedActivityPubInboxProcessors } from '@voucha/test-helpers/activitypub-inbox-scoped-processors'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import {
  claimTestDelivery,
  exhaustTestDelivery,
} from '@voucha/test-helpers/services/ap-inbox-activities/durable-delivery-transitions.test-support'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/workers/activitypub-inbox/test-support'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('activitypub durable inbox through the production background processor', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  // Maintenance jobs are scoped to one delivery, so they never touch other tests' durable rows.
  async function runJob(
    job: BackgroundJobDefinition,
    data: object,
    scopedTo: string,
  ): Promise<unknown> {
    const scoped = scopedActivityPubInboxProcessors(scopedTo)
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: (current: Job) =>
          processDelivery(current.data, { isFinalAttempt: true }),
        [ACTIVITYPUB_RECOVER_DELIVERIES_JOB.name]: scoped.recoverDeliveries,
        [ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name]: scoped.rearmFailedDeliveries,
        [ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB.name]: scoped.cleanupExpiredDeliveries,
      },
    })
    const added = await harness.add(job, data, { attempts: 1 })
    await expect(harness.settled(added)).resolves.toBe('completed')
    return (await harness.queue.getJob(added.id))?.returnvalue
  }

  async function findProcessDeliveryJob(deliveryId: string) {
    return (await readAllQueueJobs(background)).find(
      job =>
        job.name === ACTIVITYPUB_PROCESS_DELIVERY_JOB.name &&
        (job.data as { deliveryId?: string }).deliveryId === deliveryId,
    )
  }

  it('processes a durable inbound delivery and recovers an abandoned one', async () => {
    const actor = await createApprovedRemoteActor()
    const deliveredActivityId = `${actor.actorUri}/activities/${randomUUID()}`
    const delivered = await createSignedDelivery(actor, { activityId: deliveredActivityId })
    await runJob(ACTIVITYPUB_PROCESS_DELIVERY_JOB, delivered, delivered.deliveryId)
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(deliveredActivityId)).toBe(false)

    const abandoned = await createSignedDelivery(actor)
    await makeActivityPubInboxDeliveryRecoverableForTest(abandoned.deliveryId, 'unstarted')
    const result = await runJob(ACTIVITYPUB_RECOVER_DELIVERIES_JOB, {}, abandoned.deliveryId)
    expect((result as { enqueued: number }).enqueued).toBeGreaterThanOrEqual(1)
    const recovered = await findProcessDeliveryJob(abandoned.deliveryId)
    try {
      expect(recovered?.name).toBe(ACTIVITYPUB_PROCESS_DELIVERY_JOB.name)
    } finally {
      await recovered?.remove()
      if (recovered) {
        await activityPubInboxDeliveryTransitions.reject(
          abandoned.deliveryId,
          (recovered.data as { leaseToken: string }).leaseToken,
        )
      }
    }
  })

  it('rearms a failed durable delivery and deletes an expired one', async () => {
    const actor = await createApprovedRemoteActor()
    const failed = await createSignedDelivery(actor)
    expect(await claimTestDelivery(failed.deliveryId, failed.leaseToken)).not.toBeNull()
    expect(
      await exhaustTestDelivery(failed.deliveryId, failed.leaseToken, new Error('offline')),
    ).toBe(true)
    const rearmed = await runJob(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB, {}, failed.deliveryId)
    expect(rearmed).toEqual({ enqueued: 1, hasMore: false })
    const child = await findProcessDeliveryJob(failed.deliveryId)
    try {
      expect((child?.data as { leaseToken?: string } | undefined)?.leaseToken).not.toBe(
        failed.leaseToken,
      )
    } finally {
      await child?.remove()
      if (child) {
        await activityPubInboxDeliveryTransitions.reject(
          failed.deliveryId,
          (child.data as { leaseToken: string }).leaseToken,
        )
      }
    }

    const expiredActivityId = `${actor.actorUri}/activities/${randomUUID()}`
    const expired = await createSignedDelivery(actor, { activityId: expiredActivityId })
    await expireActivityPubInboxDeliveryForTest(expired.deliveryId)
    const cleanup = await runJob(ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB, {}, expired.deliveryId)
    expect(cleanup).toMatchObject({ deletedRows: expect.any(Number) })
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(expiredActivityId)).toBe(false)
  })
})
