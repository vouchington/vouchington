import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { ACTIVITYPUB_PROCESS_DELIVERY_JOB } from '@queues/background/enqueues/activitypub-jobs'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import {
  getActivityPubInboxDeliveryJobStatus,
  removeFailedActivityPubInboxDelivery,
} from '@queues/activitypub/enqueues/inbox'
import { recoverDeliveries } from '@workers/activitypub/processors/inbox'
import { registerActivityPubInboxAdmission } from '@voucha/test-helpers/activitypub-inbox-transitions'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'
import { startBackgroundHarness } from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

registerActivityPubInboxAdmission()

describe('ActivityPub inbox recovery through real GlideMQ', () => {
  it('replaces a terminal record from a prior envelope with the same signed-request digest', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    const jobId = `activitypub-inbox__${delivery.requestDigest}`
    const oldDeliveryId = randomUUID()
    const harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: { [ACTIVITYPUB_PROCESS_DELIVERY_JOB.name]: () => undefined },
    })
    try {
      const old = await harness.add(
        ACTIVITYPUB_PROCESS_DELIVERY_JOB,
        { deliveryId: oldDeliveryId, requestDigest: delivery.requestDigest },
        { attempts: 1, jobId },
      )
      expect(await harness.settled(old)).toBe('completed')
      expect(await getActivityPubInboxDeliveryJobStatus(delivery, harness.queue)).toEqual({
        state: 'stale-terminal',
      })
      expect(
        await recoverDeliveries(undefined, {
          readRecoverable: () => activityPubInboxDeliveryTransitions.recover([delivery.deliveryId]),
          getJobStatus: data => getActivityPubInboxDeliveryJobStatus(data, harness.queue),
          exhaust: activityPubInboxDeliveryTransitions.exhaust,
          removeFailed: data => removeFailedActivityPubInboxDelivery(data, harness.queue),
          reserveRequeues: activityPubInboxDeliveryTransitions.reserveRecoveryRequeues,
          releaseUnadmittedRequeues:
            activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues,
          exhaustRecoveryRequeues: activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues,
          enqueueBulk: inputs =>
            enqueueBulkReactivatingFinished({
              queue: harness.queue,
              inputs,
              jobIdOf: data => `activitypub-inbox__${data.requestDigest}`,
              enqueueBulk: data =>
                harness.queue.addBulk(
                  data.map(input => ({
                    name: ACTIVITYPUB_PROCESS_DELIVERY_JOB.name,
                    data: input,
                    opts: { ...ACTIVITYPUB_PROCESS_DELIVERY_JOB.options, attempts: 1, jobId },
                  })),
                ),
            }),
          enqueueContinuation: async () => null,
          pageSize: () => 2,
        }),
      ).toEqual({ enqueued: 1, hasMore: false })
      expect((await harness.queue.getJob(jobId))?.data).toEqual(delivery)
    } finally {
      await harness.close()
    }
  })

  it('bounds replacement jobs after another background failure trims an inbox failure', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    const jobId = `activitypub-inbox__${delivery.requestDigest}`
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
        jobId,
      })
      expect(await harness.settled(failed)).toBe('failed')
      expect(await (await harness.queue.getJob(jobId))?.getState()).toBe('failed')

      // GlideMQ's numeric retention trims the shared failed set, including jobs whose own
      // removeOnFail is false. The later id sorts after the inbox id even on a timestamp tie.
      const unrelated = await harness.add(
        ACTIVITYPUB_PROCESS_DELIVERY_JOB,
        { deliveryId: randomUUID(), requestDigest: randomUUID() },
        { attempts: 1, jobId: `zz-${randomUUID()}`, removeOnFail: 1 },
      )
      expect(await harness.settled(unrelated)).toBe('failed')
      expect(await harness.queue.getJob(jobId)).toBeNull()

      const recoveryDependencies = {
        readRecoverable: () => activityPubInboxDeliveryTransitions.recover([delivery.deliveryId]),
        getJobStatus: (data: typeof delivery) =>
          getActivityPubInboxDeliveryJobStatus(data, harness.queue),
        exhaust: activityPubInboxDeliveryTransitions.exhaust,
        removeFailed: (data: typeof delivery) =>
          removeFailedActivityPubInboxDelivery(data, harness.queue),
        reserveRequeues: activityPubInboxDeliveryTransitions.reserveRecoveryRequeues,
        releaseUnadmittedRequeues:
          activityPubInboxDeliveryTransitions.releaseUnadmittedRecoveryRequeues,
        exhaustRecoveryRequeues: activityPubInboxDeliveryTransitions.exhaustRecoveryRequeues,
        enqueueBulk: (inputs: (typeof delivery)[]) =>
          enqueueBulkReactivatingFinished({
            queue: harness.queue,
            inputs,
            jobIdOf: data => `activitypub-inbox__${data.requestDigest}`,
            enqueueBulk: data =>
              harness.queue.addBulk(
                data.map(input => ({
                  name: ACTIVITYPUB_PROCESS_DELIVERY_JOB.name,
                  data: input,
                  opts: {
                    ...ACTIVITYPUB_PROCESS_DELIVERY_JOB.options,
                    attempts: 1,
                    jobId,
                    delay: 60_000,
                  },
                })),
              ),
          }),
        enqueueContinuation: async () => null,
        pageSize: () => 2,
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(await recoverDeliveries(undefined, recoveryDependencies)).toEqual({
          enqueued: 1,
          hasMore: false,
        })
        const replacement = await harness.queue.getJob(jobId)
        expect(await replacement?.getState()).toBe('delayed')
        // Native removal models the next queue-wide trim without waiting for another worker failure.
        await replacement?.remove()
      }
      expect(await recoverDeliveries(undefined, recoveryDependencies)).toEqual({
        enqueued: 0,
        hasMore: false,
      })
      expect(await activityPubInboxDeliveryTransitions.load(delivery.deliveryId)).toEqual({
        outcome: 'stale',
      })
      expect(await harness.queue.getJob(jobId)).toBeNull()
    } finally {
      await harness.close()
    }
  })
})
