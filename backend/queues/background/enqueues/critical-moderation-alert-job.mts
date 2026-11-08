import { pagedDispatchJobOptions } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { defineBackgroundJob } from './define-job.mts'
import { BULK_ORDERING, DISPATCH } from './notifications-job-options.mts'
import {
  NOTIFICATIONS_DOMAIN,
  type CriticalModerationAlertNotificationData,
} from './notifications-domain.mts'

export const NOTIFICATIONS_CRITICAL_MODERATION_ALERT_JOB =
  defineBackgroundJob<CriticalModerationAlertNotificationData>(NOTIFICATIONS_DOMAIN, {
    name: 'processCriticalModerationAlertNotification',
    ...DISPATCH,
    ordering: BULK_ORDERING,
    ...pagedDispatchJobOptions('notifications'),
  })
