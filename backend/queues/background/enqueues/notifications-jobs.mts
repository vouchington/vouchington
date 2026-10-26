import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { PRIORITY_DISPATCH, PRIORITY_TASK } from '../config.mts'
import { defineBackgroundJob } from './define-job.mts'
import {
  NOTIFICATIONS_DOMAIN as DOMAIN,
  type ApplyMediaDeliveryRegistryRecordData,
  type CommunityActivityDigestBatchData,
  type CommunityActivityDigestScheduleData,
  type CommunityActivityDigestDispatchData,
  type ReconcileContentVisibilityData,
  type ConversationMessageNotificationData,
  type CopyrightIntentData,
  type CopyrightSweepContinuation,
  type DeleteNotificationData,
  type DeliverNotificationPushData,
  type DsaStatementSubmissionData,
  type EmptyNotificationsJobData as EmptyData,
  type FollowNotificationData,
  type ReconcileMediaDeliveryRegistryData,
  type ReconcileNotificationPushIntentsData,
  type ReconcilePostNotificationsData,
  type ReconcileRssFeedItemNotificationsData,
  type ReferralClickNotificationData,
  type ReferralSignupNotificationData,
  type ReplayMediaDeliveryRegistryData,
} from './notifications-domain.mts'

const BACKOFF = { type: 'exponential', delay: 1000, jitter: 0.5 } as const
const RETRY = { attempts: 3, backoff: BACKOFF, removeOnComplete: 100, removeOnFail: 100 } as const
const TASK = { priority: PRIORITY_TASK } as const
const DISPATCH = { priority: PRIORITY_DISPATCH } as const
const BULK_ORDERING = { key: 'notifications:bulk' } as const

export const NOTIFICATIONS_RECONCILE_POST_JOB = defineBackgroundJob<ReconcilePostNotificationsData>(
  DOMAIN,
  {
    name: 'processReconcilePostNotifications',
    ...DISPATCH,
    ordering: BULK_ORDERING,
    ...pagedDispatchJobOptions('notifications'),
  },
)
export const NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB =
  defineBackgroundJob<ReconcileRssFeedItemNotificationsData>(DOMAIN, {
    name: 'processReconcileRssFeedItemNotifications',
    ...DISPATCH,
    ordering: BULK_ORDERING,
    ...pagedDispatchJobOptions('notifications'),
  })
export const NOTIFICATIONS_CONTENT_VISIBILITY_JOB =
  defineBackgroundJob<ReconcileContentVisibilityData>(DOMAIN, {
    name: 'processReconcileContentVisibility',
    ...DISPATCH,
    ordering: BULK_ORDERING,
    attempts: 3,
    removeOnComplete: 100,
    removeOnFail: 100,
  })
export const NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB =
  defineBackgroundJob<DeliverNotificationPushData>(DOMAIN, {
    name: 'processDeliverNotificationPushIntent',
    ...TASK,
  })
