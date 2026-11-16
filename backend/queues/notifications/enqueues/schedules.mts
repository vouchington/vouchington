import { defineScheduledJobManifest } from '@modules/scheduled-job-manifest'
import { toSchedulerTemplateOptions } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  NOTIFICATIONS_CHECK_COPYRIGHT_REVIEW_TARGET_JOB,
  NOTIFICATIONS_DIGEST_SCHEDULE_TICK_JOB,
  NOTIFICATIONS_RECONCILE_DSA_JOB,
  NOTIFICATIONS_RECONCILE_MEDIA_REGISTRY_JOB,
  NOTIFICATIONS_RECONCILE_PUSH_INTENTS_JOB,
  NOTIFICATIONS_ADMIT_COPYRIGHT_CASE_PURGE_JOB,
} from '@queues/background/enqueues/notifications-jobs'
import { NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOBS } from '@queues/background/enqueues/notifications-copyright-delivery-jobs'
import { NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOBS } from '@queues/background/enqueues/notifications-copyright-action-jobs'
import {
  COPYRIGHT_ACTION_RECONCILE_STAGES,
  COPYRIGHT_DELIVERY_RECONCILE_CHANNELS,
} from '@queues/background/enqueues/notifications-domain'
import type { BackgroundJobDefinition } from '@queues/background/types'
import {
  enqueueCheckCopyrightReviewTarget,
  enqueueCommunityActivityDigestScheduleTick,
  enqueueReconcileCopyrightActionStage,
  enqueueReconcileCopyrightDeliveryChannel,
  enqueueReconcileMediaDeliveryRegistry,
  enqueueReconcileNotificationPushIntents,
  enqueueCopyrightCasePurgeAdmission,
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
  ...COPYRIGHT_ACTION_RECONCILE_STAGES.map(stage => ({
    schedulerId: `copyright-action-reconciliation-${stage}`,
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_COPYRIGHT_ACTION_JOBS[stage]),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: `copyright-action-reconciliation-${stage}`,
        schedule: '*/5 * * * *',
        description: `Re-enqueue pending copyright action work for the ${stage} stage`,
        trigger: () => enqueueReconcileCopyrightActionStage(stage),
      },
    ] as const,
  })),
  ...COPYRIGHT_DELIVERY_RECONCILE_CHANNELS.map(channel => ({
    schedulerId: `copyright-delivery-reconciliation-${channel}`,
    repeat: { pattern: '*/5 * * * *' },
    template: scheduleTemplate(NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOBS[channel]),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: `copyright-delivery-reconciliation-${channel}`,
        schedule: '*/5 * * * *',
        description: `Re-enqueue pending copyright legal delivery intents for the ${channel} channel`,
        trigger: () => enqueueReconcileCopyrightDeliveryChannel(channel),
      },
    ] as const,
  })),
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
    schedulerId: 'copyright-case-purge-admission',
    repeat: { pattern: '17 4 * * *' },
    template: scheduleTemplate(NOTIFICATIONS_ADMIT_COPYRIGHT_CASE_PURGE_JOB),
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'copyright-case-purge-admission',
        schedule: '17 4 * * *',
        description: 'Admit bounded copyright case purge pages after the legal retention window',
        trigger: enqueueCopyrightCasePurgeAdmission,
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
