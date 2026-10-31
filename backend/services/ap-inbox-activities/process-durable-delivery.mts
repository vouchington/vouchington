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
import type { ActivityPubInboxDeliveryJob } from './durable-delivery-data-contract.mts'
import { parseInboundActivity } from './parse-activity.mts'
import { recordAndDispatchInboundActivity } from './record-and-dispatch.mts'

export type ProcessDurableInboxResult =
  | { outcome: 'processed'; duplicate: boolean }
  | { outcome: 'deferred'; deferredUntil: Date }

/** The job holds the exact signed request, including the original receipt time across retries. */
export async function processDurableActivityPubInboxDelivery(
  delivery: ActivityPubInboxDeliveryJob,
  checkpoint: (delivery: ActivityPubInboxDeliveryJob) => Promise<unknown>,
): Promise<ProcessDurableInboxResult> {
  if (!(await isFediverseInstanceApprovedByHostname(delivery.senderHostname))) {
    throw createHttpError(403, 'Instance no longer approved')
  }

  const rawBody = Buffer.from(delivery.rawBodyBase64, 'base64')
  const activity = parseInboundActivity(rawBody)
  let remoteActor
  if (delivery.verifiedRemoteActorId) {
    remoteActor = await getCheckpointedRemoteActorByIdFromPrimary(delivery.verifiedRemoteActorId)
    if (!remoteActor) throw createHttpError(401, 'Previously verified signing actor is inactive')
  } else {
    const keyId = extractSignatureKeyId(delivery.signatureHeader)
    if (!keyId) throw createHttpError(401, 'Missing keyId in Signature header')
    remoteActor = await getOrFetchRemoteActorByKeyId(keyId)
    const verification = verifySignature(
      delivery.requestMethod,
      delivery.requestTarget,
      delivery.expectedHost,
      rawBody,
      delivery.signatureHeader,
      delivery.digestHeader,
      delivery.dateHeader,
      remoteActor.public_key_pem,
      {
        referenceTime: new Date(delivery.receivedAt),
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
  let currentDelivery = delivery
  if (!delivery.verifiedRemoteActorId) {
    currentDelivery = { ...currentDelivery, verifiedRemoteActorId: remoteActor.id }
    await checkpoint(currentDelivery)
  }

  if (!currentDelivery.senderAllowed) {
    const limited = await recordActivityPubInboxSenderDeliveryOnce(
      currentDelivery.senderHostname,
      currentDelivery.requestDigest,
    )
    if (limited) {
      return {
        outcome: 'deferred',
        deferredUntil: new Date(Date.now() + getActivityPubInboxWindowSeconds() * 1000),
      }
    }
    currentDelivery = { ...currentDelivery, senderAllowed: true }
    await checkpoint(currentDelivery)
  }

  const result = await recordAndDispatchInboundActivity(remoteActor, {
    ...activity,
    signedAt: new Date(currentDelivery.dateHeader),
  })
  return { outcome: 'processed', duplicate: result.duplicate }
}
