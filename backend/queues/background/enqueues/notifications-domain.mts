import { defineBackgroundDomain } from './define-job.mts'

// Notification jobs share one globally bounded domain lane.
export const NOTIFICATIONS_DOMAIN = defineBackgroundDomain({
  domain: 'notifications',
  deferral: 'job',
  workerConcurrency: 5,
})

export type EmptyNotificationsJobData = Record<string, never>
export type FollowNotificationData = { followeeId: string; followerId: string }
export type ReferralSignupNotificationData = { referrerId: string; newUserId: string }
export type ReferralClickNotificationData = { referrerId: string; landingUrl: string }
export type DeleteNotificationData = { userId: string; notificationId: string }
export type ConversationMessageNotificationData = {
  conversationId: string
  messageId: string
  senderId: string
}
export type DeliverNotificationPushData = { userId: string; notificationId: string }

/** One page of post recipients; `afterUserId` is the last recipient of the previous page. */
export type ReconcilePostNotificationsData = {
  postId: string
  changeId: string
  afterUserId?: string
}
/** One page of RSS feed item recipients; `afterUserId` is the last recipient of the previous page. */
export type ReconcileRssFeedItemNotificationsData = {
  rssFeedItemId: string
  changeId: string
  afterUserId?: string
}
export type ReconcileContentVisibilityData =
  | {
      postId: string
      rssFeedItemId?: never
      changeId: string
      after: { userId: string; notificationId: string }
    }
  | {
      postId?: never
      rssFeedItemId: string
      changeId: string
      after: { userId: string; notificationId: string }
    }

export type ReconcileMembershipVisibilityData = ReconcileContentVisibilityData

export type ReconcileNotificationPushIntentsData = {
  scanBefore?: string
  after?: { updatedAt: string; userId: string; notificationId: string }
}

export type CopyrightIntentData = { intentId: string }
export type DsaStatementSubmissionData = { submissionId: string }

type CopyrightSweepCursor =
  | 'forms'
  | 'decisions'
  | 'enforcement'
  | 'suspended'
  | 'blocked'
  | 'restorations'
  | 'actions'
  | 'in_app'
  | 'email-notices'

/** A fixed evaluation time and only the unfinished copyright stage cursors. */
export type CopyrightSweepContinuation = {
  evaluatedAt?: string
  /** Round-robin order of unfinished and unvisited stages/channels. */
  pending?: string[]
  /** null resumes a stage which had no page allowance to start. */
  cursors?: Partial<Record<CopyrightSweepCursor, string | null>>
}

export type CommunityActivityDigestDispatchData = {
  windowStart: string
  windowEnd: string
  leaseToken: string
}
export type CommunityActivityDigestBatchData = CommunityActivityDigestDispatchData & {
  afterUserId?: string
}

export type ReconcileMediaDeliveryRegistryData =
  | { scanBefore?: never; after?: never; staging?: never }
  | { scanBefore: string; after: string; staging?: never }
  | {
      scanBefore?: never
      after?: never
      staging: {
        scanBefore: string
        after: { placement_id: string; placement_revision: number; image_id: string }
      }
    }
export type ReplayMediaDeliveryRegistryData = { actorUserId: string; after?: string }
export type ApplyMediaDeliveryRegistryRecordData = { mediaDeliveryRegistryRecordId: string }

export type CommunityActivityDigestScheduleData = { targetWindowStart?: string }
