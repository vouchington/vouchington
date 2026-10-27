import {
  cleanupDeliveredMembershipEntitlementEffects,
  cleanupEndedMembershipRenewalNotices,
  cleanupTerminalGooglePlayAcknowledgments,
  type MembershipOperationalCleanupOptions,
} from './cleanup-membership-operational.mts'

type MembershipOperationalFamily =
  | 'deliveredMembershipEntitlementEffects'
  | 'endedMembershipRenewalNotices'
  | 'terminalGooglePlayAcknowledgments'

type CleanupPage = { deleted: number; hasMore: boolean }

/** A continuation passes only the families that exceeded the previous run's cap. */
export async function cleanupMembershipOperational(
  options: Record<MembershipOperationalFamily, MembershipOperationalCleanupOptions>,
  activeFamilies?: readonly string[],
): Promise<Record<MembershipOperationalFamily, CleanupPage>> {
  const idle: CleanupPage = { deleted: 0, hasMore: false }
  const active = (family: MembershipOperationalFamily) =>
    activeFamilies === undefined || activeFamilies.includes(family)
  const deliveredMembershipEntitlementEffects = active('deliveredMembershipEntitlementEffects')
    ? await cleanupDeliveredMembershipEntitlementEffects(
        options.deliveredMembershipEntitlementEffects,
      )
    : idle
  const endedMembershipRenewalNotices = active('endedMembershipRenewalNotices')
    ? await cleanupEndedMembershipRenewalNotices(options.endedMembershipRenewalNotices)
    : idle
  const terminalGooglePlayAcknowledgments = active('terminalGooglePlayAcknowledgments')
    ? await cleanupTerminalGooglePlayAcknowledgments(options.terminalGooglePlayAcknowledgments)
    : idle
  return {
    deliveredMembershipEntitlementEffects,
    endedMembershipRenewalNotices,
    terminalGooglePlayAcknowledgments,
  }
}