export const NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB =
  defineBackgroundJob<ReconcileNotificationPushIntentsData>(DOMAIN, {
    name: 'processReconcileNotificationPushIntents',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_DELETE_JOB = defineBackgroundJob<DeleteNotificationData>(DOMAIN, {
  name: 'processDeleteNotification',
  ...TASK,
})
export const NOTIFICATIONS_FOLLOW_JOB = defineBackgroundJob<FollowNotificationData>(DOMAIN, {
  name: 'processFollowNotification',
  ...TASK,
})
export const NOTIFICATIONS_REFERRAL_SIGNUP_JOB =
  defineBackgroundJob<ReferralSignupNotificationData>(DOMAIN, {
    name: 'processReferralSignupNotification',
    ...TASK,
  })
export const NOTIFICATIONS_REFERRAL_CLICK_JOB = defineBackgroundJob<ReferralClickNotificationData>(
  DOMAIN,
  { name: 'processReferralClickNotification', ...TASK },
)
export const NOTIFICATIONS_CONVERSATION_MESSAGE_JOB =
  defineBackgroundJob<ConversationMessageNotificationData>(DOMAIN, {
    name: 'processConversationMessageNotification',
    ...TASK,
  })
export const NOTIFICATIONS_DIGEST_DISPATCH_JOB =
  defineBackgroundJob<CommunityActivityDigestDispatchData>(DOMAIN, {
    name: 'processCommunityActivityDigestDispatch',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB =
  defineBackgroundJob<CommunityActivityDigestScheduleData>(DOMAIN, {
    name: 'processCommunityActivityDigestScheduleTick',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_DIGEST_BATCH_JOB = defineBackgroundJob<CommunityActivityDigestBatchData>(
  DOMAIN,
  { name: 'processCommunityActivityDigestBatch', ...TASK, ...RETRY },
)
export const NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB = defineBackgroundJob<CopyrightIntentData>(
  DOMAIN,
  { name: 'processDeliverCopyrightNotice', ...TASK, ...RETRY },
)
export const NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB =
  defineBackgroundJob<CopyrightSweepContinuation>(DOMAIN, {
    name: 'processReconcileCopyrightDeliveryIntents',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB = defineBackgroundJob<CopyrightIntentData>(
  DOMAIN,
  { name: 'processApplyCopyrightAction', ...TASK, ...RETRY, attempts: 5 },
)
export const NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB =
  defineBackgroundJob<CopyrightSweepContinuation>(DOMAIN, {
    name: 'processReconcileCopyrightActionIntents',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB = defineBackgroundJob<EmptyData>(
  DOMAIN,
  { name: 'processCheckCopyrightReviewTarget', ...DISPATCH, ...RETRY },
)
export const NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB = defineBackgroundJob<EmptyData>(DOMAIN, {
  name: 'processSweepCopyrightEvidenceRetention',
  ...DISPATCH,
  ...RETRY,
})
export const NOTIFICATIONS_SUBMIT_DSA_JOB = defineBackgroundJob<DsaStatementSubmissionData>(
  DOMAIN,
  { name: 'processSubmitDsaStatementOfReasons', ...TASK, ...RETRY },
)
export const NOTIFICATIONS_RECONCILE_DSA_JOB = defineBackgroundJob<EmptyData>(DOMAIN, {
  name: 'processReconcileDsaStatementSubmissions',
  ...DISPATCH,
  ...RETRY,
})
export const NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB =
  defineBackgroundJob<ReplayMediaDeliveryRegistryData>(DOMAIN, {
    name: 'processReplayMediaDeliveryRegistry',
    ...DISPATCH,
    ...RETRY,
  })
export const NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB =
  defineBackgroundJob<ApplyMediaDeliveryRegistryRecordData>(DOMAIN, {
    name: 'processApplyMediaDeliveryRegistryRecord',
    ...TASK,
    ...RETRY,
    attempts: 5,
  })
export const NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB =
  defineBackgroundJob<ReconcileMediaDeliveryRegistryData>(DOMAIN, {
    name: 'processReconcileMediaDeliveryRegistry',
    ...DISPATCH,
    ...RETRY,
  })

export const NOTIFICATIONS_JOBS = [
  NOTIFICATIONS_RECONCILE_POST_JOB,
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
  NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
  NOTIFICATIONS_DELETE_JOB,
  NOTIFICATIONS_FOLLOW_JOB,
  NOTIFICATIONS_REFERRAL_SIGNUP_JOB,
  NOTIFICATIONS_REFERRAL_CLICK_JOB,
  NOTIFICATIONS_CONVERSATION_MESSAGE_JOB,
  NOTIFICATIONS_DIGEST_DISPATCH_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
  NOTIFICATIONS_DIGEST_BATCH_JOB,
  NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB,
  NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB,
  NOTIFICATIONS_SUBMIT_DSA_JOB,
  NOTIFICATIONS_RECONCILE_DSA_JOB,
  NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB,
  NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
] as const
