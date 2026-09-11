import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import type { ActivityPubInboxEnvelope } from './durable-delivery-transition-contract.mts'

export async function acceptTestDelivery(envelope: ActivityPubInboxEnvelope) {
  const result = await activityPubInboxDeliveryTransitions.accept(envelope)
  if (result.outcome !== 'applied') throw new Error('Test delivery unexpectedly exceeded capacity')
  return result.value
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
