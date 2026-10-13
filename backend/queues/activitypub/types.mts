export type ActivityPubInboxDeliveryJob = {
  deliveryId: string
  leaseToken: string
}

export type ActivityPubInboxJobs =
  | 'processDelivery'
  | 'recoverDeliveries'
  | 'rearmFailedDeliveries'
  | 'cleanupExpiredDeliveries'
