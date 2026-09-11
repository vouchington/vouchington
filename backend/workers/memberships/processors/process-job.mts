import type { Job } from 'glide-mq'
import type { MembershipsJobs } from '@queues/memberships/types'
import { reconcileAppleNotification } from '@services/memberships/apple/reconcile-notification'
import {
  deliverPendingMembershipEntitlementEffects,
  expireElapsedMembershipsBatch,
  reconcileStripeMembershipCatalog,
} from '@services/memberships'
import { processMembershipVerification } from '@services/memberships/apple'
import { recoverAppleNotifications } from './apple-notification-recovery.mts'
import { processRenewalNotificationCheckDispatcher } from './renewal-notification-check.mts'
import { processSendRenewalPriceIncreaseEmail } from './send-renewal-price-increase-email.mts'
import { processStripeWebhook, recoverStripeWebhooks } from './stripe-webhook.mts'
import { recoverMembershipVerifications } from './verification-recovery.mts'

type MembershipJobProcessors = {
  deliverMembershipEntitlementEffects: typeof deliverPendingMembershipEntitlementEffects
  expireElapsedMemberships: typeof expireElapsedMembershipsBatch
  processAppleNotification: typeof reconcileAppleNotification
  processMembershipVerification: typeof processMembershipVerification
  processRenewalNotificationCheckDispatcher: typeof processRenewalNotificationCheckDispatcher
  processSendRenewalPriceIncreaseEmail: typeof processSendRenewalPriceIncreaseEmail
  processStripeWebhook: typeof processStripeWebhook
  recoverMembershipVerifications: typeof recoverMembershipVerifications
  recoverAppleNotifications: typeof recoverAppleNotifications
  recoverStripeWebhooks: typeof recoverStripeWebhooks
  reconcileStripeMembershipCatalog: typeof reconcileStripeMembershipCatalog
}

const PROCESSORS: MembershipJobProcessors = {
  deliverMembershipEntitlementEffects: deliverPendingMembershipEntitlementEffects,
  expireElapsedMemberships: expireElapsedMembershipsBatch,
  processAppleNotification: reconcileAppleNotification,
  processMembershipVerification,
  processRenewalNotificationCheckDispatcher,
  processSendRenewalPriceIncreaseEmail,
  processStripeWebhook,
  recoverMembershipVerifications,
  recoverAppleNotifications,
  recoverStripeWebhooks,
  reconcileStripeMembershipCatalog,
}

export async function processMembershipJob(job: Job, processors = PROCESSORS): Promise<void> {
  switch (job.name as MembershipsJobs) {
    case 'deliverMembershipEntitlementEffects':
      await processors.deliverMembershipEntitlementEffects()
      return
    case 'expireElapsedMemberships':
      await processors.expireElapsedMemberships()
      return
    case 'processMembershipVerification':
      await processors.processMembershipVerification(job.data.verificationId)
      return
    case 'processAppleNotification':
      await processors.processAppleNotification(job.data)
      return
    case 'recoverMembershipVerifications':
      await processors.recoverMembershipVerifications()
      return
    case 'recoverAppleNotifications':
      await processors.recoverAppleNotifications()
      return
    case 'processStripeWebhook':
      await processors.processStripeWebhook(
        job.data,
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      )
      return
    case 'recoverStripeWebhooks':
      await processors.recoverStripeWebhooks()
      return
    case 'reconcileStripeMembershipCatalog':
      await processors.reconcileStripeMembershipCatalog()
      return
    case 'processRenewalNotificationCheck':
      await processors.processRenewalNotificationCheckDispatcher()
      return
    case 'processSendRenewalPriceIncreaseEmail':
      await processors.processSendRenewalPriceIncreaseEmail(job.data)
      return
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}
