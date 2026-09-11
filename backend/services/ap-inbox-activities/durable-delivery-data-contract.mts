export type ActivityPubInboxEnvelope = {
  requestMethod: string
  requestTarget: string
  expectedHost: string
  signatureHeader: string
  digestHeader: string
  dateHeader: string
  contentTypeHeader?: string
  rawBody: Buffer
  claimedActivityId: string
  claimedActivityType: string
  claimedActorUri: string
  senderHostname: string
}

export type ActivityPubInboxDelivery = ActivityPubInboxEnvelope & {
  id: string
  processingAttemptId: string
  remoteActorId: string | null
  receivedAt: Date
  verifiedAt: Date | null
  senderAllowedAt: Date | null
}
