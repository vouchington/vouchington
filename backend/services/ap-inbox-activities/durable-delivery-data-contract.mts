/** Raw signed body limit; base64 plus the maximum accepted headers fits a GlideMQ job. */
export const ACTIVITYPUB_INBOX_MAX_RAW_BODY_BYTES = 512 * 1024

export type ActivityPubInboxEnvelope = {
  requestMethod: string
  requestTarget: string
  expectedHost: string
  signatureHeader: string
  digestHeader: string
  dateHeader: string
  contentTypeHeader?: string
  rawBody: Buffer
  senderHostname: string
}

export type { ActivityPubInboxDeliveryJob } from '@queues/activitypub/types'
