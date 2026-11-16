import { defineBackgroundJob } from './define-job.mts'
import { DISPATCH, RETRY } from './notifications-job-options.mts'
import {
  NOTIFICATIONS_DOMAIN as DOMAIN,
  type CopyrightDeliveryReconcileChannel,
  type CopyrightDeliveryReconcileData,
} from './notifications-domain.mts'

/** One lane bounds the load of every copyright delivery reconcile channel together. */
export const COPYRIGHT_DELIVERY_RECONCILE_ORDERING = {
  key: 'notifications:copyright-delivery-reconcile',
} as const

function channelJob(name: string) {
  return defineBackgroundJob<CopyrightDeliveryReconcileData>(DOMAIN, {
    name,
    ...DISPATCH,
    ...RETRY,
    ordering: COPYRIGHT_DELIVERY_RECONCILE_ORDERING,
  })
}

/** Each channel is its own job with its own cursor, cap, retry and failure. */
export const NOTIFICATIONS_RECONCILE_COPYRIGHT_DELIVERY_JOBS = {
  in_app: channelJob('processReconcileCopyrightInAppDeliveryIntents'),
  email: channelJob('processReconcileCopyrightEmailDeliveryIntents'),
} as const satisfies Record<CopyrightDeliveryReconcileChannel, ReturnType<typeof channelJob>>
