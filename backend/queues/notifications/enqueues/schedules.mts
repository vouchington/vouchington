import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB,
  NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB,
  NOTIFICATIONS_RECONCILE_DSA_JOB,
  NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
  NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import {
  enqueueCheckCopyrightReviewTarget,
  enqueueCommunityActivityDigestScheduleTick,
  enqueueReconcileCopyrightActionIntents,
  enqueueReconcileCopyrightDeliveryIntents,
  enqueueReconcileMediaDeliveryRegistry,
  enqueueReconcileNotificationPushIntents,
  enqueueSweepCopyrightEvidenceRetention,
  enqueueReconcileDsaStatementSubmissions,
} from '../enqueues.mts'

function scheduleTemplate(job: BackgroundJobDefinition) {
  return {
    name: job.name,
    data: {},
    opts: toSchedulerTemplateOptions({ ...job.options }),
  }
}

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'copyright-dsa-statement-reconciliation',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_DSA_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-dsa-statement-reconciliation',
        schedule: '*/5 * * * *',
        description: 'Enqueue due public copyright DSA statement submissions',
        trigger: enqueueReconcileDsaStatementSubmissions,
      },
    ],
  },
  {
    schedulerId: 'media-delivery-registry-reconciliation',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'media-delivery-registry-reconciliation',
        schedule: '*/5 * * * *',
        description: 'Converge exact media delivery tuples to the edge registry',
        trigger: enqueueReconcileMediaDeliveryRegistry,
      },
    ],
  },
  {
    schedulerId: 'copyright-action-reconciliation',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-action-reconciliation',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue pending copyright media action intents',
        trigger: enqueueReconcileCopyrightActionIntents,
      },
    ],
  },
  {
    schedulerId: 'copyright-delivery-reconciliation',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-delivery-reconciliation',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue pending copyright legal delivery intents',
        trigger: enqueueReconcileCopyrightDeliveryIntents,
      },
    ],
  },
  {
    schedulerId: 'copyright-review-target-page',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-review-target-page',
        schedule: '*/5 * * * *',
        description: 'Page Sentry when copyright cases wait past the review target or deadlines',
        trigger: enqueueCheckCopyrightReviewTarget,
      },
    ],
  },
  {
    schedulerId: 'copyright-evidence-retention',
    repeat: { pattern: '17 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_SWEEP_COPYRIGHT_RETENTION_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-evidence-retention',
        schedule: '17 * * * *',
        description:
          'Erase evidence and personal data of copyright cases past retention; no-op while off',
        trigger: enqueueSweepCopyrightEvidenceRetention,
      },
    ],
  },
  {
    schedulerId: 'notification-push-intent-recovery',
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'notification-push-intent-recovery',
        schedule: '*/5 * * * *',
        description: 'Re-enqueue pending browser-push intents after a worker or queue failure',
        trigger: enqueueReconcileNotificationPushIntents,
      },
    ],
  },
  {
    schedulerId: 'community-activity-digest-weekly',
    repeat: { pattern: '0 9 * * 1' },
    template: scheduleTemplate(NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'community-activity-digest-weekly',
        schedule: '0 9 * * 1',
        description: 'Dispatch weekly community activity notifications',
        trigger: enqueueCommunityActivityDigestScheduleTick,
      },
    ],
  },
])
