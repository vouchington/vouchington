import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  stubUnresolvableHostname,
  markActivityPubInboxDeliveryVerified,
  rearmScopedActivityPubInboxDeliveries,
} from '@voucha/test-helpers/activitypub-inbox-processor-fixtures'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { softDeleteRemoteActorForInboxTest, readAllQueueJobs } from '@voucha/test-helpers'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import {
  loadTestDelivery,
  registerActivityPubInboxAdmission,
  rejectTestDelivery,
} from '@voucha/test-helpers/activitypub-inbox-transitions'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { activitypub } from '@queues/activitypub/queues'
import { apInboxActivitiesWorkConfig } from '@services/ap-inbox-activities/work-limits'
import { processDelivery } from '../processors/inbox.mts'
import {
  approveInstance,
  createApprovedRemoteActor,
  createSignedDelivery,
  makeUnavailableActor,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'

registerActivityPubInboxAdmission()

const rearmFailedActivityPubInboxDeliveries = activityPubInboxDeliveryTransitions.rearm

describe('ActivityPub inbox processor', () => {
  it('treats an absent delivery as an idempotent no-op', async () => {
    await expect(
      processDelivery(
        { deliveryId: randomUUID(), requestDigest: randomUUID() },
        {
          isFinalAttempt: false,
          moveToDelayed: async () => {
            throw new Error('Unexpected deferral')
          },
        },
      ),
    ).resolves.toBeUndefined()
  })

  it('deletes successful and duplicate deliveries after dispatch', async () => {
    const actor = await createApprovedRemoteActor()
    const activityId = `${actor.actorUri}/activities/${randomUUID()}`
    const first = await createSignedDelivery(actor, { activityId })
    await processDelivery(first, {
      isFinalAttempt: false,
      moveToDelayed: async () => {
        throw new Error('Unexpected deferral')
      },
    })
    expect(await loadTestDelivery(first.deliveryId)).toBeNull()

    const duplicate = await createSignedDelivery(actor, { activityId })
    await processDelivery(duplicate, {
      isFinalAttempt: false,
      moveToDelayed: async () => {
        throw new Error('Unexpected deferral')
      },
    })
    expect(await loadTestDelivery(duplicate.deliveryId)).toBeNull()
  })

  it('deletes a terminal actor-mismatch rejection and skips remaining retries', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, {
      claimedActorUri: `https://forged-${randomUUID()}.example/users/mallory`,
    })

    await expect(
      processDelivery(delivery, {
        isFinalAttempt: false,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await loadTestDelivery(delivery.deliveryId)).toBeNull()
  })

  it('deletes a delivery when its instance is no longer approved', async () => {
    const delivery = await createSignedDelivery(makeUnavailableActor())
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId)
    })

    await expect(
      processDelivery(delivery, {
        isFinalAttempt: false,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await loadTestDelivery(delivery.deliveryId)).toBeNull()
  })

  it('fetches the actor and verifies the signature for an unverified delivery', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId)
    })

    await expect(
      processDelivery(delivery, {
        isFinalAttempt: false,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await loadTestDelivery(delivery.deliveryId)).toBeNull()
  })

  it('reuses a durable verification checkpoint from primary without refetching or reverifying', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })

    expect(await loadTestDelivery(delivery.deliveryId)).not.toBeNull()
    expect(
      await markActivityPubInboxDeliveryVerified(
        delivery.deliveryId,

        actor.remoteActorId!,
      ),
    ).toBe(true)

    // The signature is intentionally invalid. Success proves the retry trusted the paired durable
    // checkpoint; a refetch/reverification path would reject this envelope.
    await expect(
      processDelivery(delivery, {
        isFinalAttempt: false,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      }),
    ).resolves.toBeUndefined()
    expect(await loadTestDelivery(delivery.deliveryId)).toBeNull()
  })

  it('rejects a checkpoint whose remote actor was soft-deleted on primary', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)

    expect(await loadTestDelivery(delivery.deliveryId)).not.toBeNull()
    expect(
      await markActivityPubInboxDeliveryVerified(
        delivery.deliveryId,

        actor.remoteActorId!,
      ),
    ).toBe(true)
    await softDeleteRemoteActorForInboxTest(actor.remoteActorId!)

    await expect(
      processDelivery(delivery, {
        isFinalAttempt: false,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(await loadTestDelivery(delivery.deliveryId)).toBeNull()
  })

  it('retains and re-arms a final retryable remote-actor availability failure', async () => {
    const hostname = `missing-${randomUUID()}.invalid`
    const lookup = stubUnresolvableHostname(hostname)
    try {
      await approveInstance(hostname)
      const { privateKeyPem } = generateRsaSha256KeyPair()
      const actorUri = `https://${hostname}/users/alice`
      const delivery = await createSignedDelivery({
        actorUri,
        hostname,
        keyId: `${actorUri}#main-key`,
        privateKeyPem,
      })

      const failure = processDelivery(delivery, {
        isFinalAttempt: true,
        moveToDelayed: async () => {
          throw new Error('Unexpected deferral')
        },
      })
      await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError)
      const rearmed = (await rearmFailedActivityPubInboxDeliveries([delivery.deliveryId])).find(
        candidate => candidate.deliveryId === delivery.deliveryId,
      )
      expect(rearmed?.requestDigest).toBe(delivery.requestDigest)
    } finally {
      lookup.mockRestore()
    }
  })

  it('re-arms a retained failed delivery through the real page and continues a full page', async () => {
    onTestFinished(
      overrideDynamicConfigFieldsForTest(apInboxActivitiesWorkConfig, {
        delivery_transition_recovery_batch_size: 1,
      }),
    )
    const hostname = `missing-${randomUUID()}.invalid`
    const lookup = stubUnresolvableHostname(hostname)
    try {
      await approveInstance(hostname)
      const { privateKeyPem } = generateRsaSha256KeyPair()
      const actorUri = `https://${hostname}/users/alice`
      const delivery = await createSignedDelivery({
        actorUri,
        hostname,
        keyId: `${actorUri}#main-key`,
        privateKeyPem,
      })
      await expect(
        processDelivery(delivery, {
          isFinalAttempt: true,
          moveToDelayed: async () => {
            throw new Error('Unexpected deferral')
          },
        }),
      ).rejects.not.toBeInstanceOf(UnrecoverableError)

      await expect(
        rearmScopedActivityPubInboxDeliveries(
          [delivery.deliveryId],
          uuidBefore(delivery.deliveryId),
        ),
      ).resolves.toEqual({
        enqueued: 1,
        hasMore: true,
      })

      const jobs = await readAllQueueJobs(activitypub)
      expect(
        jobs.some(job => job.id === `activitypub-inbox-failed-backfill__${delivery.deliveryId}`),
      ).toBe(true)
    } finally {
      lookup.mockRestore()
    }
  })

  it('retains a non-final retryable remote-actor failure for another attempt', async () => {
    const actor = makeUnavailableActor()
    const lookup = stubUnresolvableHostname(actor.hostname)
    try {
      await approveInstance(actor.hostname)
      const delivery = await createSignedDelivery(actor)
      onTestFinished(async () => {
        await rejectTestDelivery(delivery.deliveryId)
      })

      await expect(
        processDelivery(delivery, {
          isFinalAttempt: false,
          moveToDelayed: async () => {
            throw new Error('Unexpected deferral')
          },
        }),
      ).rejects.not.toBeInstanceOf(UnrecoverableError)
      expect(await loadTestDelivery(delivery.deliveryId)).not.toBeNull()
    } finally {
      lookup.mockRestore()
    }
  })
})
