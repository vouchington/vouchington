import { randomUUID } from 'node:crypto'
import type { Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB,
  ACTIVITYPUB_PROCESS_DELIVERY_JOB,
  ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB,
  ACTIVITYPUB_RECOVER_DELIVERIES_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import { background } from '@queues/background/queues'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import {
  enqueueActivityPubInboxDelivery,
  getActivityPubInboxDeliveryJobStatus,
  removeFailedActivityPubInboxDelivery,
  enqueueBulkActivityPubInboxDeliveries,
  enqueueRecoverActivityPubInboxDeliveriesContinuation,
} from '@queues/activitypub/enqueues/inbox'
import { processDelivery, recoverDeliveries } from '@workers/activitypub/processors/inbox'
import {
  activityPubInboxDeliveryExistsOnPrimaryForTest,
  expireActivityPubInboxDeliveryForTest,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { scopedActivityPubInboxProcessors } from '@voucha/test-helpers/activitypub-inbox-scoped-processors'
import { startBackgroundHarness } from '@voucha/test-helpers/real-glide-background'
import {
  loadTestDelivery,
  exhaustTestDelivery,
  registerActivityPubInboxAdmission,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

registerActivityPubInboxAdmission()

describe('activitypub durable inbox through the production background processor', () => {
  // Maintenance jobs are scoped to one delivery, so they never touch other tests' durable rows.
  async function runJob(
    job: BackgroundJobDefinition,
    data: object,
    scopedTo: string,
  ): Promise<unknown> {
    const scoped = scopedActivityPubInboxProcessors(scopedTo)
    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: (current: Job) =>
          processDelivery(current.data, {
            isFinalAttempt: true,
            moveToDelayed: timestamp => current.moveToDelayed(timestamp),
          }),
        [ACTIVITYPUB_RECOVER_DELIVERIES_JOB.name]: scoped.recoverDeliveries,
        [ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB.name]: scoped.rearmFailedDeliveries,
        [ACTIVITYPUB_CLEANUP_EXPIRED_DELIVERIES_JOB.name]: scoped.cleanupExpiredDeliveries,
      },
    })
    try {
      const added = await harness.add(job, data, { attempts: 1 })
      await expect(harness.settled(added)).resolves.toBe('completed')
      return (await harness.queue.getJob(added.id))?.returnvalue
    } finally {
      await harness.close()
    }
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
    const loaded = await activityPubInboxDeliveryTransitions.load(delivered.deliveryId)
    if (loaded.outcome === 'stale') throw new Error('Expected the signed envelope')
    const acceptedAgain = await activityPubInboxDeliveryTransitions.accept(loaded.value)
    expect(acceptedAgain).toEqual({ outcome: 'applied', value: delivered, wasInserted: false })
    await enqueueActivityPubInboxDelivery(delivered)
    const queued = await background.getJob(`activitypub-inbox__${delivered.requestDigest}`)
    try {
      expect(queued?.id).toBe(`activitypub-inbox__${delivered.requestDigest}`)
      expect(await enqueueActivityPubInboxDelivery(delivered)).toBeNull()
      await runJob(ACTIVITYPUB_PROCESS_DELIVERY_JOB, delivered, delivered.deliveryId)
    } finally {
      await queued?.remove()
    }
    expect(await activityPubInboxDeliveryExistsOnPrimaryForTest(deliveredActivityId)).toBe(false)

    const abandoned = await createSignedDelivery(actor)
    const result = await runJob(ACTIVITYPUB_RECOVER_DELIVERIES_JOB, {}, abandoned.deliveryId)
    expect((result as { enqueued: number }).enqueued).toBeGreaterThanOrEqual(1)
    const recovered = await findProcessDeliveryJob(abandoned.deliveryId)
    try {
      expect(recovered?.name).toBe(ACTIVITYPUB_PROCESS_DELIVERY_JOB.name)
    } finally {
      await recovered?.remove()
      if (recovered) {
        await activityPubInboxDeliveryTransitions.reject(abandoned.deliveryId)
      }
    }
  })

  it('checkpoints a terminal transport failure before continuing the bounded recovery page', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    const continuationId = `activitypub-inbox-recovery__${delivery.deliveryId}`
    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: () => {
          throw new Error('terminal transport failure')
        },
      },
    })
    try {
      const failed = await harness.add(ACTIVITYPUB_PROCESS_DELIVERY_JOB, delivery, {
        attempts: 1,
        jobId: `activitypub-inbox__${delivery.requestDigest}`,
      })
      expect(await harness.settled(failed)).toBe('failed')
      expect(await activityPubInboxDeliveryTransitions.load(delivery.deliveryId)).toMatchObject({
        outcome: 'applied',
      })
      await expect(
        recoverDeliveries(undefined, {
          readRecoverable: () => activityPubInboxDeliveryTransitions.recover([delivery.deliveryId]),
          getJobStatus: data => getActivityPubInboxDeliveryJobStatus(data, harness.queue),
          reserveRequeues: activityPubInboxDeliveryTransitions.reserveRecoveryRequeues,
          releaseUnadmittedRequeues:
            activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues,
          exhaustRecoveryRequeues: activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues,
          removeFailed: data => removeFailedActivityPubInboxDelivery(data, harness.queue),
          exhaust: activityPubInboxDeliveryTransitions.exhaust,
          enqueueBulk: enqueueBulkActivityPubInboxDeliveries,
          enqueueContinuation: enqueueRecoverActivityPubInboxDeliveriesContinuation,
          pageSize: () => 1,
        }),
      ).resolves.toEqual({ enqueued: 0, hasMore: true })
      expect(await activityPubInboxDeliveryTransitions.load(delivery.deliveryId)).toEqual({
        outcome: 'stale',
      })
      expect(await activityPubInboxDeliveryTransitions.rearm([delivery.deliveryId])).toEqual([
        delivery,
      ])
      expect((await background.getJob(continuationId))?.data).toEqual({
        afterId: delivery.deliveryId,
      })
      expect(await harness.queue.getJob(failed.id)).toBeNull()
    } finally {
      await (await background.getJob(continuationId))?.remove()
      await harness.close()
    }
  })

  it('rearms a failed durable delivery and deletes an expired one', async () => {
    const actor = await createApprovedRemoteActor()
    const failed = await createSignedDelivery(actor)
    expect(await loadTestDelivery(failed.deliveryId)).not.toBeNull()
    expect(await exhaustTestDelivery(failed.deliveryId, new Error('offline'))).toBe(true)
    const rearmed = await runJob(ACTIVITYPUB_REARM_FAILED_DELIVERIES_JOB, {}, failed.deliveryId)
    expect(rearmed).toEqual({ enqueued: 1, hasMore: false })
    const child = await findProcessDeliveryJob(failed.deliveryId)
    try {
      expect(child?.data).toEqual(failed)
    } finally {
      await child?.remove()
      if (child) {
        await activityPubInboxDeliveryTransitions.reject(failed.deliveryId)
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
