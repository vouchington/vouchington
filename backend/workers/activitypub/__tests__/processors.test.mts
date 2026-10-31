import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { processDelivery } from '../processors/inbox.mts'
import {
  setTestRemoteActorFetchedAt,
  softDeleteRemoteActorForInboxTest,
} from '@voucha/test-helpers'
import type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'
import {
  createApprovedRemoteActor,
  createSignedDelivery,
} from '@voucha/test-helpers/activitypub-inbox-signed-delivery'

function jobCallbacks() {
  return {
    moveToDelayed: vi.fn<() => Promise<never>>(async () => {
      throw new Error('Unexpected deferral')
    }),
    updateData: vi.fn<(data: ActivityPubInboxDeliveryJob) => Promise<void>>(async () => undefined),
  }
}

describe('ActivityPub inbox envelope processor', () => {
  it('processes a signed envelope and a duplicate domain activity without failure', async () => {
    const actor = await createApprovedRemoteActor()
    const activityId = `${actor.actorUri}/activities/${randomUUID()}`
    const first = await createSignedDelivery(actor, { activityId })
    const firstCallbacks = jobCallbacks()

    await expect(processDelivery(first, firstCallbacks)).resolves.toBeUndefined()
    expect(firstCallbacks.updateData).toHaveBeenLastCalledWith(
      expect.objectContaining({ verifiedRemoteActorId: actor.remoteActorId, senderAllowed: true }),
    )

    const duplicate = await createSignedDelivery(actor, { activityId })
    await expect(processDelivery(duplicate, jobCallbacks())).resolves.toBeUndefined()
  })

  it('completes a terminal actor mismatch without checkpointing sender admission', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, {
      claimedActorUri: `https://forged-${randomUUID()}.example/users/mallory`,
    })
    const callbacks = jobCallbacks()

    await expect(processDelivery(delivery, callbacks)).resolves.toBeUndefined()
    expect(callbacks.updateData).not.toHaveBeenCalled()
  })

  it('completes an invalid signature without checkpointing sender admission', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor, { corruptSignature: true })
    const callbacks = jobCallbacks()

    await expect(processDelivery(delivery, callbacks)).resolves.toBeUndefined()
    expect(callbacks.updateData).not.toHaveBeenCalled()
  })

  it('verifies a queued signature against its original receipt time after a delayed attempt', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    const callbacks = jobCallbacks()
    // The signature expires after an hour, while the cached actor also expires after an hour.
    // Keep the actor cache fresh at the delayed attempt so this isolates receipt-time verification.
    await setTestRemoteActorFetchedAt(actor.actorUri, new Date(Date.now() + 2 * 60 * 60 * 1000))
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(Date.now() + 2 * 60 * 60 * 1000) })
    try {
      await expect(processDelivery(delivery, callbacks)).resolves.toBeUndefined()
      expect(callbacks.updateData).toHaveBeenLastCalledWith(
        expect.objectContaining({ receivedAt: delivery.receivedAt, senderAllowed: true }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a checkpoint after the verified signing actor is deleted', async () => {
    const actor = await createApprovedRemoteActor()
    const delivery = await createSignedDelivery(actor)
    await softDeleteRemoteActorForInboxTest(actor.remoteActorId!)
    const callbacks = jobCallbacks()

    await expect(
      processDelivery({ ...delivery, verifiedRemoteActorId: actor.remoteActorId }, callbacks),
    ).resolves.toBeUndefined()
    expect(callbacks.updateData).not.toHaveBeenCalled()
  })
})
