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
  | 'processApplyMediaDeliveryRegistryRecord'
  | 'processReconcileMediaDeliveryRegistry'

/** A fixed evaluation time and only the unfinished copyright stage cursors. */
export type CopyrightSweepContinuation = {
  evaluatedAt?: string
  cursors?: Record<string, string>
}
