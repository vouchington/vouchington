export type NotificationJobs =
  | 'processReconcilePostNotifications'
  | 'processReconcileRssFeedItemNotifications'
  | 'processDeliverNotificationPushIntent'
  | 'processReconcileNotificationPushIntents'
  | 'processDeleteNotification'
  | 'processFollowNotification'
  | 'processReferralSignupNotification'
  | 'processReferralClickNotification'
  | 'processConversationMessageNotification'
  | 'processCommunityActivityDigestDispatch'
  | 'processCommunityActivityDigestScheduleTick'
  | 'processCommunityActivityDigestBatch'
  | 'processDeliverCopyrightNotice'
  | 'processReconcileCopyrightDeliveryIntents'
  | 'processApplyCopyrightAction'
  | 'processReconcileCopyrightActionIntents'
  | 'processCheckCopyrightReviewTarget'
  | 'processSweepCopyrightEvidenceRetention'
  | 'processSubmitDsaStatementOfReasons'
  | 'processReconcileDsaStatementSubmissions'
  | 'processApplyMediaDeliveryRegistryRecord'
  | 'processReconcileMediaDeliveryRegistry'

/** A fixed evaluation time and only the unfinished copyright stage cursors. */
export type CopyrightSweepContinuation = {
  evaluatedAt?: string
  /** Round-robin order of unfinished and unvisited stages/channels. */
  pending?: string[]
  /** null resumes a stage which had no page allowance to start. */
  cursors?: Record<string, string | null>
}
