import { defineBackgroundDomain } from './define-job.mts'

// Notification jobs share one globally bounded domain lane.
export const NOTIFICATIONS_DOMAIN = defineBackgroundDomain({
  domain: 'notifications',
  deferral: 'job',
  workerConcurrency: 5,
})

export type EmptyNotificationsJobData = Record<string, never>
export type CopyrightCasePurgeAdmissionData = {
  pendingAccountAfterId?: string
  pendingAccountsComplete?: boolean
  caseCandidatesComplete?: boolean
  orphanAfterId?: string
  after?: {
    jurisdiction: 'eu_dsa' | 'uk' | 'us_dmca'
    lastLegalActivityAt: string
    noticeId: string
  }
}
export type FollowNotificationData = { followeeId: string; followerId: string }
export type ReferralSignupNotificationData = { referrerId: string; newUserId: string }
export type ReferralClickNotificationData = { referrerId: string }
export type DeleteNotificationData = { userId: string; notificationId: string }
export type MarkAllNotificationsReadData = {
  userId: string
  throughId: string
  lastPageId: string
}
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
/** One continuation page of live staff recipients for a critical moderation alert. */
export type CriticalModerationAlertNotificationData = {
  reportId: string
  afterUserId: string
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

/** Each delivery channel's reconcile runs as its own job, so its channel never shares a budget or cursor. */
export const COPYRIGHT_DELIVERY_RECONCILE_CHANNELS = ['in_app', 'email'] as const
export type CopyrightDeliveryReconcileChannel =
  (typeof COPYRIGHT_DELIVERY_RECONCILE_CHANNELS)[number]

/** The id cursor where one channel's walk continues. */
export type CopyrightDeliveryReconcileData = { after?: string }

/** Each copyright action sweep runs as its own job, so its stage never shares a budget or cursor. */
export const COPYRIGHT_ACTION_RECONCILE_STAGES = [
  'forms',
  'decisions',
  'enforcement',
  'suspended',
  'blocked',
  'restorations',
  'actions',
] as const
export type CopyrightActionReconcileStage = (typeof COPYRIGHT_ACTION_RECONCILE_STAGES)[number]

/** One stage's fixed evaluation time and the id cursor where its walk continues. */
export type CopyrightActionReconcileData = { evaluatedAt?: string; after?: string }

export type CommunityActivityDigestDispatchData = {
  windowStart: string
  windowEnd: string
  afterUserId?: string
  afterCommunityId?: string | null
  throughUserId?: string
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
