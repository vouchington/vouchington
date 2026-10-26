import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import {
  enqueueContinueReconcilePostNotifications,
  enqueueContinueReconcileRssFeedItemNotifications,
  enqueueContinueContentVisibility,
} from '@queues/notifications/enqueues'
import {
  backgroundHandler,
  backgroundContinuationHandler,
  backgroundDataHandler,
  backgroundSweepHandler,
} from '@queues/background/enqueues/define-handler'
import {
  NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
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
    processPagedDispatcher(job, {
      dispatcher: 'notifications',
      cursorKey: 'userId',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const result = await processors.processReconcilePostNotifications({ ...job.data, pageSize })
        if (result.nextVisibilityCursor)
          await enqueueContinueContentVisibility({
            postId: job.data.postId,
            changeId: job.data.changeId,
            after: result.nextVisibilityCursor,
          })
        return {
          result,
          ...(result.nextAfterUserId
            ? {
                next: {
                  postId: job.data.postId,
                  changeId: job.data.changeId,
                  afterUserId: result.nextAfterUserId,
                },
              }
            : {}),
        }
      },
      enqueueNext: enqueueContinueReconcilePostNotifications,
    }),
  ),
  backgroundHandler(NOTIFICATIONS_RECONCILE_RSS_FEED_ITEM_JOB, job =>
    processPagedDispatcher(job, {
      dispatcher: 'notifications',
      cursorKey: 'userId',
      target: background,
      targetName: 'background',
      readAndDispatch: async pageSize => {
        const result = await processors.processReconcileRssFeedItemNotifications({
          ...job.data,
          pageSize,
        })
        if (result.nextVisibilityCursor)
          await enqueueContinueContentVisibility({
            rssFeedItemId: job.data.rssFeedItemId,
            changeId: job.data.changeId,
            after: result.nextVisibilityCursor,
          })
        return {
          result,
          ...(result.nextAfterUserId
            ? {
                next: {
                  rssFeedItemId: job.data.rssFeedItemId,
                  changeId: job.data.changeId,
                  afterUserId: result.nextAfterUserId,
                },
              }
            : {}),
        }
      },
      enqueueNext: enqueueContinueReconcileRssFeedItemNotifications,
    }),
  ),
  backgroundDataHandler(
    NOTIFICATIONS_CONTENT_VISIBILITY_JOB,
    processors.processReconcileContentVisibility,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_DELIVER_PUSH_INTENT_JOB,
    processors.processDeliverNotificationPushIntent,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
    processors.processReconcileNotificationPushIntents,
  ),
  backgroundDataHandler(NOTIFICATIONS_DELETE_JOB, processors.processDeleteNotification),
  backgroundDataHandler(NOTIFICATIONS_FOLLOW_JOB, processors.processFollowNotification),
  backgroundDataHandler(
    NOTIFICATIONS_REFERRAL_SIGNUP_JOB,
    processors.processReferralSignupNotification,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_REFERRAL_CLICK_JOB,
    processors.processReferralClickNotification,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_CONVERSATION_MESSAGE_JOB,
    processors.processConversationMessageNotification,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_DIGEST_DISPATCH_JOB,
    processors.processCommunityActivityDigestDispatch,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
    processCommunityActivityDigestScheduleTick,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_DIGEST_BATCH_JOB,
    processors.processCommunityActivityDigestBatch,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_DELIVER_COPYRIGHT_NOTICE_JOB,
    processors.processDeliverCopyrightNotice,
  ),
  backgroundContinuationHandler(
    NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
    processors.processReconcileCopyrightDeliveryIntents,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_APPLY_COPYRIGHT_ACTION_JOB,
    processors.processApplyCopyrightAction,
  ),
  backgroundContinuationHandler(
    NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
    processors.processReconcileCopyrightActionIntents,
  ),
  backgroundSweepHandler(
    NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB,
    processors.processCheckCopyrightReviewTarget,
  ),
  backgroundSweepHandler(
    NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB,
    processors.processSweepCopyrightEvidenceRetention,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_SUBMIT_DSA_JOB,
    processors.processSubmitDsaStatementOfReasons,
  ),
  backgroundSweepHandler(
    NOTIFICATIONS_RECONCILE_DSA_JOB,
    processors.processReconcileDsaStatementSubmissions,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_REPLAY_MEDIA_REGISTRY_JOB,
    processors.processReplayMediaDeliveryRegistry,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_APPLY_MEDIA_REGISTRY_RECORD_JOB,
    processors.processApplyMediaDeliveryRegistryRecord,
  ),
  backgroundDataHandler(
    NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
    processors.processReconcileMediaDeliveryRegistry,
  ),
]
