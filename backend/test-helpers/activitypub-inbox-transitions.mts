import { beforeEach, onTestFinished } from 'vitest'
import { acquireActivityPubInboxTestAdmission } from './activitypub-inbox-test-admission.mts'
import { activityPubInboxDeliveryTransitions } from '../services/ap-inbox-activities/durable-delivery-transitions.mts'
import type { ActivityPubInboxEnvelope } from '../services/ap-inbox-activities/durable-delivery-transition-contract.mts'
import { deleteActivityPubInboxDeliveriesForTest } from './entities/activitypub-inbox-storage.mts'

// Register before test-body cleanup, so Vitest releases admission last.
export function registerActivityPubInboxAdmission(mode: 'ordinary' | 'capacity' = 'ordinary') {
  beforeEach(async () => {
    const admission = await acquireActivityPubInboxTestAdmission(mode)
    onTestFinished(() => admission.release())
  })
}

export async function acceptTestDelivery(
  envelope: ActivityPubInboxEnvelope,
  remoteActorId?: string,
) {
  const result = await activityPubInboxDeliveryTransitions.accept(envelope, remoteActorId)
  if (result.outcome !== 'applied') throw new Error('Test delivery unexpectedly exceeded capacity')
  const delivery = result.value
  onTestFinished(() => deleteActivityPubInboxDeliveriesForTest([delivery.deliveryId]))
  return delivery
}

export async function claimTestDelivery(deliveryId: string, processingAttemptId: string) {
  const result = await activityPubInboxDeliveryTransitions.claim(deliveryId, processingAttemptId)
  return result.outcome === 'applied' ? result.value : null
}

export async function verifyTestDelivery(
  deliveryId: string,
  processingAttemptId: string,
  remoteActorId: string,
) {
  return (
    (
      await activityPubInboxDeliveryTransitions.verify(
        deliveryId,
        processingAttemptId,
        remoteActorId,
      )
    ).outcome === 'applied'
  )
}

export async function deferTestDelivery(
  deliveryId: string,
  processingAttemptId: string,
  deferredUntil: Date,
) {
  const result = await activityPubInboxDeliveryTransitions.defer(
    deliveryId,
    processingAttemptId,
    deferredUntil,
  )
  return result.outcome === 'applied' ? result.value : null
}

export async function rejectTestDelivery(deliveryId: string, processingAttemptId: string) {
  return (
    (await activityPubInboxDeliveryTransitions.reject(deliveryId, processingAttemptId)).outcome ===
    'applied'
  )
}

export async function releaseTestDelivery(
  deliveryId: string,
  processingAttemptId: string,
  error: unknown,
) {
  return (
    (await activityPubInboxDeliveryTransitions.release(deliveryId, processingAttemptId, error))
      .outcome === 'applied'
  )
}

export async function exhaustTestDelivery(
  deliveryId: string,
  processingAttemptId: string,
  error: unknown,
) {
  return (
    (await activityPubInboxDeliveryTransitions.exhaust(deliveryId, processingAttemptId, error))
      .outcome === 'applied'
  )
}
