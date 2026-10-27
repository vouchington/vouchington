export type RecoverableActivityPubInboxDelivery = {
  deliveryId: string
  requestDigest: string
}

export type ActivityPubInboxCapacityExceeded = {
  snapshot: {
    unverifiedRows: number
    unverifiedRawBodyBytes: number
  }
  attemptedRows: number
  attemptedRawBodyBytes: number
  limitingDimensions: readonly ('rows' | 'raw-body-bytes')[]
}

export type ActivityPubInboxAcceptResult =
  | { outcome: 'applied'; value: RecoverableActivityPubInboxDelivery; wasInserted: boolean }
  | { outcome: 'capacity-exceeded'; value: ActivityPubInboxCapacityExceeded }
