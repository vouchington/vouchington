import createHttpError from 'http-errors'
import { extractSignatureKeyId, verifySignature } from '@modules/http-signatures'
import { isFediverseInstanceApprovedByHostname } from '@services/fediverse-instances'
import {
  getCheckpointedRemoteActorByIdFromPrimary,
  getOrFetchRemoteActorByKeyId,
} from '@services/remote-actors'
import {
  getActivityPubInboxWindowSeconds,
  recordActivityPubInboxSenderDeliveryOnce,
} from '@services/route-rate-limits'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'
import { parseInboundActivity } from './parse-activity.mts'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'

export type ProcessDurableInboxResult =
  | { outcome: 'stale' }
  | { outcome: 'processed'; duplicate: boolean }
  | {
      outcome: 'deferred'
      deliveryId: string
      processingAttemptId: string
      deferredUntil: Date
    }

export async function processDurableActivityPubInboxDelivery(
  deliveryId: string,
  processingAttemptId: string,
): Promise<ProcessDurableInboxResult> {
  const claimed = await activityPubInboxDeliveryTransitions.claim(deliveryId, processingAttemptId)
  if (claimed.outcome === 'stale') return { outcome: 'stale' }
  const delivery = claimed.value

  if (!(await isFediverseInstanceApprovedByHostname(delivery.senderHostname))) {
    throw createHttpError(403, 'Instance no longer approved')
  }

  const activity = parseInboundActivity(delivery.rawBody)
  let remoteActor
  if (delivery.verifiedAt && delivery.remoteActorId) {
    remoteActor = await getCheckpointedRemoteActorByIdFromPrimary(delivery.remoteActorId)
    if (!remoteActor) throw createHttpError(401, 'Previously verified signing actor is inactive')
  } else {
    const keyId = extractSignatureKeyId(delivery.signatureHeader)
    if (!keyId) throw createHttpError(401, 'Missing keyId in Signature header')
    remoteActor = await getOrFetchRemoteActorByKeyId(keyId)
    const verification = verifySignature(
      delivery.requestMethod,
      delivery.requestTarget,
      delivery.expectedHost,
      delivery.rawBody,
      delivery.signatureHeader,
      delivery.digestHeader,
      delivery.dateHeader,
      remoteActor.public_key_pem,
      {
        referenceTime: delivery.receivedAt,
        additionalHeaders: delivery.contentTypeHeader
          ? { 'content-type': delivery.contentTypeHeader }
          : undefined,
      },
    )
    if (!verification.valid) throw createHttpError(401, verification.error ?? 'Invalid signature')
  }
  if (activity.actor !== remoteActor.actor_uri) {
    throw createHttpError(401, 'Signing actor does not match activity actor')
  }
  if (
    !delivery.verifiedAt &&
    (
      await activityPubInboxDeliveryTransitions.verify(
        deliveryId,
        processingAttemptId,
        remoteActor.id,
      )
    ).outcome === 'stale'
  ) {
    return { outcome: 'stale' }
  }

  if (!delivery.senderAllowedAt) {
    const limited = await recordActivityPubInboxSenderDeliveryOnce(
      delivery.senderHostname,
      delivery.id,
    )
    if (limited) {
      const deferredUntil = new Date(Date.now() + getActivityPubInboxWindowSeconds() * 1000)
      const deferred = await activityPubInboxDeliveryTransitions.defer(
        deliveryId,
        processingAttemptId,
        deferredUntil,
      )
      if (deferred.outcome === 'stale') return { outcome: 'stale' }
      return { outcome: 'deferred', ...deferred.value, deferredUntil }
    }
    if (
      (await activityPubInboxDeliveryTransitions.admitSender(deliveryId, processingAttemptId))
        .outcome === 'stale'
    ) {
      return { outcome: 'stale' }
    }
  }

  const completed = await recordAndDispatchInboundActivity(remoteActor, activity, {
    deliveryId,
    processingAttemptId,
  })
  if (completed.outcome === 'stale') return { outcome: 'stale' }
  const { duplicate } = completed
  return { outcome: 'processed', duplicate }
}
