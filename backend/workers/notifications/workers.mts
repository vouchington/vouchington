import { backgroundHandler } from '@queues/background/enqueues/define-handler'
import {
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB,
  NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB,
  NOTIFICATIONS_CONVERSATION_MESSAGE_JOB,
  NOTIFICATIONS_DELETE_JOB,
  NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
  NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
  NOTIFICATIONS_DIGEST_BATCH_JOB,
  NOTIFICATIONS_DIGEST_DISPATCH_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
  NOTIFICATIONS_FOLLOW_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
  NOTIFICATIONS_RECONCILE_DSA_JOB,
  NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_RECONCILE_POST_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
  NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB,
  NOTIFICATIONS_REFERRAL_CLICK_JOB,
  NOTIFICATIONS_REFERRAL_SIGNUP_JOB,
  NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_SUBMIT_DSA_JOB,
  NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import * as processors from './processors.mts'
import { processCommunityActivityDigestScheduleTick } from './processors/community-activity-digest-schedule.mts'

export const notificationsHandlers = [
  backgroundHandler(NOTIFICATIONS_RECONCILE_POST_JOB, job =>
    processors.processReconcilePostNotifications(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB, job =>
    processors.processReconcileRssFeedItemNotifications(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB, job =>
    processors.processDeliverNotificationPushIntent(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB, job =>
    processors.processReconcileNotificationPushIntents(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_DELETE_JOB, job =>
    processors.processDeleteNotification(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_FOLLOW_JOB, job =>
    processors.processFollowNotification(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_REFERRAL_SIGNUP_JOB, job =>
    processors.processReferralSignupNotification(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_REFERRAL_CLICK_JOB, job =>
    processors.processReferralClickNotification(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_CONVERSATION_MESSAGE_JOB, job =>
    processors.processConversationMessageNotification(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_DIGEST_DISPATCH_JOB, job =>
    processors.processCommunityActivityDigestDispatch(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB, () =>
    processCommunityActivityDigestScheduleTick({}),
  ),
  backgroundHandler(NOTIFICATIONS_DIGEST_BATCH_JOB, job =>
    processors.processCommunityActivityDigestBatch(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB, job =>
    processors.processDeliverCopyrightNotice(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB, job =>
    processors.processReconcileCopyrightDeliveryIntents({}, job.data),
  ),
  backgroundHandler(NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB, job =>
    processors.processApplyCopyrightAction(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB, job =>
    processors.processReconcileCopyrightActionIntents({}, job.data),
  ),
  backgroundHandler(NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB, () =>
    processors.processCheckCopyrightReviewTarget(),
  ),
  backgroundHandler(NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB, () =>
    processors.processSweepCopyrightEvidenceRetention(),
  ),
  backgroundHandler(NOTIFICATIONS_SUBMIT_DSA_JOB, job =>
    processors.processSubmitDsaStatementOfReasons(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_DSA_JOB, () =>
    processors.processReconcileDsaStatementSubmissions(),
  ),
  backgroundHandler(NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB, job =>
    processors.processReplayMediaDeliveryRegistry(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB, job =>
    processors.processApplyMediaDeliveryRegistryRecord(job.data),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB, job =>
    processors.processReconcileMediaDeliveryRegistry(job.data),
  ),
]
