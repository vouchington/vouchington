export type ActivityPubInboxDeliveryJob = {
  deliveryId: string
  processingAttemptId: string
}

export type ActivityPubInboxJobs =
  | 'processDelivery'
  | 'recoverDeliveries'
  | 'rearmFailedDeliveries'
  | 'cleanupExpiredDeliveries'
