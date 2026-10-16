import { defineBackgroundDomain } from './define-job.mts'

// The old queue had no ordering keys; its cap was the worker concurrency of 5. One domain-wide group
// of 5 keeps that cap on the shared worker.
export const NOTIFICATIONS_DOMAIN = defineBackgroundDomain({
  domain: 'notifications',
  group: { kind: 'domain', concurrency: 5 },
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
export type ReconcilePostNotificationsData = { postId: string; afterUserId?: string }
/** One page of RSS feed item recipients; `afterUserId` is the last recipient of the previous page. */
export type ReconcileRssFeedItemNotificationsData = { rssFeedItemId: string; afterUserId?: string }

export type ReconcileNotificationPushIntentsData = {
  scanBefore?: string
  after?: { updatedAt: string; userId: string; notificationId: string }
}

export type CopyrightIntentData = { intentId: string }
export type DsaStatementSubmissionData = { submissionId: string }

/** A fixed evaluation time and only the unfinished copyright stage cursors. */
export type CopyrightSweepContinuation = {
  evaluatedAt?: string
  /** Round-robin order of unfinished and unvisited stages/channels. */
  pending?: string[]
  /** null resumes a stage which had no page allowance to start. */
  cursors?: Record<string, string | null>
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
