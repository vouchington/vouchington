import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { generateRsaSha256KeyPair } from '@modules/http-signatures'
import { UnrecoverableError } from '@modules/queue-errors'
import { softDeleteRemoteActorForInboxTest } from '@voucha/test-helpers'
import { activityPubInboxDeliveryTransitions } from '@services/ap-inbox-activities'
import {
  claimTestDelivery,
  rejectTestDelivery,
} from '@voucha/test-helpers/services/ap-inbox-activities/durable-delivery-transitions.test-support'
import { processDelivery } from '../processors.mts'
import {
  approveInstance,
  createApprovedRemoteActor,
  createSignedDelivery,
  makeUnavailableActor,
} from '@voucha/test-helpers/workers/activitypub-inbox/test-support'

const rearmFailedActivityPubInboxDeliveries = activityPubInboxDeliveryTransitions.rearm

describe('ActivityPub inbox processor', () => {
  it('treats a stale fencing token as an idempotent no-op', async () => {
    await expect(
      processDelivery(
        { deliveryId: randomUUID(), leaseToken: randomUUID() },
        { isFinalAttempt: false },
      ),
    ).resolves.toBeUndefined()
  })

  it('deletes successful and duplicate deliveries after dispatch', async () => {
    const actor = await createApprovedRemoteActor()
    const activityId = `${actor.actorUri}/activities/${randomUUID()}`
    const first = await createSignedDelivery(actor, { activityId })
    await processDelivery(first, { isFinalAttempt: false })
    expect(await claimTestDelivery(first.deliveryId, first.leaseToken)).toBeNull()

    const duplicate = await createSignedDelivery(actor, { activityId })
    await processDelivery(duplicate, { isFinalAttempt: false })
    expect(await claimTestDelivery(duplicate.deliveryId, duplicate.leaseToken)).toBeNull()
  })

  it('deletes a terminal actor-mismatch rejection and skips remaining retries', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, {
      claimedActorUri: `https://forged-${randomUUID()}.example/users/mallory`,
    })

    await expect(processDelivery(delivery, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).toBeNull()
  })

  it('deletes a delivery when its instance is no longer approved', async () => {
    const delivery = await createSignedDelivery(makeUnavailableActor())
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId, delivery.leaseToken)
    })

    await expect(processDelivery(delivery, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).toBeNull()
  })

  it('fetches the actor and verifies the signature for an unverified delivery', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId, delivery.leaseToken)
    })

    await expect(processDelivery(delivery, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).toBeNull()
  })

  it('reuses a durable verification checkpoint from primary without refetching or reverifying', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })

    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).not.toBeNull()
    expect(
      await markActivityPubInboxDeliveryVerified(
        delivery.deliveryId,
        delivery.leaseToken,
        actor.remoteActorId!,
      ),
    ).toBe(true)
    expect(
      await releaseActivityPubInboxDeliveryForRetry(
        delivery.deliveryId,
        delivery.leaseToken,
        new Error('simulated crash after verification'),
      ),
    ).toBe(true)

    // The signature is intentionally invalid. Success proves the retry trusted the paired durable
    // checkpoint; a refetch/reverification path would reject this envelope.
    await expect(processDelivery(delivery, { isFinalAttempt: false })).resolves.toBeUndefined()
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).toBeNull()
  })

  it('rejects a checkpoint whose remote actor was soft-deleted on primary', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)

    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).not.toBeNull()
    expect(
      await markActivityPubInboxDeliveryVerified(
        delivery.deliveryId,
        delivery.leaseToken,
        actor.remoteActorId!,
      ),
    ).toBe(true)
    expect(
      await releaseActivityPubInboxDeliveryForRetry(
        delivery.deliveryId,
        delivery.leaseToken,
        new Error('simulated crash after verification'),
      ),
    ).toBe(true)
    await softDeleteRemoteActorForInboxTest(actor.remoteActorId!)

    await expect(processDelivery(delivery, { isFinalAttempt: false })).rejects.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).toBeNull()
  })

  it('retains and re-arms a final retryable remote-actor availability failure', async () => {
    const hostname = `missing-${randomUUID()}.invalid`
    await approveInstance(hostname)
    const { privateKeyPem } = generateRsaSha256KeyPair()
    const actorUri = `https://${hostname}/users/alice`
    const delivery = await createSignedDelivery({
      actorUri,
      hostname,
      keyId: `${actorUri}#main-key`,
      privateKeyPem,
    })

    const failure = processDelivery(delivery, { isFinalAttempt: true })
    await expect(failure).rejects.not.toBeInstanceOf(UnrecoverableError)
    const rearmed = (await rearmFailedActivityPubInboxDeliveries([delivery.deliveryId])).find(
      candidate => candidate.deliveryId === delivery.deliveryId,
    )
    expect(rearmed?.leaseToken).not.toBe(delivery.leaseToken)
  })

  it('releases a non-final retryable remote-actor failure for another attempt', async () => {
    const actor = makeUnavailableActor()
    await approveInstance(actor.hostname)
    const delivery = await createSignedDelivery(actor)
    onTestFinished(async () => {
      await rejectTestDelivery(delivery.deliveryId, delivery.leaseToken)
    })

    await expect(processDelivery(delivery, { isFinalAttempt: false })).rejects.not.toBeInstanceOf(
      UnrecoverableError,
    )
    expect(await claimTestDelivery(delivery.deliveryId, delivery.leaseToken)).not.toBeNull()
  })
})

async function markActivityPubInboxDeliveryVerified(
  deliveryId: string,
  leaseToken: string,
  remoteActorId: string,
) {
  return (
    (await activityPubInboxDeliveryTransitions.verify(deliveryId, leaseToken, remoteActorId))
      .outcome === 'applied'
  )
}

async function releaseActivityPubInboxDeliveryForRetry(
  deliveryId: string,
  leaseToken: string,
  error: unknown,
) {
  return (
    (await activityPubInboxDeliveryTransitions.release(deliveryId, leaseToken, error)).outcome ===
    'applied'
  )
}
