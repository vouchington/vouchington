import { cleanupMembershipOperational } from './cleanup-membership-operational-families.mts'
import {
  cleanupAbandonedMembershipPurchaseIntents,
  cleanupTerminalStripeEventWork,
} from './cleanup-payment-operations.mts'
import { cleanupPaymentLedgers } from './cleanup-payment-ledgers.mts'
import {
  cleanupEmailAddressLoginTokens,
  cleanupExpiredUserSessions,
  cleanupPhoneNumberLoginTokens,
  cleanupWebPushSubscriptionTombstones,
} from './cleanup-auth-sessions.mts'
import { cleanupOldPendingNotificationPushIntents } from './cleanup-notification-push-intents.mts'
import { applyRetentionLimits } from './cleanup-options.mts'
import type { DataRetentionLimits } from './config.mts'
import type { DataRetentionCleanupFamily } from './cleanup-run-family.mts'
import type { DataRetentionCleanupOptions } from './cleanup-run-options.mts'
import type { DataRetentionCleanupResult } from './cleanup-run-result.mts'

export async function cleanupMembershipAuthFamilies(
  limits: DataRetentionLimits,
  options: DataRetentionCleanupOptions,
): Promise<
  Pick<
    DataRetentionCleanupResult,
    | 'deliveredMembershipEntitlementEffects'
    | 'endedMembershipRenewalNotices'
    | 'terminalGooglePlayAcknowledgments'
    | 'terminalStripeEventWork'
    | 'abandonedMembershipPurchaseIntents'
    | 'paymentLedgers'
    | 'emailAddressLoginTokens'
    | 'phoneNumberLoginTokens'
    | 'expiredUserSessions'
    | 'oldPendingNotificationPushIntents'
    | 'webPushSubscriptionTombstones'
  >
> {
  const active = (family: DataRetentionCleanupFamily) =>
    options.families === undefined || options.families.includes(family)
  const withLimits = (overrides: { batchSize?: number; maxBatches?: number } | undefined) =>
    applyRetentionLimits(limits, overrides)

  const {
    deliveredMembershipEntitlementEffects,
    endedMembershipRenewalNotices,
    terminalGooglePlayAcknowledgments,
  } = await cleanupMembershipOperational(
    {
      deliveredMembershipEntitlementEffects: withLimits(
        options.deliveredMembershipEntitlementEffects,
      ),
      endedMembershipRenewalNotices: withLimits(options.endedMembershipRenewalNotices),
      terminalGooglePlayAcknowledgments: withLimits(options.terminalGooglePlayAcknowledgments),
    },
    options.families?.filter(
      family =>
        options.activeMembershipFamilies === undefined ||
        options.activeMembershipFamilies.includes(family),
    ) ?? options.activeMembershipFamilies,
  )
  const terminalStripeEventWork = active('terminalStripeEventWork')
    ? await cleanupTerminalStripeEventWork(withLimits(options.terminalStripeEventWork))
    : { deleted: 0, hasMore: false, cursorId: null }
  const abandonedMembershipPurchaseIntents = active('abandonedMembershipPurchaseIntents')
    ? await cleanupAbandonedMembershipPurchaseIntents(
        withLimits(options.abandonedMembershipPurchaseIntents),
      )
    : { deleted: 0, hasMore: false, cursorId: null }
  const paymentLedgers = active('paymentLedgers')
    ? await cleanupPaymentLedgers(
        withLimits(options.paymentLedgers),
        options.paymentLedgers?.recordIds,
      )
    : []
  const emailAddressLoginTokens = active('emailAddressLoginTokens')
    ? await cleanupEmailAddressLoginTokens(withLimits(options.emailAddressLoginTokens))
    : { deleted: 0, hasMore: false, continuation: null }
  const phoneNumberLoginTokens = active('phoneNumberLoginTokens')
    ? await cleanupPhoneNumberLoginTokens(withLimits(options.phoneNumberLoginTokens))
    : { deleted: 0, hasMore: false, continuation: null }
  const expiredUserSessions = active('expiredUserSessions')
    ? await cleanupExpiredUserSessions(withLimits(options.expiredUserSessions))
    : { deleted: 0, hasMore: false, continuation: null }
  const oldPendingNotificationPushIntents = active('oldPendingNotificationPushIntents')
    ? await cleanupOldPendingNotificationPushIntents(
        withLimits(options.oldPendingNotificationPushIntents),
      )
    : { deleted: 0, hasMore: false, continuation: null }
  // Receipts for surviving intents retain their subscription generation. Each page checks them
  // again under the subscription row lock, even after the push-intent cleanup above has run.
  const webPushSubscriptionTombstones = active('webPushSubscriptionTombstones')
    ? await cleanupWebPushSubscriptionTombstones(withLimits(options.webPushSubscriptionTombstones))
    : { deleted: 0, hasMore: false, continuation: null }
  return {
    deliveredMembershipEntitlementEffects,
    endedMembershipRenewalNotices,
    terminalGooglePlayAcknowledgments,
    terminalStripeEventWork,
    abandonedMembershipPurchaseIntents,
    paymentLedgers,
    emailAddressLoginTokens,
    phoneNumberLoginTokens,
    expiredUserSessions,
    oldPendingNotificationPushIntents,
    webPushSubscriptionTombstones,
  }
}
