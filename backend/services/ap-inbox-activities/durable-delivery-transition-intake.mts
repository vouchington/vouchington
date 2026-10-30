import { createHash } from 'node:crypto'
import type {
  ActivityPubInboxEnvelope,
  ActivityPubInboxDeliveryJob,
} from './durable-delivery-data-contract.mts'

export function createActivityPubInboxDeliveryJob(
  envelope: ActivityPubInboxEnvelope,
  verifiedRemoteActorId?: string,
  receivedAt = new Date(),
  senderAllowed = false,
): ActivityPubInboxDeliveryJob {
  const { rawBody, ...headers } = envelope
  return {
    ...headers,
    rawBodyBase64: rawBody.toString('base64'),
    requestDigest: computeActivityPubInboxRequestDigest(envelope),
    receivedAt: receivedAt.toISOString(),
    ...(verifiedRemoteActorId ? { verifiedRemoteActorId } : {}),
    ...(senderAllowed ? { senderAllowed: true as const } : {}),
  }
}

export function computeActivityPubInboxRequestDigest(
  envelope: Pick<
    ActivityPubInboxEnvelope,
    | 'requestMethod'
    | 'requestTarget'
    | 'expectedHost'
    | 'signatureHeader'
    | 'digestHeader'
    | 'dateHeader'
    | 'rawBody'
    | 'contentTypeHeader'
  >,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        envelope.requestMethod,
        envelope.requestTarget,
        envelope.expectedHost,
        envelope.signatureHeader,
        envelope.digestHeader,
        envelope.dateHeader,
        envelope.contentTypeHeader ?? null,
        envelope.rawBody.toString('base64'),
      ]),
    )
    .digest('hex')
}
